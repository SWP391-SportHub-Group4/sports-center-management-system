<#
.SYNOPSIS
  Times the revenue report, its reconciliation and the operations health page against a running API (for example staging)
  and fails when a figure does not match its source records or a call is too slow.

.DESCRIPTION
  Read-only: it only issues GET requests. It never logs in for you: pass a Center Manager access token you obtained yourself,
  so no password is typed into or stored by this script.

.EXAMPLE
  $env:SPORTHUB_TOKEN = '<manager access token>'
  ./scripts/Test-ReportPerformance.ps1 -BaseUrl https://staging.example.com -From 2026-09-01 -To 2026-09-30
#>
param(
    [Parameter(Mandatory)] [string] $BaseUrl,
    [Parameter(Mandatory)] [string] $From,
    [Parameter(Mandatory)] [string] $To,
    [string] $Token = $env:SPORTHUB_TOKEN,
    # Budgets for a month of real data; tune them with the numbers from the first healthy run.
    [int] $ReportBudgetSeconds = 10,
    [int] $ReconciliationBudgetSeconds = 30,
    [int] $HealthBudgetSeconds = 5
)

if (-not $Token) { throw 'Pass -Token or set SPORTHUB_TOKEN to a Center Manager access token.' }
$headers = @{ Authorization = "Bearer $Token" }
$base = $BaseUrl.TrimEnd('/')
$failures = New-Object System.Collections.Generic.List[string]

function Measure-Get([string] $name, [string] $path, [int] $budgetSeconds) {
    $watch = [System.Diagnostics.Stopwatch]::StartNew()
    $body = Invoke-RestMethod -Uri "$base$path" -Headers $headers -TimeoutSec 300
    $watch.Stop()
    $seconds = [math]::Round($watch.Elapsed.TotalSeconds, 2)
    $verdict = if ($seconds -le $budgetSeconds) { 'ok' } else { 'SLOW' }
    '{0,-16} {1,8}s  (budget {2}s)  {3}' -f $name, $seconds, $budgetSeconds, $verdict | Write-Host
    if ($seconds -gt $budgetSeconds) { $failures.Add("$name took ${seconds}s, budget ${budgetSeconds}s") }
    return $body
}

$range = "fromDate=$From&toDate=$To"
$report = Measure-Get 'revenue report' "/api/reports/revenue?$range" $ReportBudgetSeconds
$check = Measure-Get 'reconciliation' "/api/reports/revenue/reconciliation?$range" $ReconciliationBudgetSeconds
$health = Measure-Get 'ops health' '/api/manager/operations/health' $HealthBudgetSeconds

''
"Period            $From .. $To"
"Payments          $($report.paymentCount)    Invoices with payments  $($report.invoiceCount)"
"Cash collected    $($report.totalCollected)    Net revenue  $($report.netRevenue)"
"Paid invoices checked  $($check.paidInvoicesChecked)  (server time $($check.durationMs) ms)"

foreach ($c in $check.checks) {
    if (-not $c.ok) { $failures.Add("Reconciliation: $($c.name) reported $($c.reported) but records say $($c.actual) (delta $($c.delta))") }
}
if ($check.invoiceMismatchCount -gt 0) {
    $failures.Add("$($check.invoiceMismatchCount) paid invoice(s) whose cash/points do not match their payments, e.g. $($check.invoiceMismatches[0].invoiceNumber)")
}
if ($health.status -ne 'Healthy') { Write-Warning "Operations health is $($health.status)." }
$health.jobs | Where-Object { $_.unhealthy } | ForEach-Object { Write-Warning "Job not keeping up: $($_.name) $($_.lastError)" }

''
if ($failures.Count -gt 0) {
    $failures | ForEach-Object { Write-Host "FAIL  $_" -ForegroundColor Red }
    exit 1
}
Write-Host 'PASS  report matches its records and every call is within budget.' -ForegroundColor Green
