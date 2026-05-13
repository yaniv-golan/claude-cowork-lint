# `claude-cowork-lint` — Design Spec

The design and runtime-contract model behind `claude-cowork-lint`. Read this
when adding a new rule, refreshing the bundled contract, or extending the
extractor — it's the source-of-truth that rule PRs cite from.

Audience: implementers and reviewers of this project. Assumes familiarity with
Claude.app, Cowork (the product), and Operon (the runtime — see naming notes
below).

## Problem

Skill and plugin authors targeting Cowork (the VM-backed sandbox runtime
inside Claude.app that powers Cowork sessions) keep shipping skills with
declarations that don't survive Cowork's runtime filters. Two real classes of incident:

1. **Tool-allowlist mismatches.** Sub-agents declare tools (`Bash`, `Task`,
   `AskUserQuestion`) that Cowork's async-dispatch filter strips at runtime.
   The skill works on Claude Code main thread, fails silently in Cowork.
2. **Env-passthrough confusion.** Author sets `MY_VAR` on the desktop
   process, expects it inside the kernel, doesn't know about the kernel-env
   allowlist. Or relies on `HOME` / `USER` / `LOGNAME` / `TMPDIR` which the
   runtime explicitly deletes.

Today, authors discover these by:

- Reading the binary directly. The companion project
  [`claude-code-internals`](https://github.com/yaniv-golan/claude-code-internals)
  does that for Claude Code; nothing equivalent exists publicly for Cowork.
- Hitting the bug in production and post-morteming.
- Hand-rolling allowlist constants in their own test code that drift the
  moment Cowork ships a runtime change.

This project ships **a versioned, machine-readable spec of the Cowork
runtime contract** and **a checker** that validates a skill / plugin / agent
repo against it.

## Non-goals

- **Not a behavioral simulator.** We don't model PTY recording, bridge
  transcripts, classifier pipelines, or session-fork semantics. Those are
  fragile to upstream changes and best validated end-to-end against the real
  runtime.
- **Not a replacement for e2e tests.** The checker catches *contract
  violations* (declared tool ∉ allowlist, declared env var ∉ passthrough).
  It cannot catch *semantic* bugs (skill logic is wrong, prompt is bad,
  schema malformed in ways the contract doesn't describe).
- **Not an Anthropic-published artifact.** This is a community-maintained
  reverse-engineering project. The spec is best-effort, derived from the
  live binary; it carries no upstream guarantee. If Anthropic ships their
  own runtime test harness, this project should defer to it.
- **Not a runtime patch.** We don't modify Claude.app, the Operon kernel,
  or any binary. Read-only inspection only.

## Naming

- **Cowork** — the user-facing product label (Settings → Cowork tab,
  "Claude Cowork", `CLAUDE_CODE_SESSION_KIND="bg"`).
- **Operon** — the internal runtime label (`OPERON_*` env vars,
  `~/.operon/operon.db`). The runtime itself is not a separately-published
  package — it's bundled inside Claude.app.
- This project is named "cowork-runtime-contract-checker" because that's the
  public-facing concept. Internally, the spec describes the **Operon
  contract**. Both names should appear in user-facing copy with a one-line
  gloss; never substitute one for the other silently.

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

**Location:** `contracts/cowork-v<MAJOR>.<MINOR>.<PATCH>.json` (one file
per Claude.app bundle version we've extracted). Shipped inside the npm
tarball via `package.json#files` and loaded at runtime via
`loadDefaultSpec()`.

**Format:** JSON. Stable schema across spec versions; the *contents* change
with each runtime version, the *shape* should not.

**Top-level shape:**

```jsonc
{
  "$schema": "https://github.com/yaniv-golan/claude-cowork-lint/schemas/v0.json",
  "spec_version": "0",
  "claude_app_version": "1.6608.2",
  "operon_core_version": "2.1.121",
  "claude_cli_version": "2.1.138",
  "extracted_at": "<ISO 8601>",
  "extracted_from": { "asar_path": "...", "cli_bundle_path": "...", "sha256": "..." },

  // Two distinct runtime gates — see "Two-gate model" below.
  "subagent_tool_filter":         { /* CLI-side: drop_set, async_dispatch_allowlist, ... */ },
  "host_loop_tool_substitution":  { /* desktop-side: HOST_LOOP_EXCLUDED_BUILTIN_TOOLS, replacements, ... */ },

  // Other runtime surfaces the checker reads.
  "kernel_env_passthrough":       { /* allowlist + delete-after-filter set */ },
  "user_secrets_injection":       { /* legacy — see deprecation note below */ },
  "session_kinds":                { /* recognised CLAUDE_CODE_SESSION_KIND values */ },
  "bg_context_env_strip":         { /* env vars stripped at BG-session boundaries */ },
  "secret_unset_list":            { /* OPERON_SECRET_VARS kernel-bootstrap list */ },
  "skill_frontmatter_invariants": { /* required + forbidden fields, env var substitution */ },
  "cli_launch_args_in_cowork":    { /* --setting-sources, per-plugin args, consequences */ }
}
```

See [`contracts/cowork-v1.6608.2.json`](../contracts/cowork-v1.6608.2.json)
for the full shipped contract — that file is the canonical reference for
field shapes and prose.

**Two-gate model** (this is the core architectural decision and the most
common source of confusion):

The Cowork runtime applies two filters in series, in **different processes**:

1. **Desktop-side `HOST_LOOP_EXCLUDED_BUILTIN_TOOLS`** (Claude.app's
   `.vite/build/index.js`) strips `Bash`, `NotebookEdit`, `REPL`,
   `JavaScript`, `WebFetch` from registered built-ins **before** the in-VM
   CLI even starts. Two of the five get an `mcp__workspace__*` replacement
   registered by the desktop's `workspace` MCP server (`Bash` →
   `mcp__workspace__bash`, `WebFetch` → `mcp__workspace__web_fetch`); the
   other three are dropped without any substitute.
2. **CLI-side `async_dispatch_allowlist`** (the in-VM CLI bundle's
   filter function) admits a fixed 19-name set plus anything matching
   `mcp__*`. The `drop_set` overrides everything.

The sub-agent survivor set is therefore:

```
survivors = (async_dispatch_allowlist - host_loop_excluded_builtins) - drop_set + {mcp__*}
```

**Do not collapse the two filters into a flat union.** That was an early
review finding and it produces both false negatives (the union admits Bash,
which the host loop has stripped) and false positives (the union over-rejects
in CCD mode, which doesn't apply the host-loop layer). The spec models them
as distinct fields for a reason; CW001 / CW002 read both.

A useful side-effect of the two-gate split: **CCD mode** (the host CLI
running outside Cowork, without `--cowork`) does *not* apply the desktop's
host-loop layer. Bash is registered normally in CCD. A probe that uses CCD
to discover Cowork's tool environment will get a misleading answer; the
spec must be derived from BOTH bundles. This is also why pre-1.6608.2
audits that anchored only on the CLI bundle missed the host-loop layer
entirely.

**Deferred-tools tier.** Cowork exposes some tools (canonically
`mcp__workspace__bash`) in a *deferred* tier — the name is visible in the
registry but the schema is loaded on demand via `ToolSearch`. Skill authors
targeting Cowork should declare deferred tools and use `ToolSearch` as a
precondition for calling them. Probing "tools available to my Cowork
sub-agent" must enumerate both the immediate set and the deferred tier.

**Versioning:**

- One spec file per Claude.app bundle version. Never edit a published file.
  New version → new file → new contract.
- The `spec_version` field is the *schema* version, separate from the
  contract version. Bumping `spec_version` means a breaking change to the
  JSON shape itself; bump cautiously. `test/unit/schema-lock.test.ts`
  enforces this — bumping the schema is a major-version event for the
  package.
- `contracts/cowork-latest.json` is a symlink-style pointer to the newest
  bundled contract (currently `cowork-v1.6608.2.json`).

**Coverage tiers:** the spec describes what the *contract is*, not what the
runtime *does*. Each field is tagged with a coverage tier (under `_meta.coverage`):

- `verified`: extracted directly from the bundle and confirmed empirically.
- `documented`: stated in Anthropic public docs / changelog and consistent
  with binary extraction.
- `inferred`: deduced from binary-string archaeology, not yet empirically run.

### Component 2: Bundle extractor

**Purpose:** Given a path to a Claude.app bundle, produce a candidate spec
file.

**Inputs:**

- Claude.app path (default `/Applications/Claude.app`).
- Optional: previous spec file (for diff-mode output).

**Outputs:**

- `contracts/cowork-v<version>.json` (full extraction).
- `diff.md` (human-readable changelog vs the previous bundled contract).

**Mechanics:**

1. Read `Contents/Info.plist` for `CFBundleShortVersionString`.
2. `@electron/asar`'s programmatic API extracts `Resources/app.asar` to a
   temp dir (no `npx` boundary).
3. Read the bundle's internal `package.json` for the runtime build
   version (recorded in the contract as `operon_core_version`).
4. Apply named extractors against the desktop bundle
   (`.vite/build/{index.js, mainView.js}`) and the in-VM CLI bundle
   (extracted from the Bun-SEA binary at
   `~/.local/share/claude/versions/<X>/claude`). Each extractor pins to a
   *behavioural* anchor (unique string literal, function signature, regex
   pattern) — **never a minified symbol name**, which rotates every Claude
   release.

   Extractor modules under `src/extractors/`:

   - `host-loop.ts` — anchor: the `HOST_LOOP_EXCLUDED_BUILTIN_TOOLS` set and
     the `mcp__workspace__<tool>` literal enumeration in the desktop bundle.
   - `subagent-filter.ts` — anchor: function signature
     `({tools, isBuiltIn, isAsync, permissionMode})` and the `new Set([...])`
     referenced as the async-allowlist gate inside it.
   - `kernel-env-allowlist.ts` — anchor: `new Set([...])` containing
     `"HOME"`, `"PATH"`, `"OPERON_SECRET_VARS"`.
   - `secret-unset-list.ts` — anchor: array containing
     `"ANTHROPIC_API_KEY"`, `"OPENAI_API_KEY"`, `"OPERON_EZPROXY_COOKIE"`
     (the unique combination identifies the right symbol).

   See [`SPEC-EXTRACTION.md`](SPEC-EXTRACTION.md) for the full extraction
   strategy, including the asar boundary heuristic for CLI bundle
   slicing, the AMBIGUOUS-binding sentinel, and the synthetic /
   real-bundle test split.

5. **Diff mode**: when a previous spec is provided, emit a markdown diff
   highlighting added / removed / changed entries per category. Used by the
   upstream watcher to populate PR descriptions.

**Robustness:**

- Each extractor pins to a behavioural anchor. CLI updates routinely rename
  every minified symbol (e.g. `gz8 → LW8`, `jQ_ → Ys_`, `R3H → $zH`); an
  extractor anchored on `({tools, isBuiltIn, isAsync, permissionMode})`
  survives, one anchored on `LW8` does not.
- Each extractor has a synthetic-fixture test in `test/fixtures/bundles/`
  (fast, hermetic, runs on every PR) and a real-bundle smoke test against
  the most recent shipped Claude.app (calibration check).
- Extractor output is reviewed before being committed to `contracts/`.
  Never auto-merge an extraction; the upstream watcher opens a PR for
  human review.

### Component 3: Checker

**Purpose:** Validate a skill / plugin / agent repo against a chosen spec
version.

**CLI:**

```
cwlint check <repo-path> [--spec contracts/cowork-vX.Y.Z.json]
                          [--strict]
                          [--format text|json|sarif]
                          [--ignore RULE_ID]
                          [--json]
```

Default spec is the bundled `contracts/cowork-latest.json`. Default mode
is warn-only (CI exit `0` with warnings); `--strict` exits `1` if any
error-severity finding tripped. The full stable contract — exit codes,
JSON envelope, error codes, SARIF mapping, suppression markers — lives in
[`CLI.md`](CLI.md).

`cwlint` is the short alias; `claude-cowork-lint` is the descriptive form
for CI yaml. Both binaries are shipped from the same package and have
identical behaviour.

**Library API:**

```ts
import {
  checkRepo,
  loadDefaultSpec,
  loadSpec,
  type Spec,
  type Report,
  type Finding,
  type Severity,
} from "claude-cowork-lint";

const spec = loadDefaultSpec();
const report = checkRepo("./my-skill", spec, { ignore: [] });
for (const finding of report.findings) {
  console.log(finding.ruleId, finding.path, finding.message);
}
```

`Report`, `Finding`, and `Severity` shapes are documented in
[`CLI.md`](CLI.md) — the same `schemaVersion` policy that governs the CLI
JSON output covers the exported TypeScript shapes.

**Rules** (each with a stable `CWxxx` ID, append-only):

| Rule ID | Severity        | Description |
|---------|-----------------|-------------|
| `CW001` | error           | Agent declares a tool stripped by Cowork's runtime gates (host-loop or async-dispatch). |
| `CW002` | error           | Agent has no remaining persistence path (neither `Write` nor `Edit`) after filters. |
| `CW003` | warn            | SKILL.md uses bare `$CLAUDE_PLUGIN_ROOT` / `$CLAUDE_PLUGIN_DATA` instead of `${...}`. |
| `CW004` | error           | SKILL.md frontmatter has `disable-model-invocation: true`. |
| `CW005` | warn            | SKILL.md frontmatter explicitly sets `user-invocable: false`. |
| `CW006` | warn            | Hook command references a tool name not in any allowlist (typo detector). |
| `CW007` | —               | **Reserved indefinitely** — original framing applied the kernel-shell allowlist to the wrong surface; ID preserved so future suppression markers stay valid. |
| `CW008` | warn            | Sub-agent dispatch cue followed within 30 lines by a fenced ` ```bash ` block. |
| `CW009` | info            | Skill (or agent) references `mcp__<server>__<tool>` for a server not registered locally and not a Cowork built-in. |
| `CW010` | info (deprecated) | Plugin `userConfig` declares an option whose name matches a legacy Operon reserved literal. Severity demoted to `info` because the Operon kernel-secrets subsystem was removed in Claude.app 1.6608.2; retained as a hygiene check. |
| `CW011` | warn            | Plugin has `hooks/hooks.json`. Plugin-scoped hooks will not fire in Cowork sessions because the desktop spawns the in-VM CLI with `--setting-sources` excluding plugin scope. |
| `CW012` | info            | Plugin's `hooks/hooks.json` declares specific hook events known silently broken in Cowork. Higher-confidence variant of CW011. |

Severity legend: `error` blocks `--strict` runs; `warn` is reported but
non-blocking; `info` is documentation-only.

**Suppression:** rules can be silenced inline. The marker may sit on the
same line as the offending token, or on the line immediately above. A
`reason="..."` is required; without it the marker is silently ignored.

```markdown
<!-- cwlint: ignore CW008 reason="main-thread block, not sub-agent" -->
```bash
ls
```
```

**Output formats:**

- `text` (default): human-readable, grouped by file.
- `json`: machine-parseable, stable across versions (see
  [`CLI.md`](CLI.md) for the schema).
- `sarif`: GitHub code-scanning compatible. Enables PR-line annotations.

### Component 4: Upstream watcher

**Purpose:** detect new Claude.app releases, run the extractor, open a PR
adding / updating a spec file.

**Trigger:** GitHub Actions cron (daily) plus `workflow_dispatch`.

**Steps:**

1. Read the installed Claude.app's `CFBundleShortVersionString` from
   `Info.plist`.
2. Compare against `contracts/cowork-latest.json`'s `claude_app_version`.
   If equal, exit.
3. Run `@electron/asar`'s programmatic API to extract the bundle into a
   temp dir.
4. Run the extractor pipeline against the new bundle, compose a candidate
   contract, compute a structured diff against the bundled one, and write
   a PR-body markdown.
5. Upload the candidate + diff as a CI artifact for **human review**.

**Never auto-merge.** Extractor self-tests are necessary but not sufficient
evidence that a new contract is correct — a contract bump can quietly
invalidate a rule's anchor without breaking the extractor. The
`cwlint doctor` subcommand audits per-rule anchor staleness against a
candidate contract; the canonical post-refresh workflow is documented in
[`SPEC-EXTRACTION.md`](SPEC-EXTRACTION.md#contract-refresh-policy).

**Failure modes:**

- Extractor self-test fails → open an *issue* (not a PR) titled
  `Extractor broken on Claude.app v<X>`. Maintainer must re-anchor
  extractor before next run produces valid output.
- Bundle download / extraction fails → retry once, then issue.

## Versioning of this project

Two surfaces, both following semver:

1. **Spec schema version** (`spec_version` field): bump on JSON-shape
   breaking changes. Drives a major bump of the project version.
2. **Project version**: standard semver. Major = schema-breaking. Minor =
   new rule, new extractor, new CLI flag. Patch = bugfix.

Spec content versions (`claude_app_version`, `claude_cli_version`) are
*data* and don't bump the project version.

Compatibility: the checker library version `M.N.x` must be able to read any
spec file with the same `spec_version`. We pin one schema version per
project major version; never silently upgrade users across schema breaks.

## Open questions / risks

1. **Cowork desktop vs Claude Code CLI scope.** Cowork combines two
   binaries with overlapping but distinct contracts:
   - **Claude.app desktop** (Electron): host-loop tool substitution,
     kernel-env allowlist, kernel spawn.
   - **Claude Code CLI** (the `claude` binary inside the VM): sub-agent
     filter, BG-context env strip, session-kind discriminator.

   The CLI is what runs *inside* the desktop (the desktop spawns it via
   `pathToClaudeCodeExecutable`). The two binaries version separately — the
   spec carries both version stamps (`claude_app_version` +
   `claude_cli_version`) and extracts from both bundles.

2. **License / redistribution of extracted contracts.** We publish *facts
   about* Anthropic's runtime, not Anthropic's code. This should be fine
   under reverse-engineering carve-outs, but `CONTRIBUTING.md` states
   explicitly: extractors only ever read shipped binaries the user already
   has installed; no Anthropic IP is redistributed; spec files are
   statements of fact, not code.

3. **Anthropic shipping their own contract spec.** If they do, this
   project should adopt it as upstream truth and shift to a "renderer /
   linter" role. The architecture is loose enough to do that — we don't
   bake Anthropic's absence into the design.

4. **Fork-subagent allowlist evolution.** The CLI bundle ships a
   `fork_subagent_allowlist` field that is conditionally populated under
   feature flags not yet active. As those flags ship, the allowlist will
   grow; the extractor needs to keep up.

## Resolved (verified against the bundled contract)

- ✅ **Async-dispatch allowlist contents** — 19 names including `Bash` and
  `PowerShell`. Binary-confirmed against multiple CLI versions.
- ✅ **Sync Task-tool filter** — same filter function with `isAsync=false`,
  allowlist gate skipped, only the `drop_set` applies. Effective
  behaviour: everything in the master tool registry except the 6 dropped
  names, plus all MCP tools.
- ✅ **MCP tool fast-path** — `tool.name.startsWith('mcp__') || tool.isMcp
  === true`. MCP tools always pass; never gated by the allowlist.
- ✅ **BG-context env strip** — 9 explicit deletes (`CLAUDE_CODE_*`,
  `CLAUDE_BG_*`) plus all `OTEL_*` in CLI 2.1.138. A separate ~30-entry
  terminal-detection strip is applied at BG spare-worker spawn.
- ✅ **Drop set membership** — `TaskOutput`, `ExitPlanMode`,
  `EnterPlanMode`, `Agent`, `AskUserQuestion`, `WaitForMcpServers`.
- ✅ **OPERON_SECRET_VARS** full member list (28 names).
- ✅ **Plugin-hooks exclusion in Cowork** — desktop spawns the in-VM CLI
  with `--setting-sources` excluding plugin scope. Plugin-scoped hooks
  (declared in a plugin's `hooks/hooks.json`) are silently excluded from
  discovery. Upstream tracking:
  [#16288](https://github.com/anthropics/claude-code/issues/16288) (general
  CLI race) and
  [#27398](https://github.com/anthropics/claude-code/issues/27398)
  (Cowork-specific scope exclusion, closed as a duplicate). Two distinct
  interacting bugs. Workaround documented: move hooks to
  `~/.claude/settings.json` (user scope). New checker rules: `CW011`
  (warn — plugin has hooks/hooks.json), `CW012` (info — specific event
  known to be silently broken).

## Reference

- **Live bundles at the time of the v1.6608.2 contract refresh:**
  Claude.app `1.6608.2` (runtime build `2.1.121`) + Claude Code CLI `2.1.138`.
- **Bundle locations:**
  - Desktop: `/Applications/Claude.app/Contents/Resources/app.asar` →
    `.vite/build/{index.js, mainView.js}`.
  - In-VM CLI: `~/.local/share/claude/versions/<X>/claude` (Bun-SEA
    binary).
- **Companion project:**
  [`claude-code-internals`](https://github.com/yaniv-golan/claude-code-internals)
  applies the same binary-archaeology approach to the Claude Code CLI in
  isolation. This project covers Cowork's broader scope — desktop +
  in-VM CLI together — because the two-gate model can't be modelled from
  either bundle alone.
- **Extracted minified-symbol names rotate every release.** The bundled
  contract files annotate symbols (`MGn`, `Ys_`, `LW8`, `jie`, …) as
  *documentation* of where each field was extracted from — they are
  **not** the extraction key and **not** stable contract surface.
