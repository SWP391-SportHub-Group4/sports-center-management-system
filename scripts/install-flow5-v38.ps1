param([string]$Repo = '')
$ErrorActionPreference = 'Stop'
$root = if ($Repo) { (Resolve-Path $Repo).Path } else { (Resolve-Path (Join-Path $PSScriptRoot '..')).Path }
$payloadRoot = Join-Path $root 'v38-payload'
function Get-NormalizedHash([string]$Value) {
    $normalized = $Value.Replace("`r`n", "`n").TrimEnd([char]10)
    $sha = [Security.Cryptography.SHA256]::Create()
    try { return ([BitConverter]::ToString($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($normalized)))).Replace('-','').ToLowerInvariant() }
    finally { $sha.Dispose() }
}
# Fixed allowlist from the packaged manifest; validate every file before making changes.
$manifest = @'
[
  {
    "Target": "backend/SportHub.AI/Application/Services/MemberGeminiWorkoutGeneratorV32.cs",
    "Payload": "MemberGeminiWorkoutGeneratorV32.cs",
    "Before": [
      "026c9e572467c8b04c11f3f544031d1780e870eac62d42dd044059653ec61960"
    ],
    "After": "dd80258ca9213cfec7d270273e13be7e0745699fa205bc2d3a1322250ae76e7c"
  },
  {
    "Target": "ai-service/app/services/gemini_service.py",
    "Payload": "gemini_service.py",
    "Before": [
      "6131505c9d0ea84dcf142d22cbbb40c5eff4595e5542f2011db2b7106153983e"
    ],
    "After": "4eef8bacf249e7e2471843ed303a07b81e5016e6e7155072153c1379f5a7ff3f"
  },
  {
    "Target": "ai-service/app/services/member_chat_service.py",
    "Payload": "member_chat_service.py",
    "Before": [
      "4ab8bb6e1ed1d7bc243a376bf50f2415a3ce2485532ae7f7c64f4a6e43353aba"
    ],
    "After": "12436012534e1663db033e611203ddac4519f9005e03c960846fbb22377a6f94"
  }
]
'@ | ConvertFrom-Json
$changes = @()
foreach ($entry in $manifest) {
    $target = Join-Path $root $entry.Target
    $payload = Join-Path $payloadRoot $entry.Payload
    if (!(Test-Path $target -PathType Leaf) -or !(Test-Path $payload -PathType Leaf)) { throw "Missing source/payload: $($entry.Target). No files changed." }
    $before = [IO.File]::ReadAllText($target)
    $after = [IO.File]::ReadAllText($payload)
    if ((Get-NormalizedHash $after) -ne $entry.After) { throw "Payload checksum mismatch: $($entry.Payload). No files changed." }
    if ((Get-NormalizedHash $before) -eq $entry.After) { continue }
    if ($entry.Before -notcontains (Get-NormalizedHash $before)) { throw "Unrecognized local source: $($entry.Target). No files changed. Inspect local diff rather than overwrite." }
    $changes += [pscustomobject]@{Target=$target; After=$after; Name=$entry.Payload}
}
if ($changes.Count -eq 0) { Write-Host 'V38 already installed.'; exit 0 }
$backupDir = Join-Path $root ('flow5-test-results\backups\before-v38-' + (Get-Date -Format 'yyyyMMdd-HHmmss-fff'))
New-Item -ItemType Directory -Path $backupDir | Out-Null
foreach ($change in $changes) { [IO.File]::Copy($change.Target,(Join-Path $backupDir ($change.Name+'.bak')),$false) }
$written = @()
try {
    foreach ($change in $changes) {
        $written += $change
        [IO.File]::WriteAllText($change.Target,$change.After,[Text.UTF8Encoding]::new($false))
    }
} catch {
    foreach ($change in $written) { [IO.File]::Copy((Join-Path $backupDir ($change.Name+'.bak')),$change.Target,$true) }
    throw
}
Write-Host 'V38 installed. Restart the Python AI service/backend for application integration. No database or frontend changes.'
Write-Host "Backup: $backupDir"
