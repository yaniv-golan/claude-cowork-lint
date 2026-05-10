"""Copy contracts/*.json into src/cwlint/_contracts/. Run after editing canonical files."""

from __future__ import annotations

import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "contracts"
DST = ROOT / "src" / "cwlint" / "_contracts"


def main() -> None:
    DST.mkdir(parents=True, exist_ok=True)
    for src in SRC.iterdir():
        if src.is_symlink() or not src.is_file():
            continue
        shutil.copy2(src, DST / src.name)
        print(f"copied {src.name}")


if __name__ == "__main__":
    main()
