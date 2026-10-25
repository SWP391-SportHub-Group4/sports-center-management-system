from pathlib import Path
import shutil

root = Path(__file__).resolve().parent
source = root / "receptionist-schedule.tsx"
target = root / "frontend/src/features/receptionist/receptionist-schedule.tsx"

if not source.exists():
    raise SystemExit(f"Missing {source}")

if not target.parent.exists():
    raise SystemExit("Run this from the SportHub repository root.")

backup = target.with_suffix(target.suffix + ".bak-full-replace")
if target.exists() and not backup.exists():
    shutil.copy2(target, backup)

shutil.copy2(source, target)

print("Replaced:", target)
print("Backup:", backup if backup.exists() else "(none)")
print("Now run:")
print("  cd frontend")
print("  npx tsc --noEmit")
print("  npm run lint")
print("  npm run build")
