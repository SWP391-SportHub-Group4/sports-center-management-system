# Flow6: continue after infrastructure errors

Applies to SportHub Flow6 V2 Gemini First. Only flow6-live-tests/Program.cs changes.
Member and Coach continue after quota, rate-limit, authentication and model errors.
Each affected case remains INFRA_ERROR. Remaining cases are attempted while the provider-call budget permits.
Health preflight and explicit --max-calls remain enforced. No automatic retries are added.

## Install
Extract this folder, then run from the repository root:

```powershell
python .\flow6-continue-infra\install.py --root . --check
python .\flow6-continue-infra\install.py --root .
dotnet run --project .\flow6-live-tests\Flow6.LiveTests.csproj -c Release -- --self-test
dotnet run --project .\flow6-live-tests\Flow6.LiveTests.csproj -c Release -- --role member --max-calls 150
dotnet run --project .\flow6-live-tests\Flow6.LiveTests.csproj -c Release -- --role coach --max-calls 150
```

Installer verifies the V2 source hash and creates a backup before replacing the runner.
If source differs, it stops without overwriting local changes.
Exit code is still nonzero if any case fails or has infrastructure errors.

Validation: source change verified; installer check/install/idempotence/rollback tested on a synthetic V2 repository.
.NET SDK is unavailable in the patch environment; build and live Gemini execution were not run.
