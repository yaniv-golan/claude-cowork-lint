# Rule catalog

Every rule cites the section of `docs/internal/SPEC.md` it derives from.
Suppress any finding inline with `<!-- cwlint: ignore CWxxx reason="..." -->`
or `# cwlint: ignore CWxxx reason="..."`.

| ID | Severity | Topic |
|---|---|---|
| [CW001](#cw001) | error | Tool will not survive Cowork's runtime gates |
| [CW002](#cw002) | error | Agent has no remaining persistence path |
| [CW003](#cw003) | warn  | Bare `$CLAUDE_PLUGIN_ROOT` instead of `${...}` |
| [CW004](#cw004) | error | `disable-model-invocation: true` |
| [CW005](#cw005) | warn  | `user-invocable: false` explicitly opts out |
| [CW006](#cw006) | warn  | Hook command typos a known tool name |
| ~~CW007~~ | — | *Reserved indefinitely* — see [`docs/internal/ROADMAP.md`](internal/ROADMAP.md#cw007--intentionally-reserved-indefinitely) |
| [CW008](#cw008) | warn  | Sub-agent dispatch + bash fence heuristic |
| [CW009](#cw009) | info  | MCP tool requires a server not registered locally |
| [CW010](#cw010) | info  | Plugin `userConfig` name overlaps a legacy Operon reserved name (deprecated) |
| [CW011](#cw011) | warn  | Plugin has `hooks/hooks.json` |
| [CW012](#cw012) | info  | Plugin hooks declare events known broken in Cowork |

---

## CW001

**Severity:** error
**SPEC:** §subagent_tool_filter + §host_loop_tool_substitution

The Cowork runtime applies two filters in series:

1. **Desktop-side host-loop filter** — strips `Bash`, `NotebookEdit`, `REPL`,
   `JavaScript`, `WebFetch` from registered built-ins. The desktop's
   `workspace` MCP server registers replacements for **only two** of the five:
   - `Bash` → `mcp__workspace__bash`
   - `WebFetch` → `mcp__workspace__web_fetch` (snake_case, not `webfetch`)

   The other three (`NotebookEdit`, `REPL`, `JavaScript`) are dropped
   **without** any `mcp__workspace__*` substitute. CW001 reflects this split:
   - **Replaced-without-deficit** (`Bash`, `WebFetch`) → suggestion is
     "use `mcp__workspace__<x>` instead".
   - **Dropped-with-no-equivalent** (`NotebookEdit`, `REPL`, `JavaScript`) →
     suggestion is "remove this tool; Cowork has no equivalent". CW001
     does NOT invent fictional names like `mcp__workspace__notebookedit`.

2. **CLI-side async-dispatch allowlist** (`Ys_`/`LW8`) — admits 19 names plus
   anything matching `mcp__*`. The drop set (`$zH`/`M58`) overrides everything.

The sub-agent survivor set is therefore:

```
survivors = async_dispatch_allowlist
          - drop_set
          - host_loop_dropped_builtins
          - host_loop_replaced (their mcp__workspace__* counterparts pass via
                                the mcp__ fast-path instead)
          + {mcp__*}
```

**v0.1 assumes any agent file under `agents/` is a sub-agent.** Top-level
Cowork session tools are configured at the desktop/session level, not in skill
repos.

### Bad

```yaml
# agents/reviewer.md
---
tools: [Bash, NotebookEdit, TaskOutput]
---
```

- `Bash` has a replacement: use `mcp__workspace__bash`.
- `NotebookEdit` has **no Cowork equivalent** — remove it.
- `TaskOutput` is in `drop_set` — always stripped.

### Fix

```yaml
---
tools: [mcp__workspace__bash, Read]
---
```

---

## CW002

**Severity:** error
**SPEC:** §subagent_tool_filter + §host_loop_tool_substitution (same survivor-set logic as CW001)

If neither `Write` nor `Edit` survives the host-loop and async-dispatch
filters, the agent has no structured persistence path. (`mcp__workspace__bash`
can write files via shell, but it isn't a structured persistence tool.)

The survivor-set computation honours the v1.6608.2 split:
host-loop-**replaced** built-ins (Bash, WebFetch) are filtered out of the
plain-name survivor set — their `mcp__workspace__*` counterparts are matched
separately via the `mcp__` fast-path; host-loop-**dropped** built-ins
(NotebookEdit, REPL, JavaScript) are simply removed.

### Bad

```yaml
---
tools: [Read, Grep, TodoWrite]
---
```

### Fix

```yaml
---
tools: [Read, Grep, TodoWrite, Write]
---
```

---

## CW003

**Severity:** warn
**SPEC:** §skill_frontmatter_invariants.env_var_substitution

Cowork's runtime requires `${CLAUDE_PLUGIN_ROOT}` (with braces). Bare
`$CLAUDE_PLUGIN_ROOT` depends on shell-expansion timing not guaranteed for
skill subprocesses.

### Bad

```text
Reference: $CLAUDE_PLUGIN_ROOT/scripts/setup.sh
```

### Fix

```text
Reference: ${CLAUDE_PLUGIN_ROOT}/scripts/setup.sh
```

---

## CW004

**Severity:** error
**SPEC:** §skill_frontmatter_invariants.forbidden_fields

Setting `disable-model-invocation: true` blocks the model from invoking this
skill at runtime. Verified against Claude Code CLI 2.1.138
(`contracts/cowork-v1.6608.2.json`): the `skill_invoke` handler returns
`skill_invoke_model_disabled` when the field is set to true —

```js
if (z.disableModelInvocation && !tE7(O, _))
  return skill_invoke_model_disabled
```

— so the skill is effectively unusable from the chat surface. An internal
bypass path exists (the `!tE7(O, _)` guard) but is not user-controllable in
normal use. Almost certainly not what you want for a published skill.

### Bad

```yaml
---
user-invocable: true
disable-model-invocation: true
---
```

### Fix

Remove the `disable-model-invocation` line.

---

## CW005

**Severity:** warn
**SPEC:** §skill_frontmatter_invariants.required_fields (with the runtime-verified
default-true semantics — see below).

The runtime parses `user-invocable` as
`(value?.toLowerCase() !== "false")` — meaning **the field defaults to `true`
when absent**, and only the explicit string `"false"` opts a skill out.
Verified against Claude.app `1.6608.2` desktop bundle.

CW005 fires only when the field is **explicitly set to `false`** — the
common footgun where an author copy-pasted the field thinking they needed
to opt IN and got the polarity wrong.

### Bad

```yaml
---
name: my-skill
user-invocable: false   # silently opts out of slash-command surface
---
```

### Fix

Either remove the line entirely (default is `true`) or change to
`user-invocable: true`.

### Rule history

The earlier interpretation (fire when missing) was a contract bug — extracted
from a SPEC entry that overstated requirement. Empirical re-validation
against Claude.app 1.6608.2 + scanning of Anthropic's official skills (all
17 omit the field and work fine) confirmed the missing-as-default-true
semantics.

---

## CW006

**Severity:** warn
**SPEC:** §subagent_tool_filter (whole) — typo detector

A hook command references a CamelCase token that *almost* matches a known
tool name (edit distance ≤ 2). Most likely a typo (`WriteFile` → `Write`).

### Bad

```json
{ "hooks": { "PreToolUse": [{ "command": "echo WriteFile" }] } }
```

### Fix

```json
{ "hooks": { "PreToolUse": [{ "command": "echo Write" }] } }
```

---

## CW008

**Severity:** warn
**SPEC:** SPEC §rules-table line `CW008`. v0.4.0 founder-skills incident.

The rule fires when a **structured** sub-agent dispatch cue (`Task(`, `/bg`,
`/fork`, `subagent_type:`, etc. — see `_DISPATCH_CUES` in the source) is
followed within 30 lines by a fenced bash block. To suppress when the bash
block runs on the main thread, add a comment containing `main-thread` (or
`main thread`) within 3 lines above the fence.

### Bad

```markdown
Spawn a sub-agent: Task(subagent_type='reviewer')

```bash
ls
```
```

### Fix (option 1)

Replace the bash block with `mcp__workspace__bash`.

### Fix (option 2)

Add a main-thread comment to silence the heuristic:

```markdown
Spawn: Task(subagent_type='r')

Note: this main-thread block doesn't dispatch.
```bash
ls
```
```

---

## CW009

**Severity:** info
**SPEC:** §subagent_tool_filter.mcp_tools + §host_loop_tool_substitution

The agent declares `mcp__<server>__<tool>`, but `<server>` is not registered
in any `.mcp.json` in the repo and isn't one of the MCP servers the Cowork
desktop auto-registers.

Cowork built-in MCP servers (v1.6608.2 — driven by the contract field
`host_loop_tool_substitution.cowork_builtin_mcp_servers.names`, discovered by
enumerating `mcp__<server>__<tool>` literals in the desktop bundle):

- `cowork`
- `cowork-onboarding`
- `mcp-registry`
- `plugins`
- `radar`
- `scheduled-tasks`
- `skills`
- `terminal`
- `workspace`

Prior to v0.1.1 the rule only recognised three of these (`workspace`,
`cowork`, `cowork-onboarding`) — references to the other six were silently
false-positived.

### Fix

Either register the server in `.mcp.json` or document the dependency in
SKILL.md.

---

## CW010

**Severity:** info (deprecated)
**Status:** The Operon kernel-secrets subsystem that originally enforced this
was **removed in Claude.app 1.6608.2** (zero occurrences of `OperonSecrets`
/ `claude.operon` in the desktop bundle — see
`docs/internal/CONTRACT-AUDIT-1.6608.2.md`). Plugin `userConfig` is now
validated by the extension manifest schema, a different system this rule
does not currently model. The rule survives as a **hygiene check**: the
runtime no longer rejects names like `ANTHROPIC_API_KEY`, but using
high-entropy reserved-looking names for plugin config is still poor
practice. `cwlint doctor` reports this rule as `— deprecated`.

The match criteria (regex `^[A-Za-z][A-Za-z0-9_]*$`, length ≤ 128, not in
the reserved literal set `ANTHROPIC_API_KEY`, `DATABASE_URL`, `SECRET_KEY`)
are unchanged — only the severity and the framing of the message changed.

### Bad

```json
{ "userConfig": { "1foo": {}, "ANTHROPIC_API_KEY": {} } }
```

### Fix

```json
{ "userConfig": { "FOO": {}, "MY_API_KEY": {} } }
```

---

## CW011

**Severity:** warn
**SPEC:** §cli_launch_args_in_cowork.consequences.plugin_hooks_excluded

Cowork spawns the in-VM CLI with `--setting-sources=user`. Plugin-scoped
hooks (declared in `<plugin>/hooks/hooks.json`) **DO NOT FIRE** in Cowork
sessions. Tracked as
[#16288](https://github.com/anthropics/claude-code/issues/16288) /
[#27398](https://github.com/anthropics/claude-code/issues/27398).

### Workaround

Move hook declarations to `~/.claude/settings.json` (user scope) so they
fire in both Cowork and Claude Code Desktop.

---

## CW012

**Severity:** info
**SPEC:** SPEC §rules-table line `CW012`

Stronger signal than CW011 — the hook event itself depends on a lifecycle
that Cowork drops. Events: `SessionStart`, `Stop`, `SubagentStart`,
`SubagentStop`, `UserPromptSubmit`, `PostToolUse`.

### Workaround

Same as CW011 — move to user scope.
