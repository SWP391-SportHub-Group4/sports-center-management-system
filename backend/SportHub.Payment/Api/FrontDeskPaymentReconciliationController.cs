using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SportHub.BuildingBlocks.Abstractions.Persistence;
using SportHub.BuildingBlocks.Api;
using SportHub.BuildingBlocks.SharedKernel.Errors;
using SportHub.BuildingBlocks.SharedKernel.Pagination;
using SportHub.Payment.Application.Services;
using SportHub.Payment.Domain.Entities;
using SportHub.Payment.Domain.Enums;

namespace SportHub.Payment.Api;

public sealed record FrontDeskReconciliationRow(Guid InvoiceId, string InvoiceNumber,
    Guid MemberId, string MemberName, Guid PaymentAttemptId, Guid? VerifiedEventId,
    decimal Amount, DateTime? PaidAtUtc, DateTime? HoldExpiresAtUtc, DateTime SortAtUtc,
    string State, string? LastError);

[ApiController]
[Authorize(Policy = SportHubPolicies.FrontDesk)]
[Route("api/front-desk/payment-reconciliation")]
public sealed class FrontDeskPaymentReconciliationController(ISportHubDbContext db,
    PaymentReconciliationService reconciliation) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> Queue([FromQuery] Guid? memberId,
        [FromQuery] int page = 1, [FromQuery] int pageSize = 20, CancellationToken ct = default)
    {
        page = Math.Clamp(page, 1, 1000);
        pageSize = Math.Clamp(pageSize, 1, 100);
        var scanLimit = page * pageSize;
        // A verified capture that has not fulfilled the service stays visible even after the hold expires.
        var capturedQuery = (from proof in db.Set<VerifiedGatewayEvent>().AsNoTracking()
                              join attempt in db.Set<PaymentAttempt>().AsNoTracking()
                                  on proof.PaymentAttemptId equals attempt.PaymentAttemptId
                              join invoice in db.Set<Invoice>().AsNoTracking()
                                  on attempt.InvoiceId equals invoice.InvoiceId
                              where proof.ResponseCode == "00" && proof.TransactionStatus == "00"
                                  && proof.ProcessingStatus != "Fulfilled"
                                  && (!memberId.HasValue || invoice.MemberId == memberId.Value)
                              orderby (invoice.HoldExpiresAtUtc ?? DateTime.MaxValue), proof.ProviderPaidAtUtc descending, attempt.PaymentAttemptId
                              select new FrontDeskReconciliationRow(invoice.InvoiceId, invoice.InvoiceNumber,
                                  invoice.MemberId, invoice.Member!.Profile != null
                                      ? invoice.Member.Profile.FullName : invoice.Member.Email,
                                  attempt.PaymentAttemptId, proof.VerifiedGatewayEventId, proof.Amount,
                                  proof.ProviderPaidAtUtc, invoice.HoldExpiresAtUtc, proof.ProviderPaidAtUtc,
                                  proof.ProcessingStatus, proof.LastError)
            );

        // Before the gateway returns proof, the desk can verify a pending or expired attempt.
        var unverifiedQuery = (from attempt in db.Set<PaymentAttempt>().AsNoTracking()
                                join invoice in db.Set<Invoice>().AsNoTracking()
                                    on attempt.InvoiceId equals invoice.InvoiceId
                                where (attempt.Status == PaymentAttemptStatus.Pending
                                        || attempt.Status == PaymentAttemptStatus.Expired
                                        || attempt.Status == PaymentAttemptStatus.ReconciliationRequired)
                                    && invoice.Status == InvoiceStatus.Issued
                                    && (!memberId.HasValue || invoice.MemberId == memberId.Value)
                                    && !db.Set<VerifiedGatewayEvent>().Any(e =>
                                        e.PaymentAttemptId == attempt.PaymentAttemptId)
                                orderby (invoice.HoldExpiresAtUtc ?? DateTime.MaxValue), attempt.CreatedAt descending, attempt.PaymentAttemptId
                                select new FrontDeskReconciliationRow(invoice.InvoiceId, invoice.InvoiceNumber,
                                    invoice.MemberId, invoice.Member!.Profile != null
                                        ? invoice.Member.Profile.FullName : invoice.Member.Email,
                                    attempt.PaymentAttemptId, null, attempt.Amount, null,
                                    invoice.HoldExpiresAtUtc, attempt.CreatedAt, "AWAITING_VERIFICATION", null)
            );

        var total = await capturedQuery.CountAsync(ct) + await unverifiedQuery.CountAsync(ct);
        var captured = await capturedQuery.Take(scanLimit).ToListAsync(ct);
        var unverified = await unverifiedQuery.Take(scanLimit).ToListAsync(ct);

        var items = captured.Concat(unverified)
            .OrderBy(x => x.State == "AWAITING_VERIFICATION" ? 1 : 0)
            .ThenBy(x => x.HoldExpiresAtUtc ?? DateTime.MaxValue)
            .ThenByDescending(x => x.SortAtUtc).ThenBy(x => x.PaymentAttemptId)
            .Skip((page - 1) * pageSize)
            .Take(pageSize).ToArray();
        return Ok(new PagedResult<FrontDeskReconciliationRow>
        { Items = items, TotalCount = total, Page = page, PageSize = pageSize });
    }

    [HttpPost("{invoiceId:guid}/retry")]
    public async Task<IActionResult> Retry(Guid invoiceId, CancellationToken ct)
    {
        var proof = await (from e in db.Set<VerifiedGatewayEvent>().AsNoTracking()
                           join a in db.Set<PaymentAttempt>().AsNoTracking()
                               on e.PaymentAttemptId equals a.PaymentAttemptId
                           where a.InvoiceId == invoiceId && e.ResponseCode == "00"
                               && e.TransactionStatus == "00" && e.ProcessingStatus != "Fulfilled"
                           orderby e.VerifiedAtUtc descending
                           select e.VerifiedGatewayEventId).FirstOrDefaultAsync(ct);
        if (proof != Guid.Empty)
        {
            await reconciliation.ProcessAsync(proof, ct);
            var status = await db.Set<VerifiedGatewayEvent>().AsNoTracking()
                .Where(x => x.VerifiedGatewayEventId == proof)
                .Select(x => x.ProcessingStatus).SingleAsync(ct);
            return Ok(new { state = status });
        }
        var attemptId = await db.Set<PaymentAttempt>().AsNoTracking()
            .Where(x => x.InvoiceId == invoiceId && (x.Status == PaymentAttemptStatus.Pending
                || x.Status == PaymentAttemptStatus.Expired
                || x.Status == PaymentAttemptStatus.ReconciliationRequired))
            .OrderByDescending(x => x.CreatedAt).Select(x => (Guid?)x.PaymentAttemptId)
            .FirstOrDefaultAsync(ct)
            ?? throw new NotFoundException("reconciliation_case_not_found", "No payment requiring reconciliation was found.");
        var verified = await reconciliation.ReconcileAttemptAsync(attemptId, ct);
        return Ok(new { state = verified ? "VERIFIED" : "AWAITING_VERIFICATION" });
    }
}
