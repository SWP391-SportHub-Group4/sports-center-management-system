# Rebuild the production frontend image from the current local source and replace its container.
# Stop a local `npm run dev` first: both servers use port 3000.
$ErrorActionPreference = 'Stop'
Push-Location (Join-Path $PSScriptRoot '..')
try {
    docker compose build frontend
    if ($LASTEXITCODE -ne 0) { throw 'Frontend Docker build failed.' }

    docker compose up -d --no-deps --force-recreate frontend
    if ($LASTEXITCODE -ne 0) {
        throw 'Could not start Docker frontend. Stop npm run dev if port 3000 is already in use.'
    }

    Write-Host 'Docker frontend is ready at http://localhost:3000 with the latest local source.'
}
finally {
    Pop-Location
}
