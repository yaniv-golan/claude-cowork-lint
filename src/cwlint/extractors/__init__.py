"""Bundle-extractor framework — produces JSON fragments from Claude.app and CLI bundles.

Each extractor pins to a *behavioural* anchor (regex on a unique string literal
or function signature) rather than a minified symbol name, because the symbols
change every Claude release. v2.1.119 → v2.1.138 saw every symbol rename.

Status: v0.1 ships the framework + 3 working extractors against synthetic JS
fixtures. Validation against a current production Claude.app is v0.2 work.
"""

from __future__ import annotations

from cwlint.extractors._base import Extractor, ExtractorRegistry
from cwlint.extractors.kernel_env_allowlist import KernelEnvAllowlistExtractor
from cwlint.extractors.secret_unset_list import SecretUnsetListExtractor
from cwlint.extractors.subagent_filter import SubagentFilterExtractor

REGISTRY = ExtractorRegistry()
REGISTRY.register(KernelEnvAllowlistExtractor())
REGISTRY.register(SubagentFilterExtractor())
REGISTRY.register(SecretUnsetListExtractor())

__all__ = [
    "REGISTRY",
    "Extractor",
    "ExtractorRegistry",
    "KernelEnvAllowlistExtractor",
    "SecretUnsetListExtractor",
    "SubagentFilterExtractor",
]
