"""Check whether a newer Claude.app version is available than what we have a contract for.

v0.3 STUB. Does not yet:
  - download the bundle
  - run the extractor end-to-end
  - open a PR

It does:
  - read the bundled contract's claude_app_version
  - emit a dry-run report (current_known_version, suggested_action)
  - exit 0 always; report written to --report PATH

Maintainer workflow today: run this in CI, inspect the artifact, then run the
extractor by hand against the new bundle.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

sys.path.insert(0, str(ROOT / "src"))

from cwlint import load_default_spec  # noqa: E402


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Report only; do not download or open PRs.",
    )
    parser.add_argument(
        "--report",
        type=Path,
        default=Path("report.json"),
        help="Path to write the JSON report.",
    )
    args = parser.parse_args()

    spec = load_default_spec()
    report = {
        "mode": "dry-run" if args.dry_run else "live",
        "current_known_claude_app_version": spec.claude_app_version,
        "current_known_operon_core_version": spec.operon_core_version,
        "next_step": (
            "Manual: download the latest Claude.app bundle, run "
            "`uv run cwlint extract <bundle> --target desktop` and "
            "`uv run cwlint extract <cli-bundle> --target cli`, then PR a new "
            "contracts/cowork-v<NEW>.json. v0.4 will automate this end-to-end."
        ),
    }
    args.report.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
