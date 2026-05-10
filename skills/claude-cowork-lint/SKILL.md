---
name: claude-cowork-lint
description: |
  Validate the current Claude skill/plugin/agent repo against the Claude Cowork
  runtime contract. Use when the user asks to "lint my skill", "check my plugin
  for Cowork issues", "why isn't my agent working in Cowork", or mentions tools
  being filtered/stripped.

  Triggers: cwlint, claude-cowork-lint, cowork contract, sub-agent tool
  filter, host-loop excluded builtins, $CLAUDE_PLUGIN_ROOT, plugin hooks not
  firing, disable-model-invocation.

  Requires the `claude-cowork-lint` (or `cwlint`) binary on PATH —
  `pipx install claude-cowork-lint`.
user-invocable: true
---

# claude-cowork-lint skill

Use this skill to drive the `claude-cowork-lint` CLI from inside Claude
Code/Cowork.

## When to invoke

- The user asks to "lint my skill", "check my plugin", "validate my agent",
  "is this Cowork-safe?".
- The user pastes an error along the lines of "Bash isn't in my agent's
  tools" or "my plugin's hooks aren't firing".
- The user mentions runtime symbols like `Ys_`, `LW8`, `MGn`, or talks about
  Cowork's tool filters.

## Steps

1. Confirm the binary is on PATH:
   ```bash
   command -v claude-cowork-lint || command -v cwlint
   ```
   If neither is found, suggest `pipx install claude-cowork-lint`.

2. Run the checker on the current repo:
   ```bash
   claude-cowork-lint check . --format json
   ```
   Use `--format json` so you can parse findings programmatically; render
   summary back to the user in plain prose.

3. For each finding, look up the rule in `docs/RULES.md` (in the project's
   GitHub repo) and explain the fix.

4. Offer to suppress (with a reason) if the user has a legitimate reason to
   keep the offending pattern.

## Notes

- This skill runs inside Claude Code/Cowork; the CLI itself is a host-side
  process. The skill does NOT need any sub-agent dispatch.
- The `claude-cowork-lint` CLI is read-only — never mutates the user's repo.
