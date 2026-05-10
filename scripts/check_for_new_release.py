"""Check for a newer Claude.app and run the extractor end-to-end.

Behaviour:

  - With `--bundle <path>`: extract from a local bundle path. Used in CI
    to test the pipeline against the synthetic fixtures shipped under
    `tests/fixtures/bundles/`.

  - With `--app <path>` (default `/Applications/Claude.app`): inspect a
    real Claude.app installation. If the bundle's CFBundleShortVersionString
    differs from the bundled contract's `claude_app_version`, run the
    extractor pipeline against it and produce:

        - `<output-dir>/cowork-v<NEW>.json`     - candidate contract
        - `<output-dir>/diff.md`                - PR-body markdown

  - With `--dry-run`: skip the extraction; just emit a JSON summary
    indicating whether work would be done.

Exits 0 always (use the report's `action` field to gate downstream steps).
"""

from __future__ import annotations

import argparse
import json
import plistlib
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "src"))

from cwlint import load_default_spec  # noqa: E402
from cwlint.diff import diff_specs, render_markdown_diff  # noqa: E402
from cwlint.extractors import REGISTRY  # noqa: E402


def _read_app_version(app_path: Path) -> str | None:
    plist = app_path / "Contents" / "Info.plist"
    if not plist.exists():
        return None
    try:
        with plist.open("rb") as fh:
            data = plistlib.load(fh)
    except (plistlib.InvalidFileException, OSError):
        return None
    version = data.get("CFBundleShortVersionString")
    return str(version) if isinstance(version, str) else None


def _extract_asar(asar: Path, dest: Path) -> bool:
    """Use `npx @electron/asar` to extract the asar to `dest`. Returns True on success."""
    if shutil.which("npx") is None:
        return False
    try:
        subprocess.run(
            ["npx", "--yes", "@electron/asar", "extract", str(asar), str(dest)],
            check=True,
            capture_output=True,
            timeout=120,
        )
    except (subprocess.CalledProcessError, subprocess.TimeoutExpired):
        return False
    return True


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--app",
        type=Path,
        default=Path("/Applications/Claude.app"),
        help="Path to Claude.app (default: /Applications/Claude.app).",
    )
    parser.add_argument(
        "--bundle",
        type=Path,
        help="Path to an already-extracted desktop JS bundle (skips asar extraction).",
    )
    parser.add_argument(
        "--cli-bundle",
        type=Path,
        help="Path to an extracted CLI JS bundle.",
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=Path("watcher-output"),
        help="Where to write candidate contract + diff.md.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Don't extract; just report what would happen.",
    )
    parser.add_argument(
        "--report",
        type=Path,
        default=Path("report.json"),
        help="Path to write the JSON summary.",
    )
    args = parser.parse_args()

    current = load_default_spec()

    # Resolve target version
    target_version: str | None = None
    if args.app.exists() and not args.bundle:
        target_version = _read_app_version(args.app)
    if args.bundle:
        target_version = "manual-bundle"

    summary: dict[str, object] = {
        "mode": "dry-run" if args.dry_run else "live",
        "current_known_claude_app_version": current.claude_app_version,
        "target_version": target_version,
    }

    if target_version is None:
        summary["action"] = "skip"
        summary["reason"] = "no Claude.app found and no --bundle provided"
        _write(summary, args.report)
        return

    if target_version == current.claude_app_version:
        summary["action"] = "skip"
        summary["reason"] = "current contract already matches installed Claude.app"
        _write(summary, args.report)
        return

    if args.dry_run:
        summary["action"] = "would-extract"
        _write(summary, args.report)
        return

    args.output_dir.mkdir(parents=True, exist_ok=True)

    # Resolve desktop bundle path
    if args.bundle:
        desktop_bundle = args.bundle
    else:
        asar = args.app / "Contents" / "Resources" / "app.asar"
        extract_dir = args.output_dir / "asar-extract"
        if not _extract_asar(asar, extract_dir):
            summary["action"] = "fail"
            summary["reason"] = "asar extraction failed; install npx or pass --bundle"
            _write(summary, args.report)
            return
        desktop_bundle = extract_dir / ".vite" / "build" / "index.js"

    if not desktop_bundle.exists():
        summary["action"] = "fail"
        summary["reason"] = f"desktop bundle not found at {desktop_bundle}"
        _write(summary, args.report)
        return

    desktop_text = desktop_bundle.read_text(encoding="utf-8", errors="replace")
    fragments = REGISTRY.run(desktop_text, target="desktop")

    if args.cli_bundle and args.cli_bundle.exists():
        cli_text = args.cli_bundle.read_text(encoding="utf-8", errors="replace")
        fragments.update(REGISTRY.run(cli_text, target="cli"))

    # Compose a candidate contract by merging fragments over a copy of the current spec.
    current_dict = _load_current_json()
    candidate = dict(current_dict)
    candidate["claude_app_version"] = target_version
    for key, value in fragments.items():
        if isinstance(candidate.get(key), dict) and isinstance(value, dict):
            merged = dict(candidate[key])
            merged.update(value)
            candidate[key] = merged
        else:
            candidate[key] = value

    candidate_path = args.output_dir / f"cowork-v{target_version}.json"
    candidate_path.write_text(json.dumps(candidate, indent=2), encoding="utf-8")

    diff = diff_specs(current_dict, candidate)
    diff_md = render_markdown_diff(diff, current.claude_app_version, target_version)
    (args.output_dir / "diff.md").write_text(diff_md, encoding="utf-8")

    summary["action"] = "extracted"
    summary["candidate_contract"] = str(candidate_path)
    summary["diff_markdown"] = str(args.output_dir / "diff.md")
    summary["fragment_keys"] = sorted(fragments.keys())
    _write(summary, args.report)


def _load_current_json() -> dict[str, object]:
    """Read the bundled JSON directly so we keep all keys (pydantic model strips extras)."""
    pkg = ROOT / "src" / "cwlint" / "_contracts"
    candidates = sorted(pkg.glob("cowork-v*.json"), reverse=True)
    if not candidates:
        raise FileNotFoundError("no bundled contract JSON found")
    return json.loads(candidates[0].read_text(encoding="utf-8"))


def _write(summary: dict[str, object], report_path: Path) -> None:
    report_path.write_text(json.dumps(summary, indent=2), encoding="utf-8")
    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()
