using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using SportHub.BuildingBlocks.Abstractions.Persistence;
using SportHub.BuildingBlocks.Abstractions.Scheduling;
using SportHub.BuildingBlocks.SharedKernel.Errors;
using SportHub.BuildingBlocks.SharedKernel.Time;
using SportHub.Payment.VnPay;

namespace SportHub.Payment.Application.Services;

public sealed class PaymentReconciliationService(ISportHubDbContext db, IPaymentGateway gateway,
    PaymentFulfillmentService fulfillment, IClassEnrollmentFulfillment classes, IClock clock,
    Microsoft.Extensions.Logging.ILogger<PaymentReconciliationService> logger)
{
    public async Task<string> ReceiveCallbackAsync(IReadOnlyDictionary<string, string> fields, CancellationToken ct)
    {
        // The return URL does not invoke this method. Only IPN or independently signed QueryDR may write.
        var result = gateway.VerifyCallback(fields);
        await AcceptVerifiedAsync(result, verifiedByQuery: false, ct);
        return "00";
    }

    public async Task<bool> ReconcileAttemptAsync(Guid attemptId, CancellationToken ct)
    {
        var attempt = await db.Set<PaymentAttempt>().AsNoTracking()
            .SingleOrDefaultAsync(x => x.PaymentAttemptId == attemptId, ct)
            ?? throw new NotFoundException("payment_attempt_not_found", "Không tìm thấy attempt.");
        var result = await gateway.QueryAsync(attempt, ct);
        if (result is null) return false;
        await AcceptVerifiedAsync(result, verifiedByQuery: true, ct);
        return true;
    }

    private async Task AcceptVerifiedAsync(VerifiedPaymentResult result, bool verifiedByQuery, CancellationToken ct)
    {
        var attempt = await db.Set<PaymentAttempt>().AsNoTracking()
            .SingleOrDefaultAsync(x => x.VnpTxnRef == result.TransactionReference, ct)
            ?? throw new NotFoundException("payment_attempt_not_found", "Không tìm thấy mã giao dịch.");
        if (!verifiedByQuery && attempt.Amount != result.AmountVnd)
            throw new ConflictException("vnp_amount_mismatch", "Số tiền VNPay không khớp attempt.");
        var eventId = Guid.NewGuid();
        var verifiedAt = clock.UtcNow;
        const string provider = "VNPay";
        const string pending = "Pending";
        // Durable inbox write precedes any fulfillment. ON CONFLICT makes concurrent duplicate IPNs harmless.
        await db.Database.ExecuteSqlInterpolatedAsync($"""
            INSERT INTO verified_gateway_events
              (verified_gateway_event_id, payment_attempt_id, provider, provider_transaction_id,
               transaction_reference, amount, response_code, transaction_status,
               provider_paid_at_utc, verified_at_utc, processing_status, retry_count)
            VALUES ({eventId}, {attempt.PaymentAttemptId}, {provider},
               {result.ProviderTransactionId}, {result.TransactionReference}, {result.AmountVnd},
               {result.ResponseCode}, {result.TransactionStatus}, {result.ProviderPaidAtUtc},
               {verifiedAt}, {pending}, 0)
            ON CONFLICT (provider, provider_transaction_id) DO NOTHING
            """, ct);
        var proof = await db.Set<VerifiedGatewayEvent>().AsNoTracking()
            .SingleAsync(x => x.Provider == "VNPay" && x.ProviderTransactionId == result.ProviderTransactionId, ct);
        if (proof.PaymentAttemptId != attempt.PaymentAttemptId || proof.Amount != result.AmountVnd
            || proof.ResponseCode != result.ResponseCode || proof.TransactionStatus != result.TransactionStatus)
            throw new ConflictException("provider_transaction_conflict", "Mã giao dịch VNPay trùng với dữ liệu khác.");
        await ProcessAsync(proof.VerifiedGatewayEventId, ct);
    }

    public async Task<int> RetryPendingAsync(CancellationToken ct)
    {
        var ids = await db.Set<VerifiedGatewayEvent>().AsNoTracking()
            .Where(x => x.ProcessingStatus == "Pending" || x.ProcessingStatus == "ReconciliationRequired")
            .OrderBy(x => x.VerifiedAtUtc).Take(25).Select(x => x.VerifiedGatewayEventId).ToListAsync(ct);
        foreach (var id in ids) await ProcessAsync(id, ct);
        var dueAttempts = await db.Set<PaymentAttempt>().AsNoTracking()
            .Where(a => a.Status == PaymentAttemptStatus.Pending && a.CheckoutSessionId != null
                && a.CreatedAt < clock.UtcNow.AddMinutes(-2))
            .OrderBy(a => a.CreatedAt).Take(25).Select(a => a.PaymentAttemptId).ToListAsync(ct);
        foreach (var attemptId in dueAttempts)
        {
            try { await ReconcileAttemptAsync(attemptId, ct); }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                logger.LogWarning(ex, "QueryDR failed for attempt {AttemptId}", attemptId);
            }
        }
        return ids.Count;
    }

    public async Task ProcessAsync(Guid eventId, CancellationToken ct)
    {
        var candidate = await db.Set<VerifiedGatewayEvent>().AsNoTracking()
            .SingleOrDefaultAsync(x => x.VerifiedGatewayEventId == eventId, ct)
            ?? throw new NotFoundException("verified_event_not_found", "Không tìm thấy chứng cứ giao dịch.");
        var attemptId = candidate.PaymentAttemptId;
        var invoiceId = await db.Set<PaymentAttempt>().AsNoTracking().Where(x => x.PaymentAttemptId == attemptId)
            .Select(x => x.InvoiceId).SingleAsync(ct);
        try
        {
            await using var tx = await db.Database.BeginTransactionAsync(ct);
            var invoice = await db.Set<Invoice>().FromSqlInterpolated(
                $"SELECT * FROM invoices WHERE invoice_id = {invoiceId} FOR UPDATE").SingleAsync(ct);
            var proof = await db.Set<VerifiedGatewayEvent>().FromSqlInterpolated(
                $"SELECT * FROM verified_gateway_events WHERE verified_gateway_event_id = {eventId} FOR UPDATE")
                .SingleAsync(ct);
            if (proof.ProcessingStatus is "Fulfilled" or "Compensated" or "Failed")
            {
                await tx.CommitAsync(ct);
                return;
            }
            var attempt = await db.Set<PaymentAttempt>().SingleAsync(x => x.PaymentAttemptId == attemptId, ct);
            if (proof.ResponseCode != "00" || proof.TransactionStatus != "00")
            {
                proof.ProcessingStatus = "Failed";
                proof.ProcessedAtUtc = clock.UtcNow;
                if (attempt.Status != PaymentAttemptStatus.Succeeded)
                    attempt.Status = PaymentAttemptStatus.Failed;
                attempt.VerifiedResult = "Failed";
                attempt.VerifiedAtUtc = proof.VerifiedAtUtc;
            }
            else
            {
                var session = await db.Set<CheckoutSession>().SingleOrDefaultAsync(
                    x => x.CheckoutSessionId == attempt.CheckoutSessionId, ct);
                if (proof.Amount != attempt.Amount)
                {
                    await fulfillment.CompensateCashAsync(invoice, proof, ct);
                    attempt.VerifiedResult = "CompensatedAmountMismatch";
                    attempt.VerifiedAtUtc = proof.VerifiedAtUtc;
                    attempt.Status = PaymentAttemptStatus.ReconciliationRequired;
                }
                else if (session is null || invoice.Status != InvoiceStatus.Issued
                    || session.State != "Active" || session.ExpiresAtUtc <= clock.UtcNow
                    || invoice.CheckoutCycleId != session.CheckoutSessionId)
                {
                    var reacquired = await TryReacquireClassAsync(invoice, attempt, session, proof, ct);
                    if (reacquired is not null)
                        await fulfillment.CompleteVerifiedAsync(invoice, reacquired, attempt, proof, ct,
                            lateReacquired: true);
                    else
                    {
                        await fulfillment.CompensateCashAsync(invoice, proof, ct);
                        attempt.VerifiedResult = "Compensated";
                        attempt.VerifiedAtUtc = proof.VerifiedAtUtc;
                    }
                }
                else
                    await fulfillment.CompleteVerifiedAsync(invoice, session, attempt, proof, ct);
            }
            await db.SaveChangesAsync(ct);
            await tx.CommitAsync(ct);
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            // A separate transaction records the durable failure after the business transaction rolls back.
            await db.Set<VerifiedGatewayEvent>().Where(x => x.VerifiedGatewayEventId == eventId
                    && x.ProcessingStatus != "Fulfilled" && x.ProcessingStatus != "Compensated")
                .ExecuteUpdateAsync(x => x.SetProperty(e => e.ProcessingStatus, "ReconciliationRequired")
                    .SetProperty(e => e.RetryCount, e => e.RetryCount + 1)
                    .SetProperty(e => e.LastError, ex.GetType().Name), CancellationToken.None);
            await db.Set<Invoice>().Where(x => x.InvoiceId == invoiceId && x.Status == InvoiceStatus.Issued)
                .ExecuteUpdateAsync(x => x.SetProperty(i => i.ReconciliationRequired, true), CancellationToken.None);
            await db.Set<PaymentAttempt>().Where(x => x.PaymentAttemptId == attemptId)
                .ExecuteUpdateAsync(x => x.SetProperty(a => a.Status, PaymentAttemptStatus.ReconciliationRequired),
                    CancellationToken.None);
        }
    }

    private async Task<CheckoutSession?> TryReacquireClassAsync(Invoice invoice,
        PaymentAttempt attempt, CheckoutSession? oldSession, VerifiedGatewayEvent proof, CancellationToken ct)
    {
        if (oldSession?.Kind != "Class" || oldSession.ClassId is not int classId
            || attempt.PointsSnapshot != 0 || invoice.PointsApplied != 0
            || invoice.Status is InvoiceStatus.Paid or InvoiceStatus.PaidAfterReconciliation)
            return null;
        try
        {
            // The invoice row is already locked. Serialize the member's timetable before class capacity.
            await db.Database.ExecuteSqlInterpolatedAsync(
                $"SELECT user_id FROM user_accounts WHERE user_id = {invoice.MemberId} FOR UPDATE", ct);
            if (oldSession.ResourceHoldId is Guid oldHold)
                await classes.ReleaseAsync(oldHold, ct);
            var quote = await classes.QuoteAsync(classId, invoice.MemberId, ct);
            var expiry = clock.UtcNow.AddMinutes(1);
            if (expiry >= quote.FirstSessionUtc.UtcDateTime)
                expiry = quote.FirstSessionUtc.UtcDateTime.AddSeconds(-1);
            if (expiry <= clock.UtcNow) return null;
            var hold = await classes.ReserveAsync(classId, invoice.MemberId,
                invoice.InvoiceId, new DateTimeOffset(expiry), ct);
            var item = await db.Set<InvoiceItem>().SingleAsync(x => x.InvoiceId == invoice.InvoiceId
                && x.ItemType == InvoiceItemType.ClassPackage, ct);
            item.RelatedEntityId = hold.SeatHoldId;
            oldSession.State = "Expired";
            var renewed = new CheckoutSession
            {
                CheckoutSessionId = Guid.NewGuid(), InvoiceId = invoice.InvoiceId,
                Revision = invoice.CheckoutRevision + 1,
                IdempotencyKey = "late-" + proof.VerifiedGatewayEventId.ToString("N"),
                Kind = "Class", State = "Active", ClassId = classId,
                ResourceHoldId = hold.SeatHoldId, CreatedAtUtc = clock.UtcNow,
                ExpiresAtUtc = expiry
            };
            db.Set<CheckoutSession>().Add(renewed);
            invoice.CheckoutCycleId = renewed.CheckoutSessionId;
            invoice.CheckoutRevision = renewed.Revision;
            invoice.HoldExpiresAtUtc = expiry;
            invoice.Status = InvoiceStatus.Issued;
            await db.SaveChangesAsync(ct);
            return renewed;
        }
        catch (ConflictException)
        {
            // Business conflicts (capacity, schedule, class start) mean the capture must be compensated.
            return null;
        }
        catch (BadRequestException)
        {
            return null;
        }
        catch (NotFoundException)
        {
            return null;
        }
    }
}
