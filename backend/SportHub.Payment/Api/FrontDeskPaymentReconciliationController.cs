using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SportHub.BuildingBlocks.Abstractions.Audit;
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
    string State, string? LastError,
    string MemberEmail = "", DateTime IssuedAtUtc = default, decimal TotalAmount = 0, int PointsApplied = 0,
    string InvoiceStatus = "", DateTime AttemptCreatedAtUtc = default,
    IReadOnlyList<FrontDeskReconciliationItem>? Items = null);

public sealed record FrontDeskReconciliationItem(string Description, string? SportName, int Quantity,
    decimal UnitPrice, decimal LineAmount);

[ApiController]
[Authorize(Policy = SportHubPolicies.FrontDesk)]
[Route("api/front-desk/payment-reconciliation")]
public sealed class FrontDeskPaymentReconciliationController(ISportHubDbContext db,
    PaymentReconciliationService reconciliation, IAuditWriter audit) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> Queue([FromQuery] Guid? memberId,
        [FromQuery] int page = 1, [FromQuery] int pageSize = 20,
        [FromQuery] string? caseType = null, CancellationToken ct = default)
    {
        if (caseType is not null && caseType != "captured" && caseType != "unverified")
            return BadRequest(new { error = "Invalid caseType. Use captured or unverified." });
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
                                  && proof.ProcessingStatus != "Compensated"
                                  && proof.ProcessingStatus != "Failed"
                                  && (!memberId.HasValue || invoice.MemberId == memberId.Value)
                              orderby (invoice.HoldExpiresAtUtc ?? DateTime.MaxValue), proof.ProviderPaidAtUtc descending, attempt.PaymentAttemptId
                              select new FrontDeskReconciliationRow(invoice.InvoiceId, invoice.InvoiceNumber,
                                  invoice.MemberId, invoice.Member!.Profile != null
                                      ? invoice.Member.Profile.FullName : invoice.Member.Email,
                                  attempt.PaymentAttemptId, proof.VerifiedGatewayEventId, proof.Amount,
                                  proof.ProviderPaidAtUtc, invoice.HoldExpiresAtUtc, proof.ProviderPaidAtUtc,
                                  proof.ProcessingStatus, proof.LastError,
                                  invoice.Member.Email, invoice.IssuedAt, invoice.TotalAmount, invoice.PointsApplied,
                                  invoice.Status.ToString(), attempt.CreatedAt)
            );

        // Before the gateway returns proof, the desk can verify a pending or expired attempt.
        var unverifiedQuery = (from attempt in db.Set<PaymentAttempt>().AsNoTracking()
                                join invoice in db.Set<Invoice>().AsNoTracking()
                                    on attempt.InvoiceId equals invoice.InvoiceId
                                where (attempt.Status == PaymentAttemptStatus.Pending
                                        || attempt.Status == PaymentAttemptStatus.Expired
                                        || attempt.Status == PaymentAttemptStatus.ReconciliationRequired)
                                    && (invoice.Status == InvoiceStatus.Issued || invoice.Status == InvoiceStatus.Void)
                                    && (!memberId.HasValue || invoice.MemberId == memberId.Value)
                                    && !db.Set<VerifiedGatewayEvent>().Any(e =>
                                        e.PaymentAttemptId == attempt.PaymentAttemptId)
                                orderby (invoice.HoldExpiresAtUtc ?? DateTime.MaxValue), attempt.CreatedAt descending, attempt.PaymentAttemptId
                                select new FrontDeskReconciliationRow(invoice.InvoiceId, invoice.InvoiceNumber,
                                    invoice.MemberId, invoice.Member!.Profile != null
                                        ? invoice.Member.Profile.FullName : invoice.Member.Email,
                                    attempt.PaymentAttemptId, null, attempt.Amount, null,
                                    invoice.HoldExpiresAtUtc, attempt.CreatedAt, "AWAITING_VERIFICATION", null,
                                    invoice.Member.Email, invoice.IssuedAt, invoice.TotalAmount, invoice.PointsApplied,
                                    invoice.Status.ToString(), attempt.CreatedAt)
            );

        var includeCaptured = caseType != "unverified";
        var includeUnverified = caseType != "captured";
        var total = (includeCaptured ? await capturedQuery.CountAsync(ct) : 0)
                  + (includeUnverified ? await unverifiedQuery.CountAsync(ct) : 0);
        var captured = includeCaptured
            ? await capturedQuery.Take(scanLimit).ToListAsync(ct)
            : new List<FrontDeskReconciliationRow>();
        var unverified = includeUnverified
            ? await unverifiedQuery.Take(scanLimit).ToListAsync(ct)
            : new List<FrontDeskReconciliationRow>();

        var items = captured.Concat(unverified)
            .OrderBy(x => x.State == "AWAITING_VERIFICATION" ? 1 : 0)
            .ThenBy(x => x.HoldExpiresAtUtc ?? DateTime.MaxValue)
            .ThenByDescending(x => x.SortAtUtc).ThenBy(x => x.PaymentAttemptId)
            .Skip((page - 1) * pageSize)
            .Take(pageSize).ToArray();
        // What each invoice is for, so the desk does not need to open the invoice.
        var invoiceIds = items.Select(x => x.InvoiceId).Distinct().ToList();
        var lines = (await db.Set<InvoiceItem>().AsNoTracking().Where(x => invoiceIds.Contains(x.InvoiceId))
                .OrderBy(x => x.Description)
                .Select(x => new { x.InvoiceId, Line = new FrontDeskReconciliationItem(x.Description,
                    x.SportNameSnapshot, x.Quantity, x.UnitPrice, x.LineAmount) })
                .ToListAsync(ct))
            .ToLookup(x => x.InvoiceId, x => x.Line);
        items = items.Select(x => x with { Items = lines[x.InvoiceId].ToList() }).ToArray();
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
                               && e.TransactionStatus == "00"
                               && e.ProcessingStatus != "Fulfilled"
                               && e.ProcessingStatus != "Compensated"
                               && e.ProcessingStatus != "Failed"
                               && e.ProcessingStatus != "ManualCompensationRequired"
                           orderby e.VerifiedAtUtc descending
                           select e.VerifiedGatewayEventId).FirstOrDefaultAsync(ct);
        if (proof != Guid.Empty)
        {
            await reconciliation.ProcessAsync(proof, ct);
            var status = await db.Set<VerifiedGatewayEvent>().AsNoTracking()
                .Where(x => x.VerifiedGatewayEventId == proof)
                .Select(x => x.ProcessingStatus).SingleAsync(ct);
            await WriteAuditAsync(invoiceId, status, ct);
            return Ok(new { state = status });
        }
        var attemptId = await db.Set<PaymentAttempt>().AsNoTracking()
            .Where(x => x.InvoiceId == invoiceId && !db.Set<VerifiedGatewayEvent>().Any(e =>
                    e.PaymentAttemptId == x.PaymentAttemptId)
                && (x.Status == PaymentAttemptStatus.Pending
                || x.Status == PaymentAttemptStatus.Expired
                || x.Status == PaymentAttemptStatus.ReconciliationRequired))
            .OrderByDescending(x => x.CreatedAt).Select(x => (Guid?)x.PaymentAttemptId)
            .FirstOrDefaultAsync(ct)
            ?? throw new NotFoundException("reconciliation_case_not_found", "No payment requiring reconciliation was found.");
        var verified = await reconciliation.ReconcileAttemptAsync(attemptId, ct);
        var outcome = verified ? "VERIFIED" : "AWAITING_VERIFICATION";
        await WriteAuditAsync(invoiceId, outcome, ct);
        return Ok(new { state = outcome });
    }

    private async Task WriteAuditAsync(Guid invoiceId, string outcome, CancellationToken ct)
    {
        audit.Write(new AuditEntry(User.RequireUserId(), "FRONT_DESK_PAYMENT_RECONCILIATION_RETRY",
            nameof(Invoice), invoiceId.ToString(), NewValue: System.Text.Json.JsonSerializer.Serialize(outcome)));
        await db.SaveChangesAsync(ct);
    }
}
