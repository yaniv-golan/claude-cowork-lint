"""Typed loaders for the Cowork runtime contract spec."""

from __future__ import annotations

import json
from typing import TYPE_CHECKING, Any

from pydantic import BaseModel, ConfigDict, Field, field_validator

if TYPE_CHECKING:
    from pathlib import Path


class _Frozen(BaseModel):
    model_config = ConfigDict(frozen=True, extra="allow")


class NamedStringSet(_Frozen):
    names: list[str]


class HostLoopExcludedBuiltins(_Frozen):
    names: list[str]
    mcp_replacements: dict[str, str] = Field(default_factory=dict)


class HostLoopToolSubstitution(_Frozen):
    host_loop_safe_set: NamedStringSet
    host_loop_excluded_builtins: HostLoopExcludedBuiltins
    renderer_dependent_extra_drops: NamedStringSet | None = None


class SubagentToolFilter(_Frozen):
    drop_set: NamedStringSet
    non_builtin_extra_drop_set: NamedStringSet
    async_dispatch_allowlist: NamedStringSet
    experimental_fallback_allowlist: NamedStringSet
    fork_subagent_allowlist: NamedStringSet


class KernelEnvPassthrough(_Frozen):
    allowlist: list[str]
    deleted_after_filter: list[str]


class UserSecretsValidation(_Frozen):
    name_regex: str
    name_uppercased: bool = True
    name_max_length: int
    value_max_bytes: int
    reserved_name_literals: list[str]
    reserved_name_sets: list[str] = Field(default_factory=list)


class UserSecretsInjection(_Frozen):
    validation: UserSecretsValidation


class SessionKinds(_Frozen):
    recognized_values: list[str]


class ForbiddenField(_Frozen):
    field: str
    value: Any
    reason: str


class EnvVarSubstitution(_Frozen):
    supported_form: str
    unsupported_form: str
    reason: str | None = None


class SkillFrontmatterInvariants(_Frozen):
    required_fields: list[str]
    forbidden_fields: list[ForbiddenField]
    env_var_substitution: EnvVarSubstitution


class CliLaunchArgs(_Frozen):
    always_passed: list[str]


class Spec(_Frozen):
    spec_version: str
    claude_app_version: str
    claude_cli_version: str | None = None
    operon_core_version: str
    extracted_at: str | None = None

    subagent_tool_filter: SubagentToolFilter
    host_loop_tool_substitution: HostLoopToolSubstitution
    kernel_env_passthrough: KernelEnvPassthrough
    user_secrets_injection: UserSecretsInjection
    session_kinds: SessionKinds
    secret_unset_list: NamedStringSet
    skill_frontmatter_invariants: SkillFrontmatterInvariants
    cli_launch_args_in_cowork: CliLaunchArgs

    @field_validator("spec_version")
    @classmethod
    def _v0_only(cls, v: str) -> str:
        if v != "0":
            raise ValueError(f"Unsupported spec_version {v!r}; this build supports '0' only")
        return v


def load_spec(path: Path) -> Spec:
    """Load a contract JSON file from disk into a typed Spec."""
    raw = json.loads(path.read_text(encoding="utf-8"))
    return Spec.model_validate(raw)


def load_default_spec() -> Spec:
    """Load the highest-versioned bundled contract from inside the package.

    Enumerates `cwlint._contracts/cowork-v*.json` and picks the lexicographically
    largest filename. We deliberately do NOT rely on a `cowork-latest.json`
    symlink: hatchling and pip dereference or omit symlinks inconsistently
    when building wheels.
    """
    from importlib.resources import files

    pkg = files("cwlint._contracts")
    candidates = sorted(
        (
            entry
            for entry in pkg.iterdir()
            if entry.name.startswith("cowork-v") and entry.name.endswith(".json")
        ),
        key=lambda e: e.name,
        reverse=True,
    )
    if not candidates:
        raise FileNotFoundError("No cowork-v*.json contract bundled inside the package")
    return Spec.model_validate(json.loads(candidates[0].read_text(encoding="utf-8")))
