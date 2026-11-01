#!/usr/bin/env bash
set -euo pipefail
umask 077
task_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
compose=(bash "$task_dir/compose.sh")
if [[ -n "$("${compose[@]}" ps --status running -q backend caddy)" ]]; then
  printf 'Stop backend and caddy before a consistent database/runtime backup.\n' >&2
  exit 1
fi
backup_dir="${BACKUP_DIR:-$task_dir/backups}"
mkdir -p "$backup_dir"
backup_set="$(mktemp -d "$backup_dir/sporthub-$(date -u +%Y%m%dT%H%M%SZ)-XXXXXX")"
"${compose[@]}" exec -T postgres sh -ec \
  'exec pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom' > "$backup_set/database.dump.partial"
"${compose[@]}" exec -T postgres pg_restore --list < "$backup_set/database.dump.partial" > /dev/null
"${compose[@]}" run --rm --no-deps -T storage-export > "$backup_set/backend-data.tar.partial"
mv -- "$backup_set/database.dump.partial" "$backup_set/database.dump"
mv -- "$backup_set/backend-data.tar.partial" "$backup_set/backend-data.tar"
(cd "$backup_set" && sha256sum database.dump backend-data.tar > SHA256SUMS)
printf 'Backup complete: %s\nCopy this directory to encrypted off-host storage.\n' "$backup_set"
