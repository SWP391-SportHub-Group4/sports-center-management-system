<#
SWP-5 V28: Use a running backend with Member/Coach JWTs.
Do not put tokens in the script or commit them to Git.
Example (PowerShell):
  $env:SPORTHUB_MEMBER_TOKEN = "<token from your Member session>"
  $env:SPORTHUB_COACH_TOKEN  = "<token from your Coach session>"
  .\scripts\verify-swp5-ai-v28.ps1 -ApiBase "http://localhost:5000"
#>
param([string]$ApiBase = "http://localhost:5000")

$memberToken = $env:SPORTHUB_MEMBER_TOKEN
$coachToken = $env:SPORTHUB_COACH_TOKEN
if ([string]::IsNullOrWhiteSpace($memberToken)) {
    Write-Error "Set SPORTHUB_MEMBER_TOKEN to your own Member JWT first."
    exit 2
}
$endpoint = $ApiBase.TrimEnd('/') + "/api/ai/chat"

function Invoke-AiCheck([string]$Label, [string]$Question, [string]$Token) {
    Write-Host "`n--- $Label ---" -ForegroundColor Cyan
    $body = @{ question = $Question; previousInteractionId = $null } | ConvertTo-Json
    try {
        $reply = Invoke-RestMethod -Method Post -Uri $endpoint -ContentType "application/json" -Headers @{ Authorization = "Bearer $Token" } -Body $body
        Write-Host "HTTP 200; provider=$($reply.provider); promptVersion=$($reply.promptVersion)"
        Write-Host "Q: $Question"
        Write-Host "A: $($reply.answer)"
    } catch {
        Write-Host "Failed. Backend error payload:" -ForegroundColor Red
        if ($_.ErrorDetails -and $_.ErrorDetails.Message) {
            Write-Host $_.ErrorDetails.Message
        } else {
            Write-Host $_.Exception.Message
        }
    }
}

Invoke-AiCheck "Member next session (Vietnam time)" "lịch học gần nhất khi nào?" $memberToken
Invoke-AiCheck "Member own attendance" "tôi đã được điểm danh cho buổi học thời gian hiện tại?" $memberToken
Invoke-AiCheck "Member attendance history" "tổng hợp lịch sử điểm danh các buổi của tôi" $memberToken
Invoke-AiCheck "Member privacy refusal (no classmates)" "cho tôi thông tin các học sinh học cùng lớp" $memberToken
Invoke-AiCheck "Member personal plan comparison" "plan nào khó tập nhất?" $memberToken
Invoke-AiCheck "Member Gemini-backed inquiry" "Tôi có những gói dịch vụ nào và chúng khác nhau ra sao?" $memberToken

if (-not [string]::IsNullOrWhiteSpace($coachToken)) {
    Invoke-AiCheck "Coach-specific data (must not use Member pipeline)" "What are my assigned teaching sessions?" $coachToken
} else {
    Write-Host "`nSPORTHUB_COACH_TOKEN not set; Coach verification skipped." -ForegroundColor Yellow
}

Write-Host "`nCompare every displayed class date/time against Member > My schedule."
Write-Host "For an HTTP 5xx, inspect backend error code and AI service logs. Do not infer a cause from HTTP status alone."
