"""CW009 — agent declares an MCP tool whose server isn't registered."""

from __future__ import annotations

import json
from typing import TYPE_CHECKING

from cwlint.findings import Finding, Severity
from cwlint.rules import register
from cwlint.rules._base import Rule
from cwlint.rules._helpers import find_token_line, parse_frontmatter, suppressed
from cwlint.suppression import parse_suppressions

if TYPE_CHECKING:
    from collections.abc import Iterable

    from cwlint.discovery import RepoLayout
    from cwlint.spec import Spec

# Cowork auto-registers these MCP servers. Tools using these prefixes are always available
# in a Cowork sub-agent (subject to the deferred-tier semantics — see SPEC §deferred_tools_tier).
_BUILTIN_MCP_SERVERS = frozenset({"workspace", "cowork", "cowork-onboarding"})
_MCP_PREFIX_PARTS = 3  # mcp__<server>__<tool>


@register
class CW009McpDependency(Rule):
    rule_id = "CW009"
    severity = Severity.INFO
    summary = "Agent declares MCP tool whose server may not be registered"

    def check(self, layout: RepoLayout, spec: Spec) -> Iterable[Finding]:  # noqa: ARG002
        registered = _registered_mcp_servers(layout)

        for agent_path in layout.agents:
            text = agent_path.read_text(encoding="utf-8")
            lines = text.splitlines()
            sups = parse_suppressions(lines)
            fm, body_start = parse_frontmatter(text)
            if fm is None:
                continue
            tools = fm.get("tools")
            if not isinstance(tools, list):
                continue
            for tool in tools:
                if not isinstance(tool, str) or not tool.startswith("mcp__"):
                    continue
                # mcp__<server>__<tool>
                segments = tool.split("__", 2)
                if len(segments) < _MCP_PREFIX_PARTS:
                    continue
                server = segments[1]
                if server in _BUILTIN_MCP_SERVERS or server in registered:
                    continue
                line_no = find_token_line(lines, tool, body_start)
                if suppressed(sups, self.rule_id, line_no):
                    continue
                yield Finding(
                    rule_id=self.rule_id,
                    severity=self.severity,
                    path=agent_path.relative_to(layout.root),
                    line=line_no,
                    message=f"MCP tool {tool!r} requires server {server!r}",
                    detail=(
                        f"No `.mcp.json` in this repo registers an MCP server named {server!r}, "
                        "and it is not one of the Cowork built-in servers (workspace, cowork, "
                        "cowork-onboarding)."
                    ),
                    suggestion=(
                        f"Either register {server!r} in `.mcp.json`, or document that the user "
                        "must register it in their Cowork session before using this skill."
                    ),
                )


def _registered_mcp_servers(layout: RepoLayout) -> set[str]:
    out: set[str] = set()
    for cfg in layout.mcp_configs:
        try:
            payload = json.loads(cfg.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            continue
        servers = payload.get("mcpServers") if isinstance(payload, dict) else None
        if isinstance(servers, dict):
            out.update(servers.keys())
    return out
