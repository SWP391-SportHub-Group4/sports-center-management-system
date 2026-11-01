#!/usr/bin/env bash
set -euo pipefail
umask 077
if [[ "$#" -ne 2 ]]; then
  printf 'Usage: bash deploy/aws/restore.sh /absolute/backup-directory exact-destination-database-name\n' >&2
  exit 1
fi
task_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
backup_set="$(cd -- "$1" && pwd)"
database_confirm="$2"
compose=(bash "$task_dir/compose.sh")
for file in database.dump backend-data.tar SHA256SUMS; do
  [[ -f "$backup_set/$file" ]] || { printf 'Missing backup file: %s\n' "$file" >&2; exit 1; }
done
# Only verify the two expected files, never a caller-controlled checksum path.
(cd "$backup_set" && sha256sum database.dump backend-data.tar) | cmp -s - "$backup_set/SHA256SUMS" || {
  printf 'Backup checksums do not match.\n' >&2; exit 1;
}
if [[ -n "$("${compose[@]}" ps --status running -q backend caddy)" ]]; then
  printf 'Stop backend and caddy before restoring.\n' >&2; exit 1
fi
"${compose[@]}" up -d --wait postgres
actual_database="$("${compose[@]}" exec -T postgres sh -ec \
  'psql -X -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atc "SELECT current_database()"')"
[[ "$actual_database" == "$database_confirm" ]] || { printf 'Destination database confirmation mismatch.\n' >&2; exit 1; }
table_count="$("${compose[@]}" exec -T postgres sh -ec \
  'psql -X -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -At' <<'SQL'
SELECT count(*) FROM pg_tables WHERE schemaname NOT IN ('pg_catalog', 'information_schema');
SQL
)"
[[ "$table_count" == 0 ]] || { printf 'Destination database is not empty; refusing overwrite.\n' >&2; exit 1; }
"${compose[@]}" exec -T postgres pg_restore --list < "$backup_set/database.dump" > /dev/null
"${compose[@]}" run --rm --no-deps -T storage-import < "$backup_set/backend-data.tar"
"${compose[@]}" exec -T postgres sh -ec \
  'exec pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --single-transaction --exit-on-error --no-owner --no-privileges' < "$backup_set/database.dump"
printf 'Restore completed. API remains stopped. Validate row counts before migration/start.\n'
