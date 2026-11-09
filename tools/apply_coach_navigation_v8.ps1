param([switch]$Apply)
$ErrorActionPreference = 'Stop'
$repo = (Get-Location).Path
$target = Join-Path $repo 'backend\SportHub.AI\Application\Services\CoachChatRuntime.cs'
$newFile = Join-Path $repo 'backend\SportHub.AI\Application\Services\CoachClassesStudentsNavigation.cs'
if (!(Test-Path $target) -or !(Test-Path $newFile)) {
    throw 'Run from repo root and copy CoachClassesStudentsNavigation.cs into backend first.'
}
$content = [System.IO.File]::ReadAllText($target)
$call = 'CoachClassesStudentsNavigation.TryAnswer(question)'
if ($content.Contains($call)) {
    Write-Host 'ALREADY APPLIED: no files changed.'
    exit 0
}
# Insert at the beginning of the verified, Coach-only navigation method. It is used
# solely after backend role authentication; Member and AI Plan never call it.
$pattern = '(?m)(internal\s+static\s+string\?\s+TryStaticNavigationAnswer\s*\(\s*string\s+question\s*\)\s*\{)'
$matches = [regex]::Matches($content, $pattern)
if ($matches.Count -ne 1) {
    throw 'Coach-only navigation method not found exactly once. No files changed; supply current CoachChatRuntime.cs for safe integration.'
}
$replacement = $matches[0].Value + "`r`n        var coachClassesStudentsNavigation = $call;`r`n" +
    '        if (coachClassesStudentsNavigation is not null) return coachClassesStudentsNavigation;'
$updated = $content.Remove($matches[0].Index, $matches[0].Length).Insert($matches[0].Index,$replacement)
if (!$Apply) {
    Write-Host 'DRY RUN PASS: Coach-only Classes/Students navigation insertion is possible. No files changed.'
    exit 0
}
$backup = $target + '.before-coach-navigation-v8.bak'
if (!(Test-Path $backup)) { Copy-Item -LiteralPath $target -Destination $backup -ErrorAction Stop }
$temp = $target + '.v8.tmp'
try {
    [System.IO.File]::WriteAllText($temp,$updated,[System.Text.UTF8Encoding]::new($false))
    Move-Item -LiteralPath $temp -Destination $target -Force
} finally { if (Test-Path $temp) { Remove-Item -LiteralPath $temp -Force } }
Write-Host 'APPLIED: CoachChatRuntime.cs only. AI Plan, Member and Manager prompts unchanged.'
