param(
    [string]$Repo = '',
    [switch]$All,
    [int]$MaxCases = 5,
    [int]$MaxCalls = 100,
    [int]$TimeoutSeconds = 55,
    [string]$Model = '',
    [string]$JudgeModel = '',
    [string]$Filter = '',
    [switch]$OpenReport
)
$ErrorActionPreference = 'Stop'
$root = if ($Repo) { (Resolve-Path $Repo).Path } else { (Resolve-Path (Join-Path $PSScriptRoot '..')).Path }
$project = Join-Path $root 'flow5-live-tests\Flow5.LiveTests.csproj'
$generator = Join-Path $root 'backend\SportHub.AI\Application\Services\MemberGeminiWorkoutGeneratorV32.cs'
if (-not (Test-Path $project)) { throw "Missing test project: $project" }
if (-not (Test-Path $generator)) { throw 'V32 generator not found; check that V32 was applied.' }
$generatorText = [IO.File]::ReadAllText($generator)
if (!$generatorText.Contains('UNSUITABLE_INPUT') -or !$generatorText.Contains('ValidateInput(input, h)') -or $generatorText.Contains('sessionMinutes = h.SessionMinutes') -or $generatorText.Contains('BlockSeconds')) { throw 'V37 backend not installed. Run scripts\install-flow5-v37.ps1 first. No requests made.' }
if (-not $env:GEMINI_API_KEY) { $env:GEMINI_API_KEY = [Environment]::GetEnvironmentVariable('Gemini__ApiKey','Process') }
# Read only Gemini configuration keys; never print credentials, do not load other .env secrets.
$envFile = Join-Path $root '.env'
if (Test-Path $envFile) {
    foreach ($line in Get-Content $envFile) {
        if ($line -match '^\s*(GEMINI_API_KEY|Gemini__ApiKey|Gemini__Model)\s*=\s*(.+?)\s*$') {
            $name = $matches[1]
            $value = $matches[2].Trim().Trim("'").Trim('"')
            if ($name -eq 'Gemini__Model' -and -not $Model -and -not $env:GEMINI_MODEL) { $env:GEMINI_MODEL = $value }
            if ($name -ne 'Gemini__Model' -and -not $env:GEMINI_API_KEY) { $env:GEMINI_API_KEY = $value }
        }
    }
}
if (-not $env:GEMINI_API_KEY) { throw 'Missing Gemini API key; set GEMINI_API_KEY in the environment. Never paste it into chat.' }
if (-not $Model) { $Model = if ($env:GEMINI_MODEL) { $env:GEMINI_MODEL } else { 'gemini-3.5-flash-lite' } }
if (-not $JudgeModel) { $JudgeModel = $Model }
if ($All) { $MaxCases = 50 }
if ($MaxCases -lt 1 -or $MaxCases -gt 50) { throw 'MaxCases must be between 1 and 50' }
if ($MaxCalls -lt 3 -or $MaxCalls -gt 350) { throw 'MaxCalls must be between 3 and 350' }
if ($TimeoutSeconds -lt 10 -or $TimeoutSeconds -gt 180) { throw 'TimeoutSeconds must be between 10 and 180' }
$outDir = Join-Path $root ('flow5-test-results\LIVE-'+(Get-Date -Format 'yyyyMMdd-HHmmss'))
New-Item -ItemType Directory -Force -Path $outDir | Out-Null
Write-Host 'Flow5 V37 LIVE Gemini runner: synthetic profiles, no SportHub DB writes.'
Write-Host "Model=$Model | Judge=$JudgeModel | Maximum scenarios=$MaxCases | Maximum provider calls=$MaxCalls"
Write-Host 'NOTICE: calls are billable subject to the Gemini account plan; model evaluation is not a medical safety guarantee.'
Write-Host "Report: $outDir"
$env:ASPNETCORE_ENVIRONMENT = 'Testing'
$env:SharedDatabase__Enabled = 'false'
$argsList = @('run','--project',$project,'-c','Release','--','--output',$outDir,'--model',$Model,'--judge-model',$JudgeModel,'--max-cases',"$MaxCases",'--max-calls',"$MaxCalls",'--timeout-seconds',"$TimeoutSeconds")
if ($All) { $argsList += '--all' }
if ($Filter) { $argsList += @('--filter',$Filter) }
& dotnet @argsList
$code=$LASTEXITCODE
if ($OpenReport -and (Test-Path (Join-Path $outDir 'index.html'))) { Start-Process (Join-Path $outDir 'index.html') }
Write-Host "Results: $outDir"
exit $code
