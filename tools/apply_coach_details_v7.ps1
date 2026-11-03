param([switch]$Apply)
$ErrorActionPreference = 'Stop'
$root = (Get-Location).Path
$target = Join-Path $root 'backend\SportHub.AI\Application\Services\CoachChatRuntime.cs'
$newFile = Join-Path $root 'backend\SportHub.AI\Application\Services\CoachClassStudentKnowledge.cs'
if (!(Test-Path $target) -or !(Test-Path $newFile)) { throw 'Run from repo root and copy CoachClassStudentKnowledge.cs first.' }
$source = [System.IO.File]::ReadAllText($target)
if ($source.Contains('CoachClassStudentKnowledge.TryAnswerAsync(')) {
    Write-Host 'ALREADY INTEGRATED: No files changed.'
    exit 0
}
$marker = '        var staticAnswer = TryStaticNavigationAnswer(question);'
$signature = 'internal static async Task<string?> TryAnswerAsync(ISportHubDbContext db, Guid coachId,'
if (!$source.Contains($signature) -or !$source.Contains($marker)) {
    throw 'Expected Coach runtime signature/anchor not found. No files changed; do not force patch.'
}
if (($source.Split(@($marker), [System.StringSplitOptions]::None).Length - 1) -ne 1) {
    throw 'Anchor must appear once. No files changed.'
}
$added = '        var detailsAnswer = await CoachClassStudentKnowledge.TryAnswerAsync(db, coachId, question, ct);' + "`n" +
         '        if (detailsAnswer is not null) return detailsAnswer;' + "`n" + $marker
if (!$Apply) {
    Write-Host 'DRY RUN PASS: Exactly one Coach-specific insertion available. No files changed.'
    exit 0
}
$backup = "$target.before-v7.bak"
if (!(Test-Path $backup)) { Copy-Item -LiteralPath $target -Destination $backup -ErrorAction Stop }
$updated = $source.Replace($marker, $added)
$temp = "$target.v7.tmp"
try {
    [System.IO.File]::WriteAllText($temp, $updated, [System.Text.UTF8Encoding]::new($false))
    Move-Item -LiteralPath $temp -Destination $target -Force
} finally {
    if (Test-Path $temp) { Remove-Item $temp -Force }
}
Write-Host 'APPLIED: Only CoachChatRuntime.cs changed; AI Plan and Member files unchanged.'
