#!/usr/bin/env bash
set -euo pipefail
task_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
if [[ ! -f "$task_dir/.env" ]]; then
  printf 'Create deploy/aws/.env from .env.example first.\n' >&2
  exit 1
fi
exec docker compose --env-file "$task_dir/.env" -f "$task_dir/compose.yml" "$@"
