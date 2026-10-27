"""Archive tracked Tallybook source and supplied verification logs reproducibly.

Usage: python tools/build_unified_package.py OUTPUT.zip [EVIDENCE_DIRECTORY]
Run from any directory. No installed dependencies are needed.
"""

from __future__ import annotations

import hashlib
import json
import subprocess
import sys
import zipfile
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def git(*args: str) -> str:
    return subprocess.check_output(["git", "-C", str(ROOT), *args], text=True).strip()


def main() -> None:
    if len(sys.argv) not in (2, 3):
        raise SystemExit("Usage: python tools/build_unified_package.py OUTPUT.zip [EVIDENCE_DIRECTORY]")
    output = Path(sys.argv[1]).resolve()
    evidence_dir = Path(sys.argv[2]).resolve() if len(sys.argv) == 3 else None
    output.parent.mkdir(parents=True, exist_ok=True)

    tracked = subprocess.check_output(["git", "-C", str(ROOT), "ls-files", "-z"])
    paths = sorted(p.decode("utf-8") for p in tracked.split(b"\0") if p)
    hashes: dict[str, str] = {}
    with zipfile.ZipFile(output, "w", zipfile.ZIP_DEFLATED, compresslevel=6) as archive:
        for relative in paths:
            path = ROOT / relative
            if not path.is_file():
                raise RuntimeError(f"Tracked file is missing: {relative}")
            data = path.read_bytes()
            name = f"source/{relative.replace(chr(92), '/')}"
            archive.writestr(name, data)
            hashes[name] = hashlib.sha256(data).hexdigest()

        if evidence_dir is not None:
            for path in sorted(evidence_dir.glob("*2026-10-27.txt")):
                if path.is_file():
                    data = path.read_bytes()
                    name = f"verification/{path.name}"
                    archive.writestr(name, data)
                    hashes[name] = hashlib.sha256(data).hexdigest()

        metadata = {
            "source_commit": git("rev-parse", "HEAD"),
            "source_branch": git("branch", "--show-current"),
            "tracked_source_files": len(paths),
            "included_verification_logs": len(hashes) - len(paths),
            "sha256": hashes,
        }
        archive.writestr("SHA256_MANIFEST.json", json.dumps(metadata, indent=2, sort_keys=True) + "\n")
    print(f"{output}\nSHA-256: {hashlib.sha256(output.read_bytes()).hexdigest()}")


if __name__ == "__main__":
    main()
