"""Extractor self-tests against synthetic JS fixtures.

These fixtures replicate the *shape* of the real production bundles
(symbol indirection, spread members, the LW8 function body that gates the
async-allowlist via `q && !<sym>.has(...)`) so the same extractor that runs
against `/Applications/Claude.app/Contents/Resources/app.asar` works here.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from cwlint.extractors import (
    REGISTRY,
    HostLoopExtractor,
    KernelEnvAllowlistExtractor,
    SecretUnsetListExtractor,
    SubagentFilterExtractor,
)

if TYPE_CHECKING:
    from pathlib import Path


def test_kernel_env_allowlist(repo_root: Path) -> None:
    src = (repo_root / "tests" / "fixtures" / "bundles" / "synthetic_desktop.js").read_text()
    fragment = KernelEnvAllowlistExtractor().extract(src)
    assert fragment is not None
    assert "HOME" in fragment["allowlist"]
    assert "PATH" in fragment["allowlist"]
    assert "OPERON_SECRET_VARS" in fragment["allowlist"]
    assert "HOME" in fragment["deleted_after_filter"]


def test_secret_unset_list(repo_root: Path) -> None:
    src = (repo_root / "tests" / "fixtures" / "bundles" / "synthetic_desktop.js").read_text()
    fragment = SecretUnsetListExtractor().extract(src)
    assert fragment is not None
    assert "ANTHROPIC_API_KEY" in fragment["names"]
    assert "OPENAI_API_KEY" in fragment["names"]
    assert "OPERON_EZPROXY_COOKIE" in fragment["names"]
    assert fragment["count"] == len(fragment["names"])


def test_host_loop_safe_set_resolves_spread(repo_root: Path) -> None:
    """The spread `...e_` should expand to its 6-name array."""
    src = (repo_root / "tests" / "fixtures" / "bundles" / "synthetic_desktop.js").read_text()
    fragment = HostLoopExtractor().extract(src)
    assert fragment is not None
    safe = fragment["host_loop_safe_set"]
    assert "Task" in safe["names"]
    assert "TodoWrite" in safe["names"]  # via spread
    assert "TaskCreate" in safe["names"]  # via spread
    assert "SendUserMessage" in safe["names"]
    assert safe["count"] == 17


def test_host_loop_excluded_builtins(repo_root: Path) -> None:
    src = (repo_root / "tests" / "fixtures" / "bundles" / "synthetic_desktop.js").read_text()
    fragment = HostLoopExtractor().extract(src)
    assert fragment is not None
    excluded = fragment["host_loop_excluded_builtins"]
    assert set(excluded["names"]) == {"Bash", "NotebookEdit", "REPL", "JavaScript", "WebFetch"}
    assert excluded["mcp_replacements"]["Bash"] == "mcp__workspace__bash"
    assert excluded["mcp_replacements"]["WebFetch"] == "mcp__workspace__web_fetch"


def test_subagent_filter_resolves_symbols(repo_root: Path) -> None:
    """Symbol names in the Set should resolve to string literals via static analysis."""
    src = (repo_root / "tests" / "fixtures" / "bundles" / "synthetic_cli.js").read_text()
    fragment = SubagentFilterExtractor().extract(src)
    assert fragment is not None
    assert fragment["filter_fn_symbol"] == "LW8"

    drop = fragment["drop_set"]
    assert set(drop["names"]) == {
        "TaskOutput",
        "ExitPlanMode",
        "EnterPlanMode",
        "Agent",
        "AskUserQuestion",
        "WaitForMcpServers",
    }
    assert drop["symbol"] == "$zH"

    allow = fragment["async_dispatch_allowlist"]
    assert "Bash" in allow["names"]
    assert "PowerShell" in allow["names"]
    assert "Read" in allow["names"]
    assert "Write" in allow["names"]
    assert allow["count"] == 19
    assert allow["symbol"] == "Ys_"

    nb = fragment["non_builtin_extra_drop_set"]
    assert nb["count"] == 6
    assert nb["symbol"] == "M58"


def test_registry_routes_by_target(repo_root: Path) -> None:
    desktop = (repo_root / "tests" / "fixtures" / "bundles" / "synthetic_desktop.js").read_text()
    out = REGISTRY.run(desktop, target="desktop")
    assert "kernel_env_passthrough" in out
    assert "secret_unset_list" in out
    assert "host_loop_tool_substitution" in out
    assert "subagent_tool_filter" not in out  # CLI-only

    cli = (repo_root / "tests" / "fixtures" / "bundles" / "synthetic_cli.js").read_text()
    out = REGISTRY.run(cli, target="cli")
    assert "subagent_tool_filter" in out
    assert "kernel_env_passthrough" not in out
