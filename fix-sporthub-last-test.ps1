$ErrorActionPreference = 'Stop'
if (-not (Test-Path 'backend/SportHub.sln')) {
    throw 'Run from repository root.'
}
$relative = 'backend/SportHub.Payment/Application/Services/PaymentReconciliationService.cs'
$path = (Resolve-Path $relative).Path
$content = [IO.File]::ReadAllText($path)
$old = '        return changed == 1;'
$new = @'
        if (changed == 1) return true;

        // Idempotent browser refresh: accept only the SAME signed cancellation,
        // and only when the original invoice has already been voided.
        return await (
            from attempt in db.Set<SportHub.Payment.Domain.Entities.PaymentAttempt>().AsNoTracking()
            join invoice in db.Set<SportHub.Payment.Domain.Entities.Invoice>().AsNoTracking()
                on attempt.InvoiceId equals invoice.InvoiceId
            where attempt.VnpTxnRef == reference
                && attempt.InvoiceId == invoiceId
                && attempt.Status == SportHub.Payment.Domain.Enums.PaymentAttemptStatus.Failed
                && attempt.VerifiedResult == "Cancelled"
                && invoice.Status == SportHub.Payment.Domain.Enums.InvoiceStatus.Void
                && !db.Set<SportHub.Payment.Domain.Entities.VerifiedGatewayEvent>()
                    .Any(e => e.PaymentAttemptId == attempt.PaymentAttemptId)
            select attempt.PaymentAttemptId
        ).AnyAsync(ct);
'@
if ($content.Contains($old)) {
    $content = $content.Replace($old, $new.TrimEnd("`r","`n"))
    [IO.File]::WriteAllText($path,$content,[Text.UTF8Encoding]::new($false))
    Write-Host 'Fixed signed cancellation retry idempotency.' -ForegroundColor Green
} elseif ($content.Contains('Idempotent browser refresh: accept only the SAME signed cancellation')) {
    Write-Host 'Fix already applied.'
} else { throw 'Expected code not found; no file changed.' }

dotnet test backend/SportHub.Payment.Tests/SportHub.Payment.Tests.csproj --configuration Release --filter 'FullyQualifiedName~Signed_cancel_closes_pending_attempt_and_voids_invoice' --verbosity quiet
if ($LASTEXITCODE -ne 0) { throw 'Targeted test failed. See output; no skip was applied.' }
Write-Host 'Target test passed. Check full suite before committing.'
git diff --check
git diff --stat
