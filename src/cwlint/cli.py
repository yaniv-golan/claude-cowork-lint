"""claude-cowork-lint command-line interface."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Annotated

import typer

from cwlint import __version__, check_repo, load_default_spec, load_spec
from cwlint.output import format_json, format_sarif, format_text
from cwlint.rules import all_rules

app = typer.Typer(
    add_completion=False,
    no_args_is_help=True,
    help="Validate skill/plugin/agent repos against the Claude Cowork runtime contract.",
)


def _version_callback(value: bool) -> None:
    if value:
        typer.echo(f"claude-cowork-lint {__version__}")
        raise typer.Exit


@app.callback()
def main(
    version: Annotated[
        bool,
        typer.Option(
            "--version",
            callback=_version_callback,
            is_eager=True,
            help="Print version and exit.",
        ),
    ] = False,
) -> None:
    """Top-level entry point."""


@app.command()
def check(
    repo: Annotated[
        Path,
        typer.Argument(exists=True, file_okay=False, dir_okay=True, resolve_path=True),
    ],
    spec_path: Annotated[
        Path | None,
        typer.Option("--spec", help="Path to a contract spec JSON. Default: bundled latest."),
    ] = None,
    strict: Annotated[
        bool,
        typer.Option("--strict/--warn-only", help="Strict mode exits 1 on errors."),
    ] = False,
    fmt: Annotated[
        str,
        typer.Option("--format", "-f", help="Output format: text, json, sarif."),
    ] = "text",
    ignore: Annotated[
        list[str] | None,
        typer.Option("--ignore", help="Rule IDs to skip (repeatable)."),
    ] = None,
) -> None:
    """Check a repo against the Cowork runtime contract."""
    spec = load_spec(spec_path) if spec_path else load_default_spec()
    report = check_repo(repo, spec, ignore=ignore or [])

    if fmt == "text":
        typer.echo(format_text(report))
    elif fmt == "json":
        typer.echo(json.dumps(format_json(report), indent=2))
    elif fmt == "sarif":
        typer.echo(json.dumps(format_sarif(report), indent=2))
    else:
        typer.echo(f"unknown format: {fmt}", err=True)
        raise typer.Exit(2)

    raise typer.Exit(report.exit_code(strict=strict))


@app.command("list-rules")
def list_rules() -> None:
    """Print every CWxxx rule with severity and summary."""
    rules = sorted(all_rules(), key=lambda r: r.rule_id)
    for rule in rules:
        typer.echo(f"{rule.rule_id}  {str(rule.severity):<6}  {rule.summary}")


@app.command("spec-info")
def spec_info(
    spec_path: Annotated[
        Path | None,
        typer.Option("--spec", help="Path to a contract spec JSON. Default: bundled latest."),
    ] = None,
) -> None:
    """Print bundled-spec metadata and key allowlist sizes."""
    spec = load_spec(spec_path) if spec_path else load_default_spec()
    typer.echo(f"spec_version          {spec.spec_version}")
    typer.echo(f"claude_app_version    {spec.claude_app_version}")
    if spec.claude_cli_version:
        typer.echo(f"claude_cli_version    {spec.claude_cli_version}")
    typer.echo(f"operon_core_version   {spec.operon_core_version}")
    typer.echo(
        "async_dispatch_allowlist  "
        f"{len(spec.subagent_tool_filter.async_dispatch_allowlist.names)} names"
    )
    typer.echo(f"drop_set                  {len(spec.subagent_tool_filter.drop_set.names)} names")
    typer.echo(
        "host_loop_excluded        "
        f"{len(spec.host_loop_tool_substitution.host_loop_excluded_builtins.names)} names"
    )
    typer.echo(f"kernel_env_allowlist      {len(spec.kernel_env_passthrough.allowlist)} names")
    typer.echo(f"secret_unset_list         {len(spec.secret_unset_list.names)} names")
