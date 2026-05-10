---
name: shorthand-tools-agent
description: Synthesised agent that declares tools the Cowork runtime strips.
tools: [Bash, Read, NotebookEdit]
---

# Shorthand-tools agent

This agent's frontmatter uses the inline-list form for `tools:`. The
Cowork runtime will:

- Replace `Bash` with its MCP equivalent (CW001 suggests the replacement).
- Drop `NotebookEdit` entirely with no replacement (CW001 fires again).
- Leave the agent with no `Write` or `Edit` survivor (CW002 fires).

The fixture's only job is to exercise the inline-list parser in CW001/CW002.
