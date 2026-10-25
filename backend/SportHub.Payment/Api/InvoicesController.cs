using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SportHub.BuildingBlocks.Abstractions.Persistence;
using SportHub.Payment.Domain.Entities;
using SportHub.Payment.Domain.Enums;
using SportHub.BuildingBlocks.Api;
using SportHub.BuildingBlocks.SharedKernel.Errors;
using SportHub.Payment.Application.Commands;
using SportHub.Payment.Application.DTOs;
using SportHub.Payment.Application.Interfaces;
using SportHub.Payment.Application.Services;

namespace SportHub.Payment.Api;

[ApiController]
[Authorize]
[Route("api")]
public class InvoicesController(
    IInvoiceQueryService invoices,
    IInvoiceReceiptService receipts,
    IPackagePurchaseService purchases,
    IPaymentRecordingService payments,
    IPaymentAdjustmentService adjustments,
    ISportHubDbContext db,
    UnactivatedPaymentResolutionService resolutions) : ControllerBase
{
    [HttpGet("invoices/{invoiceId:guid}/receipt.pdf")]
    public async Task<IActionResult> ReceiptPdf(
        Guid invoiceId,
        CancellationToken ct)
    {
        var staff =
            User.IsInRole(
                SportHubRoleNames.CenterManager) ||
            User.IsInRole(
                SportHubRoleNames.Receptionist);

        if (
            !staff &&
            !User.IsInRole(
                SportHubRoleNames.Member))
        {
            throw new ForbiddenException(
                "invoice_access_denied",
                "Invoice access denied.");
        }

        var detail =
            await invoices.GetDetailAsync(
                invoiceId,
                ct);

        if (
            !staff &&
            detail.Summary.MemberId !=
                User.RequireUserId())
        {
            throw new ForbiddenException(
                "invoice_not_owned",
                "Invoice not owned.");
        }

        if (!string.Equals(detail.Summary.Status, "PAID", StringComparison.OrdinalIgnoreCase)
            && !string.Equals(detail.Summary.Status, "PAID_AFTER_RECONCILIATION", StringComparison.OrdinalIgnoreCase)
            && !string.Equals(detail.Summary.Status, "COMPENSATED", StringComparison.OrdinalIgnoreCase))
        {
            throw new ConflictException(
                "invoice_not_paid",
                "The invoice can be downloaded only after payment is completed.");
        }

        var model =
            await receipts.BuildAsync(
                invoiceId,
                ct);

        var pdf =
            receipts.RenderPdf(model);

        return File(
            pdf,
            "application/pdf",
            $"{model.InvoiceNumber}.pdf");
    }

    [Authorize(Policy = SportHubPolicies.FrontDesk)]
    [HttpGet("invoices")]
    public async Task<IActionResult> Search(
        [FromQuery] Guid? memberId,
        [FromQuery] string? status,
        [FromQuery] string? keyword = null,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 20,
        CancellationToken ct = default)
        => Ok(await invoices.SearchAsync(memberId, status, keyword, page, pageSize, ct, excludeVoid: User.IsInRole(SportHubRoleNames.CenterManager) || User.IsInRole(SportHubRoleNames.SystemAdministrator)));

    [Authorize(Policy = SportHubPolicies.Member)]
    [HttpGet("members/me/invoices")]
    public async Task<IActionResult> GetMine(
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 20,
        [FromQuery] string? status = null,
        CancellationToken ct = default)
        => Ok(await invoices.SearchAsync(User.RequireUserId(), status, null, page, pageSize, ct));

    [Authorize(Policy = SportHubPolicies.Member)]
    [HttpGet("members/me/unactivated-payments")]
    public async Task<IActionResult> UnactivatedPayments(CancellationToken ct)
    {
        var memberId = User.RequireUserId();
        var rows = await db.Set<Invoice>().AsNoTracking()
            .Where(i => i.MemberId == memberId && (
                i.Status == InvoiceStatus.PaidAfterReconciliation && i.ReconciliationRequired
                    && i.PaidVia == "VnPayAwaitingResolution"
                || (i.Status == InvoiceStatus.Paid || i.Status == InvoiceStatus.PaidAfterReconciliation
                    || i.Status == InvoiceStatus.Compensated)
                    && db.Set<VerifiedGatewayEvent>().Any(e => e.ProcessingStatus == "Unactivated"
                        && db.Set<PaymentAttempt>().Any(a => a.PaymentAttemptId == e.PaymentAttemptId
                            && a.InvoiceId == i.InvoiceId))))
            .OrderByDescending(i => i.PaidAtUtc)
            .Select(i => new { i.InvoiceId, i.InvoiceNumber, i.TotalAmount,
                i.CashAmount, i.PaidAtUtc, FulfillmentOutcome = "RECONCILIATION_REQUIRED" })
            .ToListAsync(ct);
        return Ok(rows);
    }

    [Authorize(Policy = SportHubPolicies.Member)]
    [HttpPost("invoices/{invoiceId:guid}/convert-to-points")]
    public async Task<IActionResult> ConvertToPoints(Guid invoiceId,
        [FromHeader(Name = "Idempotency-Key")] string key, CancellationToken ct)
        => Ok(await resolutions.ConvertToPointsAsync(invoiceId, User.RequireUserId(), key, ct));

    [HttpGet("invoices/by-item/{itemId:guid}")]
    public async Task<IActionResult> ByItem(Guid itemId, CancellationToken ct)
        => await GetDetail(await invoices.FindInvoiceByItemAsync(itemId, ct), ct);

    [Authorize(Policy = SportHubPolicies.CourtRental)]
    [HttpGet("members/me/rental-invoices")]
    public async Task<IActionResult> RentalInvoices([FromQuery] int page = 1, [FromQuery] int pageSize = 20,
        [FromQuery] string? status = null, CancellationToken ct = default)
        => Ok(await invoices.SearchAsync(User.RequireUserId(), status, null, page, pageSize, ct, rentalOnly: true));

    [HttpGet("invoices/{invoiceId:guid}")]
    public async Task<IActionResult> GetDetail(Guid invoiceId, CancellationToken ct)
    {
        var staff = User.IsInRole(SportHubRoleNames.CenterManager) || User.IsInRole(SportHubRoleNames.Receptionist);
        if (!staff && !User.IsInRole(SportHubRoleNames.Member))
            throw new ForbiddenException("invoice_access_denied", "Invoice access denied.");
        var detail = await invoices.GetDetailAsync(invoiceId, ct);

        if (User.IsInRole(SportHubRoleNames.CenterManager) && string.Equals(detail.Summary.Status, "Void", StringComparison.OrdinalIgnoreCase))
            throw new NotFoundException("invoice_not_found", "Invoice not found.");
        if (!staff && detail.Summary.MemberId != User.RequireUserId())
        {
            throw new ForbiddenException("invoice_not_owned", "Invoice not owned.");
        }

        return Ok(detail);
    }

    [Authorize(Policy = SportHubPolicies.FrontDesk)]
    [HttpPost("member-packages/purchase")]
    public async Task<IActionResult> Purchase([FromBody] PurchasePackageRequest request, CancellationToken ct)
    {
        var result = await purchases.PurchaseAsync(
            request,
            User.RequireUserId(),
            User.IsInRole(SportHubRoleNames.CenterManager),
            ct,
            Guid.NewGuid().ToString("N"));

        return StatusCode(StatusCodes.Status201Created, result);
    }

    [Authorize(Policy = SportHubPolicies.FrontDesk)]
    [HttpPost("invoices/{invoiceId:guid}/payments")]
    public async Task<IActionResult> RecordPayment(
        Guid invoiceId,
        [FromBody] RecordPaymentRequest request,
        CancellationToken ct)
        => Ok(await payments.RecordAsync(invoiceId, request, User.RequireUserId(), ct));

    [Authorize(Policy = SportHubPolicies.FrontDesk)]
    [HttpPost("invoices/{invoiceId:guid}/adjustments")]
    public async Task<IActionResult> RequestAdjustment(
        Guid invoiceId,
        [FromBody] CreateAdjustmentRequest request,
        CancellationToken ct)
        => StatusCode(
            StatusCodes.Status201Created,
            await adjustments.RequestAsync(invoiceId, request, User.RequireUserId(), ct));
}
