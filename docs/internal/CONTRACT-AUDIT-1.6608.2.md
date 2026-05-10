# Contract audit: Claude.app v1.6608.2 / CLI v2.1.138

**Audit date:** 2026-05-10
**Bundled contract at audit time:** `cowork-v2.1.121.json` (claude_app_version `1.6259.1`)
**Live target:** Claude.app `1.6608.2` (CFBundleShortVersionString) + CLI bundle
`~/.local/share/claude/versions/2.1.138`
**Highest CLI version present:** `2.1.138` (versions installed: 2.1.119,
2.1.131, 2.1.132, 2.1.133, 2.1.136, 2.1.138 — used 2.1.138 per plan).

This is Task A1 of the v0.1.x dogfood-fixes plan
(`docs/superpowers/plans/2026-05-10-dogfood-fixes.md`). Read-only audit;
no contract files in `contracts/` were modified. The candidate refresh
contract lives at `/tmp/cwlint-refresh/cowork-v1.6608.2.json` and is
consumed by Task A2.

## Methodology

1. **Watcher run.** `npx tsx scripts/check-for-new-release.ts
   --output-dir /tmp/cwlint-refresh --report /tmp/cwlint-refresh/report.json`.
   Result: detected 1.6259.1 → 1.6608.2, action `extracted`,
   `fragment_keys = ["host_loop_tool_substitution"]`. Output:
   - `/tmp/cwlint-refresh/cowork-v1.6608.2.json` (candidate)
   - `/tmp/cwlint-refresh/diff.md`
   - `/tmp/cwlint-refresh/asar-extract/.vite/build/index.js` (desktop bundle)
   - `/tmp/cwlint-refresh/report.json`

2. **Manual CLI extraction.** The Bun-SEA Mach-O at
   `~/.local/share/claude/versions/2.1.138` embeds the JS bundle starting at
   the `// Claude Code is a Beta product` banner (offset 184_323_967). The
   plan's published recipe (`indexOf` of a 4-byte zero run) extracts a
   bundle that is truncated mid-token at the trailing `})` wrapper and
   fails Babel parse at `19306:9051`. Adjusted recipe used for this audit:
   - Slice from the banner offset to the next occurrence of the literal
     `So3();})` (the IIFE boundary that ends the first concatenated script
     unit — there are several `// Claude Code` banners inside the Mach-O).
   - Strip the dangling trailing `})` (no matching opening `(` survives the
     slice — the wrapper is added later in the SEA layout).
   - Result: 14_286_671 bytes of clean JS that Babel parses.
   - Then: `node dist/cli.js extract /tmp/cli-extracted.js --target cli >
     /tmp/cli-fragments.json`.

   The watcher script's CLI auto-extraction path should adopt this
   boundary heuristic (filed as a follow-up in the dogfood plan; not
   addressed in Task A1).

3. **Candidate merge.** The watcher already produces a candidate that is
   `cowork-v2.1.121.json` overlaid with the new `host_loop_tool_substitution`
   fragments and version metadata. The CLI fragments
   (`subagent_tool_filter`) match the existing v2.1.121 contract verbatim
   (allowlist = 19, drop_set = 6, non-builtin extra drop_set = 6,
   filter_fn `LW8`), so no further merge was needed for this audit. Task A2
   may choose to rewrite the `_v2_1_138` symbol-tag fields with the v2.1.138
   confirmation regardless.

4. **Anchor walk.** Each rule's contract anchor was probed by `grep` and
   structural inspection against
   `/tmp/cwlint-refresh/asar-extract/.vite/build/index.js` (desktop) and
   `/tmp/cli-extracted.js` (CLI). Counts captured below.

## Per-rule anchor staleness

| Rule | Anchor field | Status in v1.6608.2 / CLI 2.1.138 |
|---|---|---|
| CW001 | `subagent_tool_filter.async_dispatch_allowlist`, `host_loop_excluded_builtins`, `drop_set`, `host_loop_tool_substitution.replacements` | partially stale — allowlist (19), excluded (5), drop_set (6) all reproduced verbatim by `cwlint extract`. Replacement-string mapping is incomplete: bundle exposes only `mcp__workspace__bash` and `mcp__workspace__web_fetch`. The other 3 host-loop-excluded built-ins (`NotebookEdit`, `REPL`, `JavaScript`) have no `mcp__*__*` replacement in the desktop registry. Task B6 fix unchanged. WebFetch maps to `mcp__workspace__web_fetch` (snake_case) — confirmed in desktop bundle. |
| CW002 | same as CW001 | partially stale — depends on Task B6. |
| CW003 | `skill_frontmatter_invariants.env_var_substitution.unsupported_form` | anchor citation off + coverage gap unchanged. Verified: CLI bundle has 5 occurrences of `CLAUDE_PLUGIN_ROOT` AND 5 of `CLAUDE_PLUGIN_DATA` — both substituted via `H.replace(/\$\{CLAUDE_PLUGIN_(ROOT|DATA)\}/g, ...)` style regexes. Bare `$CLAUDE_PLUGIN_DATA` is a silent blind spot in CW003. |
| CW004 | `skill_frontmatter_invariants.forbidden_fields[0].field` (`disable-model-invocation`) | anchor moved (NOT removed). CLI bundle 2.1.138, methodology `grep -c` (lines containing the literal) and `grep -oE \| wc -l` (raw occurrences): kebab-case `disable-model-invocation` = 5 lines, camelCase `disableModelInvocation` = 13 lines, combined raw occurrences = 24, `skill_invoke_model_disabled` enforcement string = 1 line. (The plan's "15 active occurrences" was a single-form count for an earlier CLI build; this audit re-derives the numbers explicitly.) The field IS honored at runtime. Desktop bundle has 0 occurrences of the kebab form (manifest *display* layer is `dh(r,...)` with 4 fields: name, description, argument-hint, user-invocable), confirming the CLI runtime parser is the authoritative anchor. Task B1 should re-anchor instead of demoting. |
| CW005 | `skill_frontmatter_invariants.required_fields` (`user-invocable`) | present BUT defaults to true (`!== "false"` semantic). 15 CLI occurrences, 1 desktop occurrence (manifest layer). Already fixed in commit `9f371db`. |
| CW006 | `subagent_tool_filter` whole | structural anchor still applies. Hook-walker mis-scoping (Task B2) unchanged. |
| CW008 | n/a (heuristic) | no change. |
| CW009 | `subagent_tool_filter.mcp_tools` + `host_loop_tool_substitution` (auto-registered server list) | STALE. Desktop bundle in v1.6608.2 ships **9** MCP server prefixes (verified by structural enumeration of `mcp__<server>__<tool>` literals): `cowork`, `cowork-onboarding`, `mcp-registry`, `plugins`, `radar`, `scheduled-tasks`, `skills`, `terminal`, `workspace`. RULES.md/SPEC.md still document only 3. Rule is currently false-positiving any legitimate `mcp__skills__*`, `mcp__plugins__*`, `mcp__terminal__*`, `mcp__radar__*`, `mcp__scheduled-tasks__*`, `mcp__mcp-registry__*` reference. Task B5 unchanged. |
| CW010 | `user_secrets_injection.validation.{name_regex, name_max_length, reserved_name_literals}` | GONE. Desktop bundle, methodology `grep -c`: `OperonSecrets` = 0, `claude.operon` (the IPC channel literal) = 0 — both explicitly absent. `userConfig` (camelCase) = 3 lines, `user_config` (snake_case) = 3 lines; both flavours are extension-manifest plumbing without name-validation regex (the plan and the new manifest schema use different conventions, so both are reported here). The kernel-secrets subsystem appears to have been removed from the desktop bundle in this version. CW010 needs the same demote/re-anchor treatment as CW004 — Task B4 unchanged. |
| CW011 | `cli_launch_args_in_cowork.consequences.plugin_hooks_excluded` | mechanism intact. Verified in CLI bundle: the actual flag formation is `--setting-sources=${<minified-ident>.join(",")}` — i.e. the dynamically-built `--setting-sources` arg list (the minified symbol varies between releases — was `D` in the plan author's run, `k` in this audit's run; never anchor on the symbol literal). The SPEC's literal `--setting-sources=user` text is outdated. Plugin hooks are excluded as documented. |
| CW012 | hardcoded broken-events list | verified. All 6 listed events appear with non-zero counts in the CLI bundle: `SessionStart` (13), `Stop` (18), `SubagentStart` (8), `SubagentStop` (13), `UserPromptSubmit` (8), `PostToolUse` (20). Additional events `SessionEnd` (6) and `PreCompact` (5) exist — potential CW012 list expansions for separate investigation. |

No staleness adjustments to the plan's tabulation were required during
verification — every row matched the empirical evidence.

## Fields the candidate contract gained / lost

The watcher's overlay touches only `host_loop_tool_substitution`.
Comparing `cowork-v2.1.121.json` vs the candidate
`cowork-v1.6608.2.json`:

- **Changed:**
  - `claude_app_version`: `1.6259.1` → `1.6608.2`.
  - `extracted_at`: bumped to current run timestamp.
  - `host_loop_tool_substitution.host_loop_safe_set`: 17 names (unchanged
    set vs the v2.1.121 contract's 17 — count consistent).
  - `host_loop_tool_substitution.host_loop_excluded_builtins`: 5 names
    (`Bash`, `NotebookEdit`, `REPL`, `JavaScript`, `WebFetch`) — same as
    prior. The watcher attached `count: 5` and a slim
    `mcp_replacements: { Bash: "mcp__workspace__bash", WebFetch:
    "mcp__workspace__web_fetch" }` map. The richer prose under
    `mcp_replacements._note_others` from the prior contract is dropped by
    the overlay — Task A2 should preserve that prose when finalising.
  - The descriptive `_description` and `symbol_v1_6259_1` fields under
    `host_loop_safe_set` and `host_loop_excluded_builtins` are dropped by
    the overlay. Task A2 should re-attach them with `_v1_6608_2` symbol
    tags.

- **Not yet captured in the candidate (deltas Task A2 may want):**
  - The 9-server MCP universe (CW009 finding) is not yet a structured
    field. `RULES.md`'s 3-server list is currently the only place this is
    documented, and it is wrong.
  - The 5-field skill frontmatter parser (see appendix) is not yet
    enumerated. `skill_frontmatter_invariants` lists `user-invocable`
    only as a required field and `disable-model-invocation` as a single
    forbidden field; the contract should add a top-level
    `skill_frontmatter_runtime_fields` enumeration distinct from the
    desktop manifest-display layer.
  - The `OperonSecrets` removal (CW010) is not yet reflected — the
    `user_secrets_injection` block in the candidate is carried forward
    verbatim from v2.1.121 by the overlay. Task A2 / B4 should mark it
    as removed-from-desktop or move it under a `legacy/` namespace with
    an explicit `removed_in: "1.6608.2"` annotation.

## Appendix: discovered skill-frontmatter fields

The CLI bundle (2.1.138) recognises **5** skill-frontmatter fields when
parsing skill manifests at runtime, vs the **4** the desktop bundle
exposes through its `dh(r, ...)` manifest-display accessor (`name`,
`description`, `argument-hint`, `user-invocable`). Occurrence counts in
the CLI bundle:

| Field | Count (CLI 2.1.138) | Known purpose | Possible CW0xx rule? |
|---|---|---|---|
| `user-invocable` | 15 | gates user-typed slash invocation | already covered by CW005 |
| `disable-model-invocation` | 5 | when true, blocks model-driven invocation (`skill_invoke_model_disabled`) | already covered by CW004 |
| `allowed-tools` | 28 | likely an alternative or sibling of `tools:` for restricting agent tools | **investigate**: does it overlap CW001's `tools:` reading? Possibly a new rule CW013 if the runtime treats them differently. |
| `force-for-plugin` | 4 | unknown (semantically suggestive — possibly forces plugin-scope-only behaviour) | **investigate**: if true, may interact badly with CW011's "plugin hooks excluded" finding. |
| `keep-coding-instructions` | 3 | unknown (semantically suggestive — possibly toggles system-prompt augmentation) | **investigate**: footgun candidate if disabling drops important context silently. |

These are deferred to Task C4 (round-4 binary verification follow-up).
The contract should track BOTH the desktop manifest-display layer (4
fields) and the CLI runtime-parser layer (5 fields) explicitly so future
audits can spot divergence.

**Task C4 resolution (post-discovery, see `FRONTMATTER-FIELDS-AUDIT.md`):**
the table above conflated three sibling zod schemas (skill/agent/output-style)
into one "skill-frontmatter" bucket. `force-for-plugin` and
`keep-coding-instructions` are actually output-style frontmatter fields
(schema `VU1`), not skill fields (schema `LU1`). `allowed-tools` IS a
skill field but is a permission grant (populates `alwaysAllowRules.command`),
not a tool-set filter equivalent to the agent's `tools:`. Outcome:
0 new rules added; semantics documented in
`docs/internal/FRONTMATTER-FIELDS-AUDIT.md` and the contract's
`runtime_parser_fields_v2_1_138.fields[].actual_schema` annotation.

## Deliverables produced by this audit

All `/tmp/...` paths below are session-local working artifacts that may
disappear on reboot or `/tmp` GC; this committed audit report is the
durable record of the findings, and Task A2 is responsible for promoting
the candidate contract into `contracts/`.

- `/tmp/cwlint-refresh/cowork-v1.6608.2.json` — candidate contract (for
  Task A2 to refine and ship).
- `/tmp/cwlint-refresh/diff.md` — watcher diff.
- `/tmp/cwlint-refresh/report.json` — watcher report JSON.
- `/tmp/cwlint-refresh/asar-extract/.vite/build/index.js` — extracted
  desktop bundle.
- `/tmp/cli-extracted.js` — extracted CLI bundle (clean-cut version).
- `/tmp/cli-fragments.json` — CLI extraction output.
- This file (`docs/internal/CONTRACT-AUDIT-1.6608.2.md`) — committed.
