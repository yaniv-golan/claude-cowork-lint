# Claude Cowork Runtime Contract Checker — Spec

> **Status:** Draft v0. Internal design doc. Not a user-facing README.
> **Audience:** Implementers and reviewers of this project. Assumes familiarity with Claude.app, Cowork (the product), and Operon (the runtime — see naming notes below).
>
> **Implementation status (post-rewrite):** This document was authored
> Python-first and still contains Python pseudocode (e.g. `from ccrcc import …`),
> a stale CLI name (`ccrcc check`), and a Python-leaning v0.4 release scope.
> The shipped implementation is Node-native: the CLI is `claude-cowork-lint` /
> `cwlint`, the library API is TypeScript (`import { checkRepo, loadDefaultSpec }
> from "claude-cowork-lint"`), and v0.4 was the Node rewrite, not "language
> bindings". The runtime-contract model, survivor-set formula, rule semantics,
> extraction strategy, and schema-lock discipline below are all still
> authoritative — only the surrounding tooling vocabulary is stale. See
> [`RETROSPECTIVE.md`](RETROSPECTIVE.md) for the full obsolete-decisions log
> and [`ROADMAP.md`](ROADMAP.md) for the actual release scopes.

## Problem

Skill and plugin authors targeting Cowork (`@anthropic-ai/operon-core`, the VM-backed sandbox runtime that powers Cowork sessions) keep shipping skills with declarations that don't survive Cowork's runtime filters. Two real classes of incident:

1. **Tool-allowlist mismatches.** Sub-agents declare tools (`Bash`, `Task`, `AskUserQuestion`) that Cowork's async-dispatch filter strips at runtime. The skill works on Claude Code main thread, fails silently in Cowork.
2. **Env-passthrough confusion.** Author sets `MY_VAR` on the desktop process, expects it inside the kernel, doesn't know about the `MGn` allowlist. Or relies on `HOME`/`USER`/`LOGNAME`/`TMPDIR` which the runtime explicitly deletes.

Today, authors discover these by:

- Reading the binary directly (this project's sister repo, `claude-code-internals`, does that for Claude Code; equivalent for Cowork doesn't exist publicly).
- Hitting the bug in production and post-morteming.
- Hand-rolling allowlist constants in their own test code that drift the moment Cowork ships a runtime change.

This project ships **a versioned, machine-readable spec of the Cowork runtime contract** and **a checker** that validates a skill/plugin/agent repo against it.

## Non-goals

- **Not a behavioral simulator.** We don't model PTY recording, bridge transcripts, classifier pipelines, or session-fork semantics. Those are fragile to upstream changes and best validated end-to-end against the real runtime.
- **Not a replacement for e2e tests.** The checker catches *contract violations* (declared tool ∉ allowlist, declared env var ∉ passthrough). It cannot catch *semantic* bugs (skill logic is wrong, prompt is bad, schema is malformed in ways the contract doesn't describe).
- **Not an Anthropic-published artifact.** This is a community-maintained reverse-engineering project. The spec is best-effort, derived from the live binary; it carries no upstream guarantee. If Anthropic ships their own runtime test harness, this project should defer to it.
- **Not a runtime patch.** We don't modify Claude.app, the Operon kernel, or any binary. Read-only inspection only.

## Naming

- **Cowork** — the user-facing product label (Settings → Cowork tab, "Claude Cowork", `CLAUDE_CODE_SESSION_KIND="bg"`).
- **Operon** — the internal runtime label (`OPERON_*` env vars, `~/.operon/operon.db`, `@anthropic-ai/operon-core` workspace package, `OperonSecrets` IPC).
- This project is named "cowork-runtime-contract-checker" because that's the public-facing concept. Internally, the spec describes the **Operon contract**. Both names should appear in user-facing copy with a one-line gloss; never substitute one for the other silently.

## Architecture

Four components, each ships independently:

```
┌─────────────────────────────────────────────────┐
│ 1. Spec files (versioned, machine-readable)     │
│    contracts/cowork-v<bundle-version>.json      │
└─────────────────────────────────────────────────┘
            ▲                          │
            │                          ▼
┌──────────────────────┐    ┌──────────────────────┐
│ 2. Bundle extractor  │    │ 3. Checker (CLI/lib) │
│    (Claude.app →     │    │    (skill repo →     │
│     spec.json diff)  │    │     pass/fail)       │
└──────────────────────┘    └──────────────────────┘
            ▲
            │
┌──────────────────────┐
│ 4. Upstream watcher  │
│    (CI: new Claude   │
│     release → PR)    │
└──────────────────────┘
```

### Component 1: Spec files

**Location:** `contracts/cowork-v<MAJOR>.<MINOR>.<PATCH>.json` (one file per Claude.app bundle version we've extracted).

**Format:** JSON. Stable schema across spec versions; the *contents* change with each runtime version, the *shape* should not.

**Schema (v0):**

```json
{
  "$schema": "https://github.com/yaniv-golan/claude-cowork-runtime-contract-checker/schemas/v0.json",
  "spec_version": "0",
  "claude_app_version": "1.6259.1",
  "operon_core_version": "2.1.121",
  "extracted_at": "2026-05-09T14:00:00Z",
  "extracted_from": {
    "asar_path": "/Applications/Claude.app/Contents/Resources/app.asar",
    "sha256": "<bundle-hash>"
  },

  "subagent_tool_filter": {
    "_description": "All built-in tools pass through one filter function (`LW8` in v2.1.138 CLI bundle) parameterized by `{tools, isBuiltIn, isAsync, permissionMode}`. The function applies up to 5 layers in order: (1) MCP fast-path, (2) edit-tools-in-plan-mode, (3) drop set, (4) non-builtin extra drop set, (5) async-only allowlist. MCP tools (`name.startsWith('mcp__') || isMcp===true`) ALWAYS pass — they're never gated by the allowlists.",
    "filter_function": {
      "symbol_v2_1_138": "LW8",
      "symbol_v2_1_119": "gz8",
      "signature": "({tools, isBuiltIn, isAsync=false, permissionMode}) => Tool[]",
      "logic": [
        "if hG(tool) return true                     // MCP fast-path: name starts with 'mcp__' or isMcp===true",
        "if A1(tool, ExitPlanMode) && permissionMode==='plan' return true",
        "if drop_set.has(tool.name) return false",
        "if !isBuiltIn && non_builtin_drop_set.has(tool.name) return false",
        "if isAsync && !async_allowlist.has(tool.name): { fallback then return false }",
        "return true"
      ]
    },
    "drop_set": {
      "description": "Always dropped, regardless of dispatch mode. Includes EnterPlanMode/ExitPlanMode (plan-mode is gated separately), TaskOutput (parent-only), Agent (legacy alias), AskUserQuestion (interactive — no parent listening), WaitForMcpServers (init-time only).",
      "names": ["TaskOutput", "ExitPlanMode", "EnterPlanMode", "Agent", "AskUserQuestion", "WaitForMcpServers"],
      "symbol_v2_1_138": "$zH",
      "symbol_v2_1_119": "R3H"
    },
    "non_builtin_extra_drop_set": {
      "description": "Additional drops applied only when `isBuiltIn === false`. v2.1.138 ships `M58 = new Set([...$zH])` — same contents as drop_set; the separation exists to allow divergence in future versions.",
      "names": ["TaskOutput", "ExitPlanMode", "EnterPlanMode", "Agent", "AskUserQuestion", "WaitForMcpServers"],
      "symbol_v2_1_138": "M58"
    },
    "async_dispatch_allowlist": {
      "description": "When `isAsync=true`, ONLY these names pass (in addition to MCP tools and the plan-mode pass-through). Used for `/background`, `/bg`, `/fork` and other async dispatch paths.",
      "names": [
        "Read", "WebSearch", "TodoWrite", "Grep", "WebFetch", "Glob",
        "Bash", "PowerShell",
        "Edit", "Write", "NotebookEdit",
        "Skill", "StructuredOutput", "ToolSearch",
        "EnterWorktree", "ExitWorktree",
        "REPL", "Monitor", "TaskStop"
      ],
      "count": 19,
      "spread_member_v2_1_138": "$2 = [Vq=Bash, h9=PowerShell]",
      "spread_member_v2_1_119": "VW = [wq=Bash, D9=PowerShell]",
      "symbol_v2_1_138": "Ys_",
      "symbol_v2_1_119": "jQ_",
      "discrepancy_resolution": "Earlier internal docs (claude-code-internals L89 / gist 303b6213b7a33167b3f98b076a5f81ad) claimed 'the async filter strips Bash'. The empirical observation that Bash isn't in a Cowork sub-agent's tool list IS correct. The mechanism explanation IS NOT — `LW8`/`Ys_` does include Bash (via the `...$2 = [Bash, PowerShell]` spread). The actual gate is **`HOST_LOOP_EXCLUDED_BUILTIN_TOOLS`** (`jie` in the desktop bundle): Cowork excludes Bash, NotebookEdit, REPL, JavaScript, and WebFetch from registered built-in tools at the host-loop layer, BEFORE the sub-agent allowlist filter runs. Replacements are registered as MCP tools — `mcp__workspace__bash`, `mcp__workspace__web_fetch`. Empirically reconfirmed May 2026: an actual Cowork sub-agent reports `mcp__workspace__bash` as a *deferred* tool (loadable via ToolSearch), while built-in `Bash` is absent. A host-CLI (CCD-mode) probe DOES show Bash in async sub-agents — because CCD mode doesn't apply the host-loop tool exclusion. The spec must distinguish these two layers; see `host_loop_tool_substitution`."
    },
    "experimental_fallback_allowlist": {
      "description": "When the async filter would reject a tool but `experimentalAgentTeams` flag is enabled (`r9() && PW()`), additional tool names pass.",
      "names": ["TaskCreate", "TaskGet", "TaskList", "TaskUpdate", "SendMessage", "CronCreate", "CronDelete", "CronList"],
      "symbol_v2_1_138": "Up9",
      "symbol_v2_1_119": "lk9",
      "gate": "r9() && PW() — both must return truthy. Resolves to a feature-flag check; not enabled by default."
    },
    "fork_subagent_allowlist": {
      "description": "v2.1.138 introduces a separate, more restrictive allowlist `Fp9` for fork-style subagents (the implicit `kind:'fork'` agent). This is distinct from `Ys_` (async). Three empty spreads (`...[]`) suggest conditionally-populated members under feature flags not yet active.",
      "names": ["Agent", "TaskStop", "SendMessage", "StructuredOutput"],
      "count": 4,
      "conditional_spreads_count": 3,
      "symbol_v2_1_138": "Fp9",
      "introduced_in": "v2.1.138 (or earlier — needs back-trace)"
    },
    "sync_task_tool": {
      "description": "Sync Task-tool sub-agent dispatch is the same `LW8` filter with `isAsync=false`. The `Ys_` allowlist gate is skipped — only the drop_set and non_builtin_extra_drop_set apply. Sync sub-agents see effectively all built-in tools EXCEPT the 6 in the drop set, plus all MCP tools.",
      "effective_filter": "drop_set + non_builtin_extra_drop_set only; allowlist not applied",
      "behaviorally_excludes": ["TaskOutput", "ExitPlanMode", "EnterPlanMode", "Agent", "AskUserQuestion", "WaitForMcpServers"],
      "behaviorally_includes": "everything else from the master tool registry, plus all MCP tools"
    },
    "mcp_tools": {
      "always_pass": true,
      "predicate": "tool.name.startsWith('mcp__') || tool.isMcp === true",
      "predicate_function": "hG (v2.1.138), yJ (v2.1.119)"
    }
  },

  "host_loop_tool_substitution": {
    "_description": "Operates in the desktop bundle (`Claude.app/.../index.js`), not the CLI. When the desktop spawns a Cowork session, it filters its registered built-in tools through a host-loop-safe set BEFORE handing them to the SDK. Tools in `HOST_LOOP_EXCLUDED_BUILTIN_TOOLS` are dropped; the desktop's `workspace` MCP server registers replacements (`mcp__workspace__bash`, `mcp__workspace__web_fetch`). This is THE gate that makes `Bash` empirically unavailable to Cowork sub-agents, not the CLI's `LW8`/`Ys_` filter.",
    "scope": "Cowork mode only (Claude.app spawning `claude --cowork` inside microVM). CCD mode (host CLI without `--cowork`) does NOT apply this substitution — Bash is registered normally in CCD.",
    "vm_substrate_by_platform": {
      "macos": "Apple Hypervisor with bundled disk image (`Claude.app/Contents/Resources/smol-bin.{x64,arm64}.img`). VM lifecycle managed in-process by Claude.app.",
      "windows": "Hyper-V via separately-installed `CoworkVMService` (Windows service running `cowork-svc.exe`). Requires `vmcompute` and `HvHost` services. Service autostart has known reliability issues — see https://github.com/anthropics/claude-code/issues/56772 (and 48661, 48001, 55649).",
      "linux": "<not yet traced — likely KVM-based; check Linux build of Claude.app>"
    },
    "vm_failure_modes": {
      "windows_service_stopped": {
        "user_visible_error": "Workspace unavailable. The isolated Linux environment failed to start.",
        "actual_cause": "CoworkVMService stopped or failed to autostart.",
        "impact": "mcp__workspace__bash dies; file-op tools (Read/Write/Edit/Glob/Grep) and request_cowork_directory continue to work because they don't depend on the VM.",
        "manual_recovery": "Start-Service CoworkVMService (DACL allows interactive user; no elevation needed)."
      }
    },
    "host_loop_safe_set": {
      "_description": "Tools that survive host-loop filtering. PTi(tools) = tools.filter(t => t.startsWith('mcp__') || zvt.includes(t)). MCP tools always pass; built-ins must be in this set.",
      "names": ["Task", "Glob", "Grep", "Read", "Edit", "Write",
                "TodoWrite", "TaskCreate", "TaskUpdate", "TaskGet", "TaskList", "TaskStop",
                "WebSearch", "Skill", "AskUserQuestion", "ToolSearch", "SendUserMessage"],
      "symbol_v1_6259_1": "zvt",
      "filter_fn_symbol_v1_6259_1": "PTi"
    },
    "host_loop_excluded_builtins": {
      "_description": "Built-in tool names that the desktop EXPLICITLY EXCLUDES from registration in Cowork mode. These are the names the desktop bundle considers 'unsafe to run on the host loop'. Each gets an MCP replacement.",
      "names": ["Bash", "NotebookEdit", "REPL", "JavaScript", "WebFetch"],
      "symbol_v1_6259_1": "jie",
      "mcp_replacements": {
        "Bash": "mcp__workspace__bash",
        "WebFetch": "mcp__workspace__web_fetch",
        "_note_others": "NotebookEdit, REPL, JavaScript replacements not yet traced; likely served via the cowork artifact MCP server or absent in async sub-agents (these are interactive notebook/REPL tools — meaningful only in main-loop dispatch)."
      }
    },
    "cowork_builtin_mcp_servers": {
      "_description": "MCP server prefixes the Cowork desktop auto-registers — any tool whose name starts with `mcp__<server>__` for one of these servers is a runtime-supplied built-in, not user-authored. CW009 consumes this list to distinguish 'unregistered third-party server' (flag) from 'auto-registered Cowork built-in' (clean). Source of truth: structural enumeration of `mcp__<server>__<tool>` literals in the v1.6608.2 desktop bundle. v1.6608.2 ships 9 names; earlier internal docs only listed 3 (`workspace`, `cowork`, `cowork-onboarding`), causing CW009 to silently false-positive references to the other six.",
      "names": [
        "cowork",
        "cowork-onboarding",
        "mcp-registry",
        "plugins",
        "radar",
        "scheduled-tasks",
        "skills",
        "terminal",
        "workspace"
      ],
      "verified_against": "claude.app@1.6608.2 desktop bundle (.vite/build/index.js)"
    },
    "renderer_dependent_extra_drops": {
      "_description": "Additional drops applied when the session is a 'Bridge' or 'Dispatch child' (i.e. async sub-agent dispatch). On top of host-loop exclusion.",
      "names": ["AskUserQuestion", "mcp__cowork-onboarding__show_onboarding_role_picker",
                "mcp__cowork__allow_cowork_file_delete", "mcp__cowork__present_files",
                "mcp__cowork__launch_code_session", "mcp__cowork__create_artifact",
                "mcp__cowork__update_artifact", "mcp__cowork__propose_skills"],
      "symbol_v1_6259_1": "Akt",
      "trigger": "Bridge session OR Dispatch child session — see `(a||c)` in LocalAgentModeSessionManager log line 'Bridge session: disabling renderer-dependent tools'"
    },
    "deferred_tools_tier": {
      "_description": "Cowork exposes some tools in a 'deferred' tier — name visible in the registry, schema loaded on demand via ToolSearch. `mcp__workspace__bash` is the canonical example: it doesn't appear in a sub-agent's immediate tool list, but ToolSearch with query 'bash' or 'select:mcp__workspace__bash' loads its schema, after which it's callable. Skill authors targeting Cowork should declare deferred tools and use ToolSearch as a precondition for calling them.",
      "implication_for_skill_authors": "Probing 'tools available to my Cowork sub-agent' must enumerate BOTH the immediate set AND the deferred tier (queryable via ToolSearch). Tools missing from the immediate list may still be callable."
    }
  },

  "kernel_env_passthrough": {
    "description": "Host env vars that survive into the Cowork VM kernel shell (bash/python/R). Vars not in this allowlist are dropped before kernel spawn.",
    "allowlist": [
      "HOME", "USER", "LOGNAME", "TERM", "LANG", "LC_ALL", "LC_CTYPE", "TZ", "PATH",
      "CONDA_PREFIX", "VIRTUAL_ENV", "R_LIBS_USER", "R_HOME",
      "PYTHONDONTWRITEBYTECODE", "PYTHONUNBUFFERED", "PYTHONUTF8",
      "SANDBOX_RUNTIME", "TMPDIR", "COO_CPUS", "PYTHON_CPU_COUNT",
      "PIP_INDEX_URL", "UV_INDEX_URL", "npm_config_registry",
      "HTTP_PROXY", "HTTPS_PROXY", "http_proxy", "https_proxy",
      "ALL_PROXY", "all_proxy", "NO_PROXY", "no_proxy",
      "FTP_PROXY", "ftp_proxy", "RSYNC_PROXY", "rsync_proxy",
      "OPERON_SECRET_VARS"
    ],
    "deleted_after_filter": ["HOME", "USER", "LOGNAME", "TMPDIR"],
    "source_symbol": "MGn (allowlist), vKA (filter fn)",
    "extra_env_override_path": {
      "description": "extraEnv argument bypasses the allowlist post-filter. Populated only by the user_secrets pipeline — see `user_secrets_injection`.",
      "callers": ["m7A (interactive VM spawn)", "VMSpawnProvider.exec (one-shot)"],
      "non_callers": ["Grr.spawn (long-lived kernel subprocess — no extraEnv)"]
    }
  },

  "user_secrets_injection": {
    "description": "The only first-class mechanism for injecting custom env vars into the kernel. Storage is encrypted SQLite; injection happens at frame-init via _loadUserSecrets() then per-cell via Gnn (python/R) or extraEnv (bash).",
    "ipc_channels": {
      "list":   "$eipc_message$_<UUID>_$_claude.operon_$_OperonSecrets_$_list",
      "create": "$eipc_message$_<UUID>_$_claude.operon_$_OperonSecrets_$_create",
      "update": "$eipc_message$_<UUID>_$_claude.operon_$_OperonSecrets_$_update",
      "remove": "$eipc_message$_<UUID>_$_claude.operon_$_OperonSecrets_$_remove"
    },
    "renderer_bridge": {
      "expose_path": "window[\"claude.operon\"].OperonSecrets",
      "origin_check": "y() — top frame at https://claude.ai or https://preview.claude.ai"
    },
    "validation": {
      "_status_1_6608_2": "DEPRECATED — the Operon kernel-secrets subsystem (OperonSecrets IPC, claude.operon renderer bridge, this validation regime) was removed in Claude.app 1.6608.2. Zero occurrences of `OperonSecrets` or `claude.operon` in the desktop bundle (see docs/internal/CONTRACT-AUDIT-1.6608.2.md). The field is kept here as historical record and continues to drive CW010's reserved-name matching, but CW010 is now severity:info / status:deprecated because the runtime no longer enforces these rules. Plugin userConfig is validated today by the extension-manifest schema, which we do not currently model.",
      "name_regex": "^[A-Za-z][A-Za-z0-9_]*$",
      "name_uppercased": true,
      "name_max_length": 128,
      "value_max_bytes": 65536,
      "reserved_name_sets": ["PXi", "YXi", "HXi"],
      "reserved_name_literals": ["ANTHROPIC_API_KEY", "DATABASE_URL", "SECRET_KEY"]
    },
    "providers": ["generic", "github", "aws", "gcp", "literature"],
    "storage": {
      "default_path": "~/.operon/operon.db",
      "override_env": "OPERON_DB_PATH",
      "encryption": "Electron safeStorage (macOS Keychain bundle ACL com.anthropic.claudefordesktop)"
    }
  },

  "session_kinds": {
    "description": "Discriminator on CLAUDE_CODE_SESSION_KIND. The CLI reads this to route session behavior; skill authors should not assume kind='bg' implies kind='fork' or vice versa.",
    "recognized_values": ["bg", "daemon", "daemon-worker"],
    "main_session_value": "(unset / undefined)",
    "_note": "ar() in v2.1.138 returns the env value only if it is exactly 'bg', 'daemon', or 'daemon-worker'; anything else returns undefined. N7() === ar() === 'bg' is the public predicate for 'is this a background session'."
  },

  "bg_context_env_strip": {
    "description": "Two distinct strip lists are applied at different boundaries. List A is used when re-entering a non-BG context from a BG session (clean parent env). List B is used when spawning a BG spare worker, to remove terminal/IDE-detection vars so the worker doesn't think it's interactive.",
    "list_a_explicit_deletes": {
      "names": [
        "CLAUDE_CODE_OAUTH_TOKEN",
        "CLAUDE_CODE_SUBSCRIPTION_TYPE",
        "CLAUDE_CODE_RATE_LIMIT_TIER",
        "CLAUDE_CODE_SESSION_KIND",
        "CLAUDE_BG_SOURCE",
        "CLAUDE_BG_ISOLATION",
        "CLAUDE_BG_BACKEND",
        "CLAUDE_CODE_SESSION_NAME",
        "CLAUDE_CODE_RESUME_INTERRUPTED_TURN"
      ],
      "additional_pattern": "all env keys starting with 'OTEL_'",
      "count": 9,
      "source_offset_v2_1_138": "claude-cli-2.1.138-bundle.js:4001218",
      "_note_on_count": "Earlier internal docs cited '5-var BG-context env-strip'. That count was for an older version; v2.1.138 has 9 explicit + OTEL_*."
    },
    "list_b_terminal_strip_for_spare_worker": {
      "description": "Used by `xr3()` when spawning a BG spare worker. Strips terminal/IDE-detection env so the worker doesn't render interactive UI.",
      "symbol_v2_1_138": "rp8",
      "names_partial": [
        "CLAUDE_CODE_QUESTION_PREVIEW_FORMAT", "GITHUB_ACTIONS", "CLAUDECODE",
        "CLAUDE_CODE_SESSION_ID", "CLAUDE_CODE_EXECPATH",
        "TERM_PROGRAM", "TERM_PROGRAM_VERSION", "__CFBundleIdentifier",
        "KITTY_WINDOW_ID", "WT_SESSION", "KONSOLE_VERSION", "VTE_VERSION",
        "ZED_TERM", "ZELLIJ", "TMUX", "TMUX_PANE", "STY", "LC_TERMINAL",
        "SSH_CONNECTION", "SSH_CLIENT", "SSH_TTY", "COLORFGBG", "CURSOR_TRACE_ID",
        "GIT_ASKPASS", "SSH_ASKPASS", "SSH_ASKPASS_REQUIRE",
        "VSCODE_GIT_ASKPASS_MAIN", "VSCODE_GIT_ASKPASS_NODE"
      ],
      "_note": "Truncated in this trace (~30+ entries with conditional spreads `...[]`). Full extraction needed."
    },
    "bg_context_env_set": {
      "description": "Vars SET (not stripped) when launching a BG worker.",
      "always": {
        "CLAUDE_CODE_SESSION_KIND": "bg",
        "CLAUDE_BG_BACKEND": "daemon",
        "CLAUDE_ENABLE_STREAM_WATCHDOG": "1",
        "FORCE_COLOR": "3",
        "COLORTERM": "truecolor",
        "BROWSER": "true"
      },
      "conditional": {
        "CLAUDE_BG_SOURCE": "from spawn options",
        "CLAUDE_JOB_DIR": "per-job directory path",
        "CLAUDE_CODE_SESSION_NAME": "from seed.name or seed.intent",
        "CLAUDE_BG_RENDEZVOUS_SOCK": "rendezvous socket path",
        "CLAUDE_BG_ISOLATION": "set to 'worktree' when worktree-isolation mode is enabled"
      }
    }
  },

  "secret_unset_list": {
    "description": "OPERON_SECRET_VARS — names unset by python/R kernel bootstrap before user code runs. NOT an output scrubber. Output scrubbing uses decrypted scrubValues separately.",
    "names": [
      "ANTHROPIC_API_KEY", "ANTHROPIC_API_KEY_ENCRYPTION_KEY",
      "AWS_SECRET_ACCESS_KEY", "AWS_SESSION_TOKEN",
      "AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT", "AZURE_DOCUMENT_INTELLIGENCE_KEY",
      "CLAUDE_OAUTH_CLIENT_SECRET", "CORE_API_KEY", "DATABASE_URL",
      "ELSEVIER_API_KEY", "ELSEVIER_INST_TOKEN", "FDA_API_KEY",
      "GCS_CONFIG_BUCKET", "GEMINI_API_KEY", "GOOGLE_APPLICATION_CREDENTIALS",
      "NCBI_API_KEY", "OAUTH_CALLBACK_URL", "OAUTH_ENCRYPTION_KEY",
      "OPENAI_API_KEY", "OPENROUTER_API_KEY",
      "OPERON_AMPLITUDE_API_KEY_DEV", "OPERON_AMPLITUDE_API_KEY_PROD",
      "OPERON_CONTACT_EMAIL", "OPERON_EZPROXY_COOKIE", "OPERON_EZPROXY_URL",
      "REDIS_URL", "SEMANTIC_SCHOLAR_API_KEY", "SPRINGER_API_KEY"
    ],
    "count": 28,
    "symbol_v1_6259_1": "ljt",
    "extracted_from": "Claude.app/Contents/Resources/app.asar:.vite/build/index.js"
  },

  "skill_frontmatter_invariants": {
    "description": "Skill manifest fields the runtime checks at load time. Violating these will silently disable the skill or change its dispatch path. Anchored on the CLI runtime parser (claude-code-cli@2.1.138), NOT the desktop's manifest-display `dh(r, ...)` accessor — the latter only reads name/description/argument-hint/user-invocable for chooser UI, while the former is the layer that actually drives runtime behaviour.",
    "required_fields": ["user-invocable"],
    "forbidden_fields": [
      {
        "field": "disable-model-invocation",
        "value": true,
        "reason": "CLI enforcement (claude-code-cli@2.1.138): `if (z.disableModelInvocation && !tE7(O, _)) return skill_invoke_model_disabled` — when true, model-driven skill invocation is blocked entirely. Round-1 of the audit mis-anchored this on the desktop frontmatter parser (which doesn't read the field); round-3 verification corrected it to the CLI bundle, where the kebab-form key is normalised to camelCase and gated at the skill_invoke handler shown above."
      }
    ],
    "env_var_substitution": {
      "supported_form": "${CLAUDE_PLUGIN_ROOT}",
      "unsupported_form": "$CLAUDE_PLUGIN_ROOT",
      "reason": "Bare form depends on shell-expansion timing not guaranteed for skill subprocesses."
    }
  },

  "cli_launch_args_in_cowork": {
    "_description": "Args the desktop passes when spawning the in-VM CLI. These constrain what the CLI loads, beyond what the bundle's runtime gates do. Verified by inspecting the [Spawn:create] log line in `~/Library/Logs/Claude/cowork_vm_node.log` (or `%APPDATA%\\Claude\\logs\\cowork_vm_node.log` on Windows).",
    "always_passed": [
      "--output-format stream-json",
      "--verbose",
      "--input-format stream-json",
      "--permission-mode default",
      "--allow-dangerously-skip-permissions",
      "--include-partial-messages",
      "--replay-user-messages",
      "--setting-sources=user"
    ],
    "per_plugin": {
      "flag": "--plugin-dir <vm-mount-path>",
      "_note": "One per installed plugin. Path resolved to the VM-side mount under /sessions/<id>/mnt/.local-plugins/cache/<marketplace>/<plugin>/<version>/ or .remote-plugins/<plugin-id>/."
    },
    "consequences": {
      "plugin_hooks_excluded": {
        "description": "`--setting-sources=user` restricts settings resolution to user scope (~/.claude/settings.json). Plugin-scoped hooks (declared in a plugin's `hooks/hooks.json`) are silently excluded from hook discovery — they DO NOT FIRE in Cowork sessions. Plugin skills, slash commands, and MCP servers still load via the per-plugin `--plugin-dir` args, but the hook lifecycle is dead from the plugin's perspective.",
        "scope": "All Cowork dispatch levels (top-level main session and forked sub-agents).",
        "verified_empirically": "8 MB of recent cowork_vm_node.log + 2 MB coworkd.log show zero 'hook' references for any Cowork session (named pattern <adj>-<adj>-<word>); the same desktop process logs `[Stop hook] Query completed` for CCD sessions (pattern local_<uuid>) on the same host.",
        "upstream_tracking": [
          {
            "issue": "https://github.com/anthropics/claude-code/issues/16288",
            "title": "Plugin hooks not loaded from external hooks.json file",
            "scope": "general CLI race — most hook dispatchers call hook execution without `await loadPluginHooks()` first; affects CCD intermittently"
          },
          {
            "issue": "https://github.com/anthropics/claude-code/issues/27398",
            "title": "Cowork: Plugin hooks from hooks/hooks.json never fire — --setting-sources user excludes plugin scope",
            "status": "Closed as duplicate of #16288",
            "scope": "Cowork-specific scope exclusion via the launch flag — separate from #16288's race; even fixing the race won't help Cowork until the launch flag is changed too"
          }
        ],
        "workaround": "Move hooks from `<plugin>/hooks/hooks.json` to `~/.claude/settings.json` (user scope). Loads in both Cowork and CCD."
      }
    }
  }
}
```

**Versioning:**

- One spec file per Claude.app bundle version. Never edit a published file. New version → new file → new contract.
- The `spec_version` field is the *schema* version, separate from the contract version. Bumping `spec_version` means a breaking change to the JSON shape itself; bump cautiously.
- Symlink `contracts/cowork-latest.json` → newest extracted file.

**Coverage tiers:** the spec describes what the *contract is*, not what the runtime *does*. We track three tiers per field:

- `verified`: extracted directly from the bundle and confirmed empirically.
- `documented`: stated in Anthropic public docs / changelog and consistent with binary extraction.
- `inferred`: deduced from binary-string archaeology, not yet empirically run.

Every field carries a `coverage` tag (omitted from the schema sketch above for brevity; add as a sibling `_meta.coverage` map).

### Component 2: Bundle extractor

**Purpose:** Given a path to a Claude.app bundle, produce a candidate spec file.

**Inputs:**
- Claude.app path (default `/Applications/Claude.app`)
- Optional: previous spec file (for diff-mode output)

**Outputs:**
- `contracts/cowork-v<version>.json` (full extraction)
- `contracts/diff-v<old>-to-v<new>.md` (human-readable changelog)

**Mechanics:**

1. Read `Contents/Info.plist` for `CFBundleShortVersionString`.
2. `asar extract Resources/app.asar /tmp/...`.
3. Read `package.json` for `@anthropic-ai/operon-core` version.
4. Apply named extractors against the desktop bundle (`.vite/build/{index.js, mainView.js}`) and the CLI bundle (extracted from the Bun SEA binary at `~/.local/share/claude/versions/<X>/claude`). Each extractor is a small Python script with a documented *behavioral* anchor (not a minified-symbol anchor — those change every build):

   **Desktop bundle extractors** (run against Claude.app `app.asar`):
   - `extract_kernel_env_allowlist.py` — anchor: `new Set([...])` with members `"HOME"`, `"PATH"`, `"OPERON_SECRET_VARS"`. Resolves to current build's symbol (`MGn` in v1.6259.1).
   - `extract_kernel_env_filter_fn.py` — anchor: function with body containing `delete t.HOME, delete t.USER, delete t.LOGNAME, delete t.TMPDIR`. Captures the allowlist intersection logic.
   - `extract_secret_unset_list.py` — anchor: array containing `"ANTHROPIC_API_KEY"`, `"OPENAI_API_KEY"`, `"OPERON_EZPROXY_COOKIE"` (the unique combination identifies `ljt`).
   - `extract_user_secrets_validation.py` — anchor: function whose body contains `.toUpperCase().trim()` followed by length check and the regex `^[A-Za-z][A-Za-z0-9_]*$`. Captures `KXi`/`xXi`/`JXi`.
   - `extract_user_secrets_ipc.py` — anchor: string `"$eipc_message$_*_$_claude.operon_$_OperonSecrets_$_"` with method suffixes `list/create/update/remove`.
   - `extract_origin_check_fn.py` — anchor: function body containing `"https://claude.ai"` and `"https://preview.claude.ai"` literals + frame-token comparison.
   - `extract_cli_spawn_args.py` — anchor: the `[Spawn:create]` log line construction in the desktop bundle, OR the SDK options object passed to the in-VM CLI launcher. Capture the always-passed argv and the per-plugin `--plugin-dir` template. Critical: capture the `--setting-sources=user` flag — that's the gate behind `cli_launch_args_in_cowork.consequences.plugin_hooks_excluded`. Cross-validate against an actual `cowork_vm_node.log` line on a running install.

   **CLI bundle extractors** (run against extracted Bun SEA JS):
   - `extract_subagent_filter_fn.py` — anchor: function with destructured signature `({tools:H,isBuiltIn:_,isAsync:q=!1,permissionMode:K})`. Captures the filter (`LW8` in v2.1.138 / `gz8` in v2.1.119).
   - `extract_subagent_allowlists.py` — anchor: from inside the filter function, locate the `new Set([...])` referenced as the async-allowlist gate. Resolve all member symbols to string literals (members like `H9="Read"`, `Vq="Bash"`, etc.).
   - `extract_mcp_fastpath_fn.py` — anchor: `function ...(H){return H.name?.startsWith("mcp__")||H.isMcp===!0}` — the unique signature identifies `hG`/`yJ`.
   - `extract_bg_env_strip.py` — anchor: a sequence of `delete $.CLAUDE_CODE_*` / `delete $.CLAUDE_BG_*` operations; capture the explicit list and the `for(...startsWith("OTEL_")...)` pattern.
   - `extract_session_kinds.py` — anchor: function `function ar(){...if(H==="bg"||H==="daemon"||H==="daemon-worker")return H}` — captures the recognized values.
   - `extract_fork_subagent_allowlist.py` — anchor: `new Set([...])` near `FORK_SUBAGENT_TYPE`/`FORK_AGENT` symbols. Captures `Fp9`.

   Each extractor outputs a JSON fragment; a top-level merger composes them.

5. **Diff mode**: when a previous spec is provided, emit a markdown diff highlighting added/removed/changed entries per category. Used by the upstream watcher to populate PR descriptions.

**Robustness:**

- Each extractor pins to a *behavioral* anchor (unique string literals, function signatures, regex patterns) — not minified symbol names. **Minified symbols change every Claude release.** v2.1.119 → v2.1.138 saw every symbol rename: `gz8 → LW8`, `jQ_ → Ys_`, `R3H → $zH`, `wq → Vq`, `D9 → h9`, etc. An extractor anchored on the symbol name will break on the next release; one anchored on `({tools, isBuiltIn, isAsync, permissionMode})` survives.
- Each extractor includes a self-test: "given the known-good v2.1.119 and v2.1.138 bundles checked into `tests/fixtures/`, do I produce the expected fragment?" Both must pass. If they don't on a new bundle, re-anchor before running against production data.
- Extractor output is reviewed before being committed to `contracts/`. Never auto-merge an extraction; the upstream watcher opens a PR for human review.

### Component 3: Checker

**Purpose:** Validate a skill/plugin/agent repo against a chosen spec version.

**CLI:**

```
ccrcc check <repo-path> [--spec contracts/cowork-vX.Y.Z.json]
                         [--strict|--warn-only]
                         [--format text|json|sarif]
                         [--ignore RULE_ID]
```

Default spec is `contracts/cowork-latest.json`. Default mode is `--warn-only` (CI exit 0 with warnings); `--strict` makes any violation exit-1.

**Library API:**

```python
from ccrcc import Checker, load_spec

spec = load_spec("contracts/cowork-v2.1.121.json")
checker = Checker(spec)
report = checker.check_repo(Path("/path/to/skill-repo"))
for finding in report.findings:
    print(finding.rule_id, finding.path, finding.message)
```

**Rules (each with a stable `RULE_ID`):**

| Rule ID | Severity | Description |
|---|---|---|
| `CW001` | error | Agent's `tools:` declaration includes a tool not in async-dispatch allowlist. |
| `CW002` | error | Agent has neither `Write` nor `Edit` after async-dispatch filter (no persistence path). |
| `CW003` | warn | SKILL.md frontmatter uses bare `$CLAUDE_PLUGIN_ROOT` instead of `${CLAUDE_PLUGIN_ROOT}`. |
| `CW004` | error | SKILL.md frontmatter has `disable-model-invocation: true`. |
| `CW005` | warn | SKILL.md missing `user-invocable: true` in frontmatter. |
| `CW006` | warn | Hook command references a tool name not in any allowlist (typo detector). |
| `CW007` | error | Hook command references env var not in kernel passthrough allowlist. (Skill ships expecting the var; runtime won't pass it.) |
| `CW008` | warn | Sub-agent dispatch cue (heuristic regex) followed within 30 lines by a fenced ```bash block. v0.4.0 failure pattern. |
| `CW009` | info | Skill (or agent) references `mcp__<server>__<tool>` for a server not registered in any `.mcp.json` and not a Cowork built-in (`host_loop_tool_substitution.cowork_builtin_mcp_servers.names` — falls back to the legacy 3-name set `cowork`, `cowork-onboarding`, `workspace` on pre-1.6608.2 contracts). |
| `CW010` | info (deprecated) | Plugin `userConfig` declares an option whose name overlaps a legacy Operon reserved literal (`ANTHROPIC_API_KEY`, `DATABASE_URL`, `SECRET_KEY`) or fails the legacy uppercased / regex / ≤128-char rules. The Operon kernel-secrets subsystem was removed in Claude.app 1.6608.2; this rule is retained as a hygiene check. |
| `CW011` | warn | Plugin has `hooks/hooks.json` (or any plugin-scoped hook declaration). Will not fire in Cowork sessions due to `--setting-sources=user` excluding plugin scope. See [#16288](https://github.com/anthropics/claude-code/issues/16288) / [#27398](https://github.com/anthropics/claude-code/issues/27398). Recommend documenting the limitation, providing a `~/.claude/settings.json` fallback snippet for users, or moving lifecycle hooks (Stop / SubagentStop / SessionStart / PostToolUse) out of the plugin entirely. |
| `CW012` | info | Plugin's `hooks/hooks.json` declares specific hook events known to be silently broken in Cowork: `SessionStart`, `Stop`, `SubagentStart`, `SubagentStop`, `UserPromptSubmit`, `PostToolUse`. Higher-confidence variant of `CW011`. |

Severity legend: `error` blocks `--strict` runs; `warn` is reported but non-blocking; `info` is documentation-only.

**Suppression:** rules can be silenced per-line via comment markers. Each rule documents its own marker form. Suppressions require a justification string (any non-empty trailing text).

```markdown
# Note: Bash here is fine — main-thread block, not sub-agent dispatch.
<!-- ccrcc: ignore CW008 reason="main-thread block, not sub-agent" -->
```python
import subprocess
...
```
```

**Output formats:**

- `text` (default): human-readable, grouped by file.
- `json`: machine-parseable, stable across versions.
- `sarif`: GitHub code-scanning compatible. Enables PR-line annotations in the GitHub UI.

### Component 4: Upstream watcher

**Purpose:** detect new Claude.app releases, run the extractor, open a PR adding/updating a spec file.

**Trigger:** GitHub Actions cron, daily.

**Steps:**

1. Hit the Claude.app update feed (URL stable across Squirrel.Mac auto-update). Extract latest version.
2. Compare against `contracts/cowork-latest.json` `claude_app_version`. If equal, exit.
3. Download the new Claude.app bundle (DMG → mount → copy → unmount). 50–200 MB; cache in actions cache by version.
4. Run the extractor against the new bundle.
5. Run the differ against the old spec.
6. Open a PR with:
   - Title: `Cowork contract: v<old> → v<new>`
   - Body: rendered diff markdown.
   - Files: new `contracts/cowork-v<new>.json`, updated `contracts/cowork-latest.json` symlink.
   - Auto-assign maintainer for review.
7. **Never auto-merge.** The PR is for human review — extractor self-test is necessary but not sufficient evidence.

**Rate limit:** Anthropic ships Claude.app at ~1–2x per week; watcher will run daily but PR ~1x per week. Skip PRs for builds with no contract-relevant changes (`extracted_at` is the only diff).

**Failure modes:**
- Extractor self-test fails → open an *issue* (not a PR) titled `Extractor broken on Claude.app v<X>`. Maintainer must re-anchor extractor before next run produces valid output.
- Bundle download fails (network, hash mismatch, signing change) → retry once, then issue.

## Versioning of this project

Semantic versioning across two surfaces:

1. **Spec schema version** (`spec_version` field): bump on JSON-shape breaking changes. Drives a major bump of the project version.
2. **Project version**: standard semver. Major = schema-breaking. Minor = new rule, new extractor, new CLI flag. Patch = bugfix.

Spec content versions (`claude_app_version`) are *data* and don't bump the project version.

Compatibility: the checker library version `M.N.x` must be able to read any spec file with the same `spec_version`. We pin one schema version per project major version; never silently upgrade users across schema breaks.

## Release scopes (incremental delivery)

**v0.1 — vendored static spec.** One hand-curated spec file (the current `cowork-v2.1.121.json`), the checker (Component 3), no extractor, no watcher. Useful immediately to skill authors who want to pin against a known runtime version. Scope: ~1 week.

**v0.2 — bundle extractor.** Component 2. Operator runs it manually against a Claude.app bundle, commits the resulting JSON. Scope: ~1 week.

**v0.3 — upstream watcher.** Component 4. CI fully automates contract updates as PRs. Scope: ~1 week.

**v0.4 — language bindings.** Beyond Python: a Node.js port for skill authors using TS, a JSON-schema export for any-language consumers. Scope: ~2 weeks.

**v1.0 — public stability.** Lock the JSON schema (`spec_version: 1`), publish to PyPI, document upgrade contract. Pre-1.0 is best-effort.

## Open questions / risks

1. **~~Discrepancy: Bash empirical-vs-binary status~~ — PARTIALLY RESOLVED, with revision.** First-pass resolution (host-CLI probe in CCD mode) suggested Bash works in async sub-agents. **A subsequent probe in actual Cowork showed otherwise — Bash is NOT in a Cowork sub-agent's immediate tool list.** The mechanism is NOT the `LW8`/`Ys_` filter (Bash IS in that allowlist via spread). The actual gate is `HOST_LOOP_EXCLUDED_BUILTIN_TOOLS` in the desktop bundle: Cowork excludes `Bash, NotebookEdit, REPL, JavaScript, WebFetch` from registered built-ins and substitutes MCP equivalents (`mcp__workspace__bash`, etc.). See `host_loop_tool_substitution`. The L89 lesson and gist 303 had the empirical claim right but the mechanism wrong; corrections needed for both. **Lesson learned for the spec design: a 'sub-agent contract' that only inspects the CLI bundle misses Cowork-specific desktop-side substitutions. Spec must extract from BOTH bundles and explicitly model the host-loop layer.**

2. **Cowork desktop vs Claude Code CLI scope.** "Cowork" combines two binaries with overlapping but distinct contracts:
   - **Claude.app desktop** (Electron: `MGn` env allowlist, `OperonSecrets` IPC, `safeStorage` encryption, kernel spawn).
   - **Claude Code CLI** (the `claude` binary at `~/.local/share/claude/versions/<X>/`: sub-agent filter `LW8`/`Ys_`, `BG_*` env strip, session-kind discriminator).

   The CLI is what runs *inside* the desktop (the desktop spawns it via `pathToClaudeCodeExecutable`). The two binaries version separately — Claude.app `1.6259.1` ships with operon-core `2.1.121` and bundles its own runtime, while the CLI is at v2.1.138 today. The spec must carry **both** version stamps and extract from both bundles. Initial sketch addressed in `claude_app_version` + `operon_core_version` but should add `claude_cli_version` as a sibling.

3. **License / redistribution of extracted contracts.** We're publishing facts about Anthropic's runtime, not Anthropic's code. Should be fine under reverse-engineering carve-outs, but a CONTRIBUTING.md should explicitly state: extractors only ever read shipped binaries the user already has installed; no Anthropic IP is redistributed; spec files are statements of fact, not code.

4. **Anthropic shipping their own contract spec.** If they do, this project should adopt it as upstream truth and shift to a "renderer / linter" role. Keep the architecture loose enough to do that — don't bake Anthropic's absence into the design.

5. **Fork-subagent allowlist `Fp9` introduction.** v2.1.138 has a separate `Fp9 = {Agent, TaskStop, SendMessage, StructuredOutput}` plus 3 conditionally-populated empty spreads. v2.1.119 didn't have `Fp9`. Need to back-trace which release introduced this and what the conditional spreads contain (likely `tengu_*` flag-gated tool names).

## Resolved (verified against v2.1.138 CLI bundle)

- ✅ **Async-dispatch allowlist contents** — 19 names including Bash and PowerShell. Binary-confirmed in both v2.1.119 (`jQ_`) and v2.1.138 (`Ys_`). See `subagent_tool_filter.async_dispatch_allowlist` for the full list.
- ✅ **Sync Task-tool filter** — same `LW8` function with `isAsync=false`, allowlist gate skipped, only drop_set applies. Effective behavior: everything in the master tool registry except 6 dropped names, plus all MCP tools.
- ✅ **MCP tool filter predicate** — `tool.name.startsWith('mcp__') || tool.isMcp === true` (function `hG` v2.1.138 / `yJ` v2.1.119). MCP tools always pass; never gated by the allowlist.
- ✅ **BG-context env strip** — 9 explicit deletes + all `OTEL_*` (in v2.1.138). Earlier "5-var" count was outdated. Plus a separate ~30-entry terminal-detection strip (`rp8`) used for spare worker spawn.
- ✅ **Drop set membership** — TaskOutput, ExitPlanMode, EnterPlanMode, Agent, AskUserQuestion, WaitForMcpServers (6 names; `$zH` in v2.1.138, `R3H` in v2.1.119).
- ✅ **OPERON_SECRET_VARS** full member list (28 names; `ljt` in Claude.app `1.6259.1`).
- ✅ **Plugin-hooks exclusion in Cowork** — desktop spawns the in-VM CLI with `--setting-sources=user`, restricting settings resolution to user scope. Plugin-scoped hooks (declared in a plugin's `hooks/hooks.json`) are silently excluded from discovery; plugin skills/commands/MCP servers still load via per-plugin `--plugin-dir` args. See `cli_launch_args_in_cowork.consequences.plugin_hooks_excluded`. Verified empirically: zero "hook" log lines in 8 MB of recent `cowork_vm_node.log` (Cowork sessions named `<adj>-<adj>-<word>`); Stop hooks DO fire for CCD sessions (named `local_<uuid>`) on the same desktop process. Upstream tracking: [#16288](https://github.com/anthropics/claude-code/issues/16288) (general CLI race) + [#27398](https://github.com/anthropics/claude-code/issues/27398) (Cowork-specific scope exclusion, dup-closed). Two distinct interacting bugs. Workaround documented: move hooks to `~/.claude/settings.json`. New checker rules: `CW011` (warn — plugin has hooks/hooks.json), `CW012` (info — specific event known to be silently broken).

## Reference

- Sister project: `claude-code-internals` (binary archaeology for Claude Code CLI; this project is the same idea but covering Cowork's broader scope: desktop + CLI runtime).
- Live binaries at time of spec: Claude.app `1.6259.1` (operon-core `2.1.121`) + Claude Code CLI `2.1.138`.
- Bundle anchors:
  - Desktop: `/Applications/Claude.app/Contents/Resources/app.asar` → `.vite/build/{index.js, mainView.js}` (16M index.js, 211K mainView.js).
  - CLI: `~/.local/share/claude/versions/<X>/claude` → Bun SEA binary, JS bundle starts at offset of `// Claude Code is a Beta product` marker, ~15M.
- Key extracted symbols (will change every minified build):
  - **Desktop (Claude.app `1.6259.1`)**: `MGn` (kernel env allowlist), `vKA` (kernel env filter fn), `ljt` (secret-unset name list), `KXi` (user-secret name normalizer), `JXi` (reserved-name set), `xXi` (name regex), `Pr` (OperonSecrets bridge object), `Or` (bridge attacher fn), `y` (origin check fn), `Iv`/`CU` (encrypt/decrypt wrappers), `DGn` (SafeStorageCryptoProvider).
  - **CLI (v2.1.138)**: `LW8` (filter fn), `Ys_` (async allowlist), `$zH` (drop set), `M58` (non-builtin drop), `Up9` (experimental fallback), `Fp9` (fork subagent allowlist), `el` (user-tools classifier), `hG` (MCP fast-path predicate), `$2 = [Vq, h9] = [Bash, PowerShell]` (spread spread member), `rp8` (BG terminal-strip).
  - **CLI (v2.1.119, reference for diff)**: `gz8` (filter), `jQ_` (async allowlist), `R3H` (drop set), `LH8` (non-builtin drop), `lk9` (experimental fallback), `Oc` (classifier), `vJ` (MCP fast-path), `VW = [wq, D9] = [Bash, PowerShell]`.
