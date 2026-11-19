from __future__ import annotations

import argparse
from pathlib import Path


RELATIVE_PATH = Path(
    "frontend/src/features/coaching/coach-request-center.tsx"
)
OLD = '{ id: "support", label: "Support requests" },'
NEW = '{ id: "support", label: "Member support" },'


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Restore the Coach request-center Member support tab label."
    )
    parser.add_argument("--root", default=".", help="SportHub repository root")
    parser.add_argument("--check", action="store_true", help="Validate without writing")
    args = parser.parse_args()

    target = Path(args.root).resolve() / RELATIVE_PATH
    if not target.is_file():
        print(f"MISSING: {RELATIVE_PATH}")
        return 2

    source = target.read_text(encoding="utf-8")
    old_count = source.count(OLD)
    new_count = source.count(NEW)

    if old_count == 0 and new_count == 1:
        print(f"ALREADY APPLIED: {RELATIVE_PATH}")
        return 0
    if old_count != 1 or new_count != 0:
        print(
            f"MISMATCH: {RELATIVE_PATH} "
            f"(Support requests={old_count}, Member support={new_count}); no files changed."
        )
        return 3

    print(f"READY: {RELATIVE_PATH}")
    if args.check:
        print("CHECK OK; no files changed.")
        return 0

    target.write_text(source.replace(OLD, NEW, 1), encoding="utf-8")
    print("PATCH APPLIED: 1 file")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
