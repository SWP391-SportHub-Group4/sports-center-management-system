# Actual local Coach API with real Gemini behind the app. Use a synthetic test class only.
[CmdletBinding()]
param(
    [Parameter(Mandatory=$true)][int]$ClassId,
    [Parameter(Mandatory=$true)][guid]$FutureSessionId,
    [Parameter(Mandatory=$true)][guid]$MemberId,
    [guid]$PastSessionId = [guid]::Empty,
    [guid]$OutsiderMemberId = [guid]::Empty,
    [string]$ApiBase = 'http://localhost:5000',
    [string]$Goal = 'Improve footwork',
    [ValidateSet('Beginner','Intermediate','Advanced')][string]$Level = 'Beginner',
    [ValidateSet('en','vi')][string]$Language = 'en',
    [switch]$SyntheticOnly,
    [switch]$OnlyNegative
)
$ErrorActionPreference = 'Stop'
if (-not $SyntheticOnly) { throw 'Use synthetic local test data only. Confirm with -SyntheticOnly.' }
$uri = [uri]$ApiBase
if (-not $uri.IsLoopback -or $uri.Scheme -notin @('http','https')) { throw 'This runner is restricted to a local API.' }
if ($ClassId -le 0 -or $FutureSessionId -eq [guid]::Empty -or $MemberId -eq [guid]::Empty) { throw 'Valid class, future session and enrolled student IDs are required.' }
$token = $env:SPORTHUB_COACH_TEST_TOKEN
if ([string]::IsNullOrWhiteSpace($token)) {
    $secure = Read-Host 'Coach JWT access token (local synthetic account)' -AsSecureString
    $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
    try { $token = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr) }
    finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }
}
if ([string]::IsNullOrWhiteSpace($token)) { throw 'Coach JWT required; this is not the Gemini API key.' }
$url = $ApiBase.TrimEnd('/') + "/api/coaches/me/teaching/classes/$ClassId/suggestion"
$headers = @{ Authorization = "Bearer $token" }
$results = @()
function Test-Plan([string]$Id, [string]$Scope, $Student, $Session, [int]$Expected, [string]$InputGoal, [string]$ExpectedCode='') {
    $body = @{ scope=$Scope; memberId=$Student; sessionId=$Session; goal=$InputGoal; level=$Level; language=$Language } | ConvertTo-Json -Depth 5
    $timer = [Diagnostics.Stopwatch]::StartNew()
    $status = 0; $code = ''; $actual = $null; $model = $null; $provider = $null
    try {
        $r = Invoke-RestMethod -Uri $url -Method Post -Headers $headers -ContentType 'application/json; charset=utf-8' -Body ([Text.Encoding]::UTF8.GetBytes($body)) -TimeoutSec 200 -ErrorAction Stop
        $status = 200; $actual = $r.content; $model = $r.model; $provider = $r.provider
    } catch {
        if ($_.Exception.Response) { $status = [int]$_.Exception.Response.StatusCode }
        $err = $_.ErrorDetails.Message
        if (-not $err -and $_.Exception.Response -and $_.Exception.Response.PSObject.Methods.Name -contains 'GetResponseStream') {
            try { $reader = [IO.StreamReader]::new($_.Exception.Response.GetResponseStream()); $err = $reader.ReadToEnd(); $reader.Dispose() } catch {}
        }
        try { $problem = $err | ConvertFrom-Json; $code = $problem.error } catch {}
        # Never write raw upstream response bodies, headers, keys or tokens to disk.
        if ($code -notmatch '^[a-z0-9_]+$') { $code = 'unclassified_error' }
    }
    $state = 'FAIL'
    if ($status -eq 200 -and $Expected -eq 200) {
        $pattern = '(?i)(?<![\w\d+-])([1-9]\d*)\s*(sets?|hiệp|hiep)\s*(x|×|\*|by)\s*([1-9]\d*)\s*(reps?|lần|lan)\b'
        $min = if ($Scope -eq 'session') { 3 } else { 2 }
        if ($actual -and $model -and [regex]::Matches($actual,$pattern).Count -ge $min) { $state = 'PASS' }
    } elseif ($status -eq $Expected -and ($ExpectedCode -eq '' -or $code -eq $ExpectedCode)) { $state = 'PASS' }
    elseif ($status -in @(0,429,503,504) -or ($status -eq 502 -and $code -ne 'ai_suggestion_invalid_output')) { $state = 'INFRA_ERROR' }
    if ($actual -and $token) { $actual = [string]$actual; $actual = $actual.Replace($token,'[redacted]') }
    Write-Host "$Id $state HTTP=$status expected=$Expected model=$model code=$code"
    return [pscustomobject]@{ id=$Id; status=$state; expectedHttp=$Expected; actualHttp=$status; expectedCode=$ExpectedCode; errorCode=$code; scope=$Scope; goal=$InputGoal; model=$model; provider=$provider; actualPlan=$actual; elapsedMs=$timer.ElapsedMilliseconds }
}
# Input guard smoke tests before spending model quota.
$results += Test-Plan 'CP-GUARD-001' 'session' $MemberId $FutureSessionId 400 $Goal 'suggestion_context_invalid'
$results += Test-Plan 'CP-GUARD-002' 'session' $null $null 400 $Goal 'suggestion_context_invalid'
$results += Test-Plan 'CP-GUARD-003' 'personal' $null $FutureSessionId 400 $Goal 'suggestion_context_invalid'
$results += Test-Plan 'CP-GUARD-004' 'course' $null $FutureSessionId 400 $Goal 'suggestion_context_invalid'
$results += Test-Plan 'CP-GUARD-005' 'session' $null $FutureSessionId 400 'asdfasdfasdfasdfasdf' 'training_goal_invalid'
if ($PastSessionId -ne [guid]::Empty) {
    $results += Test-Plan 'CP-GUARD-006' 'session' $null $PastSessionId 409 $Goal 'session_suggestion_unavailable'
    $results += Test-Plan 'CP-GUARD-007' 'personal' $MemberId $PastSessionId 409 $Goal 'session_suggestion_unavailable'
}
if ($OutsiderMemberId -ne [guid]::Empty) { $results += Test-Plan 'CP-GUARD-008' 'personal' $OutsiderMemberId $null 403 $Goal 'member_not_in_class' }
if (-not $OnlyNegative -and @($results | Where-Object status -ne 'PASS').Count -eq 0) {
    $results += Test-Plan 'CP-LIVE-001' 'session' $null $FutureSessionId 200 $Goal
    $results += Test-Plan 'CP-LIVE-002' 'personal' $MemberId $FutureSessionId 200 $Goal
    $results += Test-Plan 'CP-LIVE-003' 'personal' $MemberId $null 200 $Goal
} else { Write-Host 'Live positive cases skipped by option or failing prerequisites.' }
$reportDir = Join-Path $PSScriptRoot 'reports'
New-Item -ItemType Directory -Path $reportDir -Force | Out-Null
$report = Join-Path $reportDir ('coach-plan-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '.json')
[pscustomobject]@{ generatedUtc=[DateTime]::UtcNow.ToString('o'); mode='LOCAL REAL API / SYNTHETIC DATA'; positiveRequested=(-not $OnlyNegative); results=$results } | ConvertTo-Json -Depth 10 | Set-Content -Path $report -Encoding UTF8
$results | Group-Object status | Select-Object Name,Count | Format-Table -AutoSize
Write-Host "Report: $report"
Remove-Variable token,headers -ErrorAction SilentlyContinue
if (@($results | Where-Object status -ne 'PASS').Count -gt 0) { exit 1 }
