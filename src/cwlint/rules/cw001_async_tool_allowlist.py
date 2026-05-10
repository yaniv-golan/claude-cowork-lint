"""CW001 — agent declares a tool stripped by Cowork's runtime gates.

Models the two-gate architecture:

* Desktop-side: ``HOST_LOOP_EXCLUDED_BUILTIN_TOOLS`` strips
  Bash/NotebookEdit/REPL/JavaScript/WebFetch from registered built-ins
  (replaced by mcp__workspace__*).
* CLI-side: ``Ys_``/``LW8`` async-dispatch allowlist (19 names) admits a
  sub-set further restricted by ``drop_set`` ($zH).

Sub-agent survivor set:
``(async_dispatch_allowlist - host_loop_excluded_builtins) - drop_set + {mcp__*}``.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from cwlint.findings import Finding, Severity
from cwlint.rules import register
from cwlint.rules._base import Rule
from cwlint.rules._helpers import (
    find_token_line,
    parse_frontmatter,
    subagent_survivors,
    suppressed,
)
from cwlint.suppression import parse_suppressions

if TYPE_CHECKING:
    from collections.abc import Iterable

    from cwlint.discovery import RepoLayout
    from cwlint.spec import Spec


@register
class CW001AsyncToolAllowlist(Rule):
    rule_id = "CW001"
    severity = Severity.ERROR
    summary = "Agent declares a tool stripped by Cowork's runtime gates"

    def check(self, layout: RepoLayout, spec: Spec) -> Iterable[Finding]:
        survivors = subagent_survivors(spec)
        f = spec.subagent_tool_filter
        h = spec.host_loop_tool_substitution
        drop_set = set(f.drop_set.names)
        host_excluded = set(h.host_loop_excluded_builtins.names)
        async_allow = set(f.async_dispatch_allowlist.names)
        replacements = h.host_loop_excluded_builtins.mcp_replacements

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
                if not isinstance(tool, str):
                    continue
                if tool.startswith("mcp__"):
                    continue
                if tool in survivors:
                    continue

                line_no = find_token_line(lines, tool, body_start)
                if suppressed(sups, self.rule_id, line_no):
                    continue

                detail, suggestion = _explain(
                    tool, drop_set, host_excluded, async_allow, replacements
                )
                yield Finding(
                    rule_id=self.rule_id,
                    severity=self.severity,
                    path=agent_path.relative_to(layout.root),
                    line=line_no,
                    message=f"tool {tool!r} will not be available to a Cowork sub-agent",
                    detail=detail,
                    suggestion=suggestion,
                )


def _explain(
    tool: str,
    drop_set: set[str],
    host_excluded: set[str],
    async_allow: set[str],
    replacements: dict[str, str],
) -> tuple[str, str]:
    if tool in drop_set:
        return (
            "name is in the always-dropped set ($zH/M58); never reaches a sub-agent regardless "
            "of dispatch mode.",
            f"Remove {tool!r} from this agent's tools.",
        )
    if tool in host_excluded:
        repl = replacements.get(tool)
        if repl:
            return (
                "name is excluded from registered built-ins in Cowork mode "
                f"(HOST_LOOP_EXCLUDED_BUILTIN_TOOLS); use {repl!r} instead.",
                f"Replace {tool!r} with {repl!r} in this agent's tools.",
            )
        return (
            "name is excluded from registered built-ins in Cowork mode; "
            "no MCP replacement is documented.",
            f"Remove {tool!r} from this agent's tools.",
        )
    if tool not in async_allow:
        return (
            "name is not in the async-dispatch allowlist (Ys_/LW8); a sub-agent dispatched "
            "via Task/bg/fork will not have this tool.",
            f"Remove {tool!r} or replace with a tool from the async-dispatch allowlist.",
        )
    return ("not in sub-agent survivor set", f"Remove {tool!r}.")
