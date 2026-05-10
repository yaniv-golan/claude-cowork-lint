"""Extractor self-tests against synthetic JS fixtures."""

from __future__ import annotations

from typing import TYPE_CHECKING

from cwlint.extractors import (
    REGISTRY,
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


def test_subagent_filter(repo_root: Path) -> None:
    src = (repo_root / "tests" / "fixtures" / "bundles" / "synthetic_cli.js").read_text()
    fragment = SubagentFilterExtractor().extract(src)
    assert fragment is not None
    names = fragment["async_dispatch_allowlist"]["names"]
    assert "Bash" in names
    assert "PowerShell" in names
    assert "TodoWrite" in names
    assert fragment["async_dispatch_allowlist"]["count"] == 19


def test_registry_routes_by_target(repo_root: Path) -> None:
    desktop = (repo_root / "tests" / "fixtures" / "bundles" / "synthetic_desktop.js").read_text()
    out = REGISTRY.run(desktop, target="desktop")
    assert "kernel_env_passthrough" in out
    assert "secret_unset_list" in out
    assert "subagent_tool_filter" not in out  # CLI-only

    cli = (repo_root / "tests" / "fixtures" / "bundles" / "synthetic_cli.js").read_text()
    out = REGISTRY.run(cli, target="cli")
    assert "subagent_tool_filter" in out
    assert "kernel_env_passthrough" not in out
