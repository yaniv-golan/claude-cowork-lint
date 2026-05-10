---
name: clean-skill
description: A skill that exercises no rule. Negative control for the dogfood corpus.
user-invocable: true
---

# Clean skill

This skill body is deliberately boring. It references
`${CLAUDE_PLUGIN_ROOT}/scripts/setup.sh` correctly (so CW003 stays
quiet), declares no forbidden frontmatter fields, and avoids any
sub-agent dispatch patterns.

## Usage

Run the setup script, then follow the printed instructions:

```text
./scripts/setup.sh
```

Nothing in this file should produce a finding from any rule. If a rule
fires here, either the rule has a false positive or this fixture has
drifted — investigate before silencing the rule.
