# SportHub Coach Request Tab E2E Fix

This patch restores the Coach request-center tab label from `Support requests`
to `Member support`.

The receptionist feature allowing a Coach to be the request sender does not
change the Coach workspace tab, which still displays member support requests
assigned to that Coach.

Run from the SportHub repository root:

```powershell
python .\SportHub_Coach_Request_Tab_E2E_Fix\install.py --root . --check
python .\SportHub_Coach_Request_Tab_E2E_Fix\install.py --root .

Push-Location .\frontend
try {
    npm run typecheck
    npx playwright test --workers=1 tests/coach-training.spec.ts --grep "coach manages absence and member support"
}
finally {
    Pop-Location
}
```
