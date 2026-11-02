#!/usr/bin/env bash
set -euo pipefail
task_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
compose=(bash "$task_dir/compose.sh")
if [[ "$#" -ne 1 || "$1" != --confirm-restored ]]; then
  printf 'After restoring and validating data, run: bash deploy/aws/deploy.sh --confirm-restored\n' >&2
  exit 1
fi
command -v python3 > /dev/null
"${compose[@]}" config --quiet
"${compose[@]}" config --format json | python3 "$task_dir/preflight.py"
"${compose[@]}" build backend ai-service
if [[ -n "$("${compose[@]}" ps --status running -q backend caddy)" ]]; then
  printf 'Stop backend and caddy and take a backup before migration/deploy.\n' >&2; exit 1
fi
"${compose[@]}" up -d --wait postgres
"${compose[@]}" exec -T postgres sh -ec \
  'psql -X -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"' > /dev/null <<'SQL'
SELECT count(*) FROM public."__EFMigrationsHistory";
SQL
"${compose[@]}" run --rm --no-deps -T storage-export | tar -tf - | grep -E '^dataprotection-keys/[^/]+\.xml$' > /dev/null || {
  printf 'Restore existing Data Protection keys before starting the API.\n' >&2; exit 1;
}
"${compose[@]}" run --rm --no-deps --entrypoint /app/migrate backend
"${compose[@]}" up -d --wait backend ai-service caddy
printf 'Services started. Verify HTTPS /api/health and business flows before switching Vercel.\n'
