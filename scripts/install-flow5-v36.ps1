param([string]$Repo = '')
$ErrorActionPreference = 'Stop'
$root = if ($Repo) { (Resolve-Path $Repo).Path } else { (Resolve-Path (Join-Path $PSScriptRoot '..')).Path }
$file = Join-Path $root 'backend\SportHub.AI\Application\Services\MemberGeminiWorkoutGeneratorV32.cs'
$payload = Join-Path $root 'v36-payload\MemberGeminiWorkoutGeneratorV32.cs'
if (!(Test-Path $file -PathType Leaf) -or !(Test-Path $payload -PathType Leaf)) { throw 'Missing generator or V36 payload. No backend file changed.' }
function Get-NormalizedHash([string]$Value) {
    $normalized = $Value.Replace("`r`n", "`n").TrimEnd([char]10)
    $sha = [Security.Cryptography.SHA256]::Create()
    try { return ([BitConverter]::ToString($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($normalized)))).Replace('-','').ToLowerInvariant() }
    finally { $sha.Dispose() }
}
$before = [IO.File]::ReadAllText($file)
$after = [IO.File]::ReadAllText($payload)
$allowed = @('16303dec7f63794a1f412e9349bf84bd7729a77b78db94ee05d96ce77c140efb','f48b69c54501f0a71ef0d99a53c94794bc33637bd3e6a94c6e7f21eceb7ec7f2','822798c5443e630664ed0e5576f750f52a092e331debfd6d06abaf2d0f818810')
if ((Get-NormalizedHash $after) -ne '822798c5443e630664ed0e5576f750f52a092e331debfd6d06abaf2d0f818810') { throw 'V36 payload checksum mismatch. No file changed.' }
if ((Get-NormalizedHash $before) -eq '822798c5443e630664ed0e5576f750f52a092e331debfd6d06abaf2d0f818810') { Write-Host 'V36 backend already installed.'; exit 0 }
if ($allowed -notcontains (Get-NormalizedHash $before)) { throw 'Local generator differs from known V34/V35. No backend file changed. Inspect the local diff before replacing.' }
$backupDir = Join-Path $root 'flow5-test-results\backups'
New-Item -ItemType Directory -Force -Path $backupDir | Out-Null
$backup = Join-Path $backupDir ('MemberGeminiWorkoutGeneratorV32.before-v36-' + (Get-Date -Format 'yyyyMMdd-HHmmss-fff') + '.txt')
[IO.File]::Copy($file,$backup,$false)
[IO.File]::WriteAllText($file,$after,[Text.UTF8Encoding]::new($false))
Write-Host 'V36 backend installed. No database, DTO or route changes.'
Write-Host "Backup: $backup"
