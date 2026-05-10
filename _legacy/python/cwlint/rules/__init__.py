"""Rule registry. Imports each CWxxx module and exposes `all_rules()`."""

from __future__ import annotations

from typing import TYPE_CHECKING

from cwlint.rules._base import Rule

if TYPE_CHECKING:
    from collections.abc import Iterable

_REGISTRY: list[type[Rule]] = []


def register(rule: type[Rule]) -> type[Rule]:
    _REGISTRY.append(rule)
    return rule


def all_rules() -> Iterable[Rule]:
    return [cls() for cls in _REGISTRY]


# Import rule modules so their @register decorators run.
# NOTE: CW007 is deferred to v0.2 (see SPEC discussion of kernel_env_passthrough surface).
from cwlint.rules import (  # noqa: E402, F401
    cw001_async_tool_allowlist,
    cw002_no_persistence_path,
    cw003_bare_env_var,
    cw004_disable_model_invocation,
    cw005_missing_user_invocable,
    cw006_unknown_tool_name,
    cw008_subagent_bash_heuristic,
    cw009_mcp_dependency,
    cw010_user_secret_name,
    cw011_plugin_hooks,
    cw012_broken_hook_events,
)

__all__ = ["Rule", "all_rules", "register"]
