param([string]$Repo = '')
$ErrorActionPreference = 'Stop'
$root = if ($Repo) { (Resolve-Path $Repo).Path } else { (Resolve-Path (Join-Path $PSScriptRoot '..')).Path }
$file = Join-Path $root 'backend\SportHub.AI\Application\Services\MemberGeminiWorkoutGeneratorV32.cs'
$payload = Join-Path $root 'v37-payload\MemberGeminiWorkoutGeneratorV32.cs'
if (!(Test-Path $file -PathType Leaf) -or !(Test-Path $payload -PathType Leaf)) { throw 'Missing generator or V37 payload. No backend file changed.' }
function Get-NormalizedHash([string]$Value) {
    $normalized = $Value.Replace("`r`n", "`n").TrimEnd([char]10)
    $sha = [Security.Cryptography.SHA256]::Create()
    try { return ([BitConverter]::ToString($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($normalized)))).Replace('-','').ToLowerInvariant() }
    finally { $sha.Dispose() }
}
$before = [IO.File]::ReadAllText($file)
$after = [IO.File]::ReadAllText($payload)
$allowed = @('822798c5443e630664ed0e5576f750f52a092e331debfd6d06abaf2d0f818810','026c9e572467c8b04c11f3f544031d1780e870eac62d42dd044059653ec61960')
if ((Get-NormalizedHash $after) -ne '026c9e572467c8b04c11f3f544031d1780e870eac62d42dd044059653ec61960') { throw 'V37 payload checksum mismatch. No file changed.' }
if ((Get-NormalizedHash $before) -eq '026c9e572467c8b04c11f3f544031d1780e870eac62d42dd044059653ec61960') { Write-Host 'V37 backend already installed.'; exit 0 }
if ($allowed -notcontains (Get-NormalizedHash $before)) { throw 'Local generator differs from known V36. No backend file changed. Inspect the local diff before replacing.' }
$backupDir = Join-Path $root 'flow5-test-results\backups'
New-Item -ItemType Directory -Force -Path $backupDir | Out-Null
$backup = Join-Path $backupDir ('MemberGeminiWorkoutGeneratorV32.before-v37-' + (Get-Date -Format 'yyyyMMdd-HHmmss-fff') + '.txt')
[IO.File]::Copy($file,$backup,$false)
[IO.File]::WriteAllText($file,$after,[Text.UTF8Encoding]::new($false))
Write-Host 'V37 backend installed. No database, DTO or route changes.'
Write-Host "Backup: $backup"
