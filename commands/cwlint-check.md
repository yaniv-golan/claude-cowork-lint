---
description: Lint the current repo against the Claude Cowork runtime contract.
allowed-tools: [Bash, Read]
---

# /cwlint-check

Validate the current skill/plugin/agent repo against the Cowork runtime
contract via the `claude-cowork-lint` CLI.

## Steps

1. Confirm the binary is on PATH:

   ```bash
   command -v claude-cowork-lint || command -v cwlint || echo "NOT FOUND"
   ```

   If not found, suggest:

   ```bash
   pipx install claude-cowork-lint
   ```

2. Run the checker on the current repo and capture JSON:

   ```bash
   claude-cowork-lint check . --format json
   ```

3. Summarise findings to the user:

   - Group by file
   - For each finding: rule_id, severity, line, message, suggestion
   - For `CW001` findings on `Bash`, point at `mcp__workspace__bash`
   - For `CW011` / `CW012`, surface the `~/.claude/settings.json` workaround
   - For info-severity `CW009`, mention that the user must register the MCP server

4. If the user wants to suppress a specific finding, point them at the
   `<!-- cwlint: ignore CWxxx reason="..." -->` syntax. Reasons are required.

5. Cite the rule's full description from `docs/RULES.md` in the project repo
   (https://github.com/yaniv-golan/claude-cowork-lint/blob/main/docs/RULES.md)
   when explaining a finding.

## Notes

- Read-only; the CLI never mutates the user's repo.
- For an offline / fully-deterministic run, pass `--spec contracts/cowork-vX.Y.Z.json`.
