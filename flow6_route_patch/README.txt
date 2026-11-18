SportHub route test patch for develop(5)

Changes one test file. Tests Member chat, Coach chat/plan, suggestion profile,
response model, continuation ID, invalid payload and sanitized upstream errors.
A separate Python process isolates the fake provider. No real Gemini requests.
This is a Python route contract test, not a .NET, DB authorization or live AI test.

From project root in PowerShell:
python .\flow6_route_patch\install.py --root . --check
if ($LASTEXITCODE -ne 0) { throw 'Source mismatch. Patch not applied.' }
python .\flow6_route_patch\install.py --root .
if ($LASTEXITCODE -ne 0) { throw 'Patch failed.' }
Push-Location .\ai-service
try {
    python -m unittest discover -s tests -p 'test_*.py' -v
} finally { Pop-Location }

Requirements: ai-service dependencies installed in the active Python environment.
The installer creates .sporthub-route-test-backups in the project root. It refuses
an unknown source version. A previously applied payload is reported separately.
