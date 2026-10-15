#!/usr/bin/env bash
set -euo pipefail

# Rebuild from the current checkout, then replace the container that serves port 3000.
# Stop a local `npm run dev` first because it uses the same port.
cd "$(dirname "${BASH_SOURCE[0]}")/.."

docker compose build frontend
if ! docker compose up -d --no-deps --force-recreate frontend; then
  echo 'Could not start Docker frontend. Stop npm run dev if port 3000 is in use.' >&2
  exit 1
fi

echo 'Docker frontend is ready at http://localhost:3000 with the latest local source.'
