using System.ComponentModel.DataAnnotations;
using System.Text.Json;
using Microsoft.AspNetCore.Authorization;
using SportHub.BuildingBlocks.Abstractions.Configuration;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using SportHub.BuildingBlocks.Abstractions.Audit;
using SportHub.BuildingBlocks.Abstractions.Email;
using SportHub.BuildingBlocks.Abstractions.Notifications;
using SportHub.BuildingBlocks.Abstractions.Persistence;
using SportHub.BuildingBlocks.Abstractions.Scheduling;
using SportHub.BuildingBlocks.Abstractions.Wallet;
using SportHub.BuildingBlocks.Api;
using SportHub.BuildingBlocks.SharedKernel.Errors;
using SportHub.BuildingBlocks.SharedKernel.Time;
using SportHub.Identity.Domain.Entities;
using SportHub.Payment.Domain.Entities;
using SportHub.Payment.Domain.Enums;
using SportHub.Payment.Application.Services;

namespace SportHub.Identity.Api;

public sealed class RecordSupportPayout
{
    [Range(typeof(decimal), "0", "9999999999999999")]
    public decimal Amount { get; set; }
    [Range(0, int.MaxValue)] public int PointsRefunded { get; set; }
    public Guid? InvoiceItemId { get; set; }
    [Required, MaxLength(1000)] public string? Note { get; set; }
    public List<IFormFile>? Files { get; set; }
}

[ApiController]
[Authorize(Roles = SportHubRoleNames.CenterManager)]
[Route("api/member-support-requests")]
public sealed class SupportPayoutController(ISportHubDbContext db, IClock clock,
    IAuditWriter audit, INotificationWriter notifications,
    IConfiguration configuration, IPointWalletService wallets, ICenterCancellationReader cancellations) : ControllerBase
{
    [HttpGet("{requestId:guid}/payout-quote")]
    public async Task<IActionResult> Quote(Guid requestId, CancellationToken ct)
    {
        var request = await db.Set<MemberSupportRequest>().AsNoTracking().SingleOrDefaultAsync(r => r.RequestId == requestId, ct)
            ?? throw new NotFoundException("support_request_not_found", "Support request not found.");
        if (request.Category != "PAYMENT" || request.InvoiceId is null)
            throw new ConflictException("payout_request_invalid", "Payout requires a payment request.");
        var invoice = await db.Set<Invoice>().AsNoTracking().SingleAsync(i => i.InvoiceId == request.InvoiceId, ct);
        return Ok(new { request.InvoiceItemId, supportsEnteredPoints = true,
            items = await SupportRefundCalculator.ItemsAsync(db, invoice, cancellations, ct) });
    }

    [HttpPost("{requestId:guid}/payout")]
    [Consumes("multipart/form-data")]
    [RequestSizeLimit(20 * 1024 * 1024)]
    public async Task<IActionResult> Record(Guid requestId, [FromForm] RecordSupportPayout body, CancellationToken ct)
    {
        var note = body.Note?.Trim();
        if (string.IsNullOrEmpty(note))
            throw new BadRequestException(PaymentSupportErrorCodes.PayoutNoteRequired,
                "Add a note about your call with the member and how the refund was made.");
        if (body.Amount < 0 || body.Amount % 1000m != 0)
            throw new BadRequestException("payout_amount_invalid", "Cash must be a non-negative multiple of 1,000 VND.");
        if (body.PointsRefunded < 0)
            throw new BadRequestException("payout_points_invalid", "Points must be a non-negative whole number.");
        if (body.Amount == 0 && body.PointsRefunded == 0)
            throw new BadRequestException("payout_value_required", "Enter cash or points to refund.");
        var files = body.Amount > 0 || body.Files is { Count: > 0 }
            ? await SupportPayoutProof.ReadAsync(body.Files, clock.UtcNow, ct)
            : [];
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        var request = await db.Set<MemberSupportRequest>().FromSqlInterpolated(
            $"SELECT * FROM member_support_requests WHERE request_id = {requestId} FOR UPDATE")
            .SingleOrDefaultAsync(ct) ?? throw new NotFoundException("support_request_not_found", "Support request not found.");
        if (request.Category != "PAYMENT" || request.InvoiceId is null)
            throw new ConflictException("payout_request_invalid", "Payout requires a member payment request.");
        if (await db.Set<MemberSupportPayout>().AnyAsync(x => x.RequestId == requestId, ct))
            throw new ConflictException(PaymentSupportErrorCodes.PayoutAlreadyRecorded, "Payout was already recorded.");
        if (request.Status is "CLOSED" or "DONE" or "REJECTED")
            throw new ConflictException("support_request_final", "Support request has already been finalized.");
        var invoiceId = request.InvoiceId.Value;
        // Serialize payouts across all requests on the same invoice, including the point-conversion path.
        var invoice = await db.Set<Invoice>().FromSqlInterpolated(
            $"SELECT * FROM invoices WHERE invoice_id = {invoiceId} FOR UPDATE").SingleAsync(ct);
        var captured = await db.Set<SportHub.Payment.Domain.Entities.Payment>().AsNoTracking()
            .Where(x => x.InvoiceId == invoiceId && x.Method == PaymentMethod.VnPay
                && x.Status == PaymentStatus.Success)
            .SumAsync(x => (decimal?)x.Amount, ct) ?? 0m;
        var alreadyPaid = await db.Set<MemberSupportPayout>().AsNoTracking()
            .Where(x => x.InvoiceId == invoiceId).SumAsync(x => (decimal?)x.Amount, ct) ?? 0m;
        if (body.Amount > captured - alreadyPaid)
            throw new ConflictException(PaymentSupportErrorCodes.PayoutAmountExceedsPaid,
                "Payout exceeds the remaining captured VNPay amount.");
        if (invoice.MemberId != request.MemberId)
            throw new ConflictException("payout_request_invalid", "The invoice does not belong to this member.");
        if (request.InvoiceItemId != null && body.InvoiceItemId != null && request.InvoiceItemId != body.InvoiceItemId)
            throw new ConflictException("payout_item_mismatch", "Refund the service linked to this request.");
        var itemId = await SupportRefundCalculator.ResolveItemAsync(db, invoiceId, request.InvoiceItemId ?? body.InvoiceItemId, ct);
        var itemQuote = (await SupportRefundCalculator.ItemsAsync(db, invoice, cancellations, ct)).Single(i => i.InvoiceItemId == itemId);
        if (body.Amount > itemQuote.RefundableVnpayVnd)
            throw new ConflictException(PaymentSupportErrorCodes.PayoutAmountExceedsPaid,
                "Payout exceeds the remaining VNPay payment for this service.");
        if (body.PointsRefunded > itemQuote.MaxRefundablePoints
            || body.Amount + body.PointsRefunded * 1000m > itemQuote.RefundableValueVnd)
            throw new ConflictException("payout_points_exceeds_paid",
                "Cash plus points (1 point = 1,000 VND) exceeds the remaining refundable value for this service.");
        var pointsToRefund = body.PointsRefunded;
        request.InvoiceItemId = itemId;
        if (pointsToRefund > 0)
            await wallets.EarnAsync(new WalletOperation(invoice.MemberId, pointsToRefund, "SystemEvent", requestId,
                User.RequireUserId(), "SupportRefund: points returned with the payout of support request", itemId), ct);
        var now = clock.UtcNow;
        var payout = new MemberSupportPayout
        {
            PayoutId = Guid.NewGuid(), RequestId = requestId, InvoiceId = invoiceId,
            InvoiceItemId = itemId, PointsRefunded = pointsToRefund,
            Amount = body.Amount, Note = note,
            RecordedByUserId = User.RequireUserId(), RecordedAtUtc = now
        };
        db.Set<MemberSupportPayout>().Add(payout);
        foreach (var proof in files)
        {
            proof.RequestId = requestId;
            proof.PayoutId = payout.PayoutId;
        }
        db.Set<MemberSupportAttachment>().AddRange(files);
        request.Status = "CLOSED";
        request.ProgressNote = "Payout recorded.";
        request.ClosedAt = request.UpdatedAt = now;
        db.Set<MemberSupportEvent>().Add(new MemberSupportEvent
        {
            EventId = Guid.NewGuid(), RequestId = requestId, ActorUserId = User.RequireUserId(),
            Type = "PAYOUT_RECORDED", CreatedAt = now
        });
        audit.Write(new AuditEntry(User.RequireUserId(), "SUPPORT_PAYOUT_RECORDED", nameof(MemberSupportPayout),
            payout.PayoutId.ToString(), NewValue: JsonSerializer.Serialize(new
            {
                payout.RequestId, payout.InvoiceId, payout.InvoiceItemId, payout.Amount, PointsRefunded = pointsToRefund
            })));
        var contact = await db.Set<UserAccount>().AsNoTracking().Where(x => x.UserId == request.MemberId)
            .Select(x => new { x.Email, Name = x.Profile != null ? x.Profile.FullName : x.Email })
            .SingleAsync(ct);
        var refundDescription = body.Amount > 0 && pointsToRefund > 0
            ? $"{body.Amount:N0} VND and {pointsToRefund:N0} points"
            : body.Amount > 0 ? $"{body.Amount:N0} VND" : $"{pointsToRefund:N0} points";
        notifications.Queue(new NotificationRequest(request.MemberId, NotificationEvents.SupportPayoutRecorded,
            $"A refund of {refundDescription} was recorded for your support request. Open the request to confirm receipt.",
            payout.PayoutId));
        var frontendUrl = (configuration["Frontend:BaseUrl"]
            ?? configuration["Cors:AllowedOrigins:0"] ?? "http://localhost:3000").TrimEnd('/');
        var requestUrl = System.Net.WebUtility.HtmlEncode($"{frontendUrl}/member/help?requestId={requestId}");
        notifications.QueueEmail(new EmailNotificationRequest(request.MemberId, contact.Email,
            NotificationEvents.SupportPayoutRecorded, payout.PayoutId,
            "SportHub - Payout recorded",
            EmailContent.Paragraph($"Hi {contact.Name}, a refund of {refundDescription} was recorded for your support request.")
            + EmailContent.Paragraph("Sign in to view the request and confirm whether you received the refund.")
            + $"<p><a href=\"{requestUrl}\">View support request</a></p>"));
        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);
        return Ok(new { payout.PayoutId, payout.RequestId, payout.InvoiceId, payout.Amount,
            pointsRefunded = pointsToRefund, payout.RecordedAtUtc, request.Status, outcome = "DONE",
            proofAttachmentIds = files.Select(x => x.AttachmentId).ToArray() });
    }
}

[ApiController]
[Authorize]
public sealed class InvoiceRefundBreakdownController(ISportHubDbContext db, ICenterCancellationReader cancellations) : ControllerBase
{
    [HttpGet("api/members/me/invoices/{invoiceId:guid}/refund-breakdown")]
    [Authorize(Policy = SportHubPolicies.Member)]
    public Task<IActionResult> Get(Guid invoiceId, CancellationToken ct) => Breakdown(invoiceId, User.RequireUserId(), ct);

    [HttpGet("api/invoices/{invoiceId:guid}/refund-breakdown")]
    [Authorize(Policy = SportHubPolicies.FrontDesk)]
    public Task<IActionResult> Staff(Guid invoiceId, CancellationToken ct) => Breakdown(invoiceId, null, ct);

    private async Task<IActionResult> Breakdown(Guid invoiceId, Guid? memberId, CancellationToken ct)
    {
        var invoice = await db.Set<Invoice>().AsNoTracking()
            .SingleOrDefaultAsync(i => i.InvoiceId == invoiceId && (memberId == null || i.MemberId == memberId), ct)
            ?? throw new NotFoundException("invoice_not_found", "Invoice not found.");
        var items = await SupportRefundCalculator.ItemsAsync(db, invoice, cancellations, ct);
        return Ok(new { totalVnd = invoice.TotalAmount, vnpayVnd = items.Sum(i => i.VnpayVnd),
            pointsApplied = invoice.PointsApplied, pointsVnd = invoice.PointsApplied * 1000m,
            refundableVnpayVnd = items.Sum(i => i.RefundableVnpayVnd), refundablePoints = items.Sum(i => i.RefundablePoints), items });
    }
}

[ApiController]
[Authorize(Policy = SportHubPolicies.Member)]
[Route("api/support/requests")]
public sealed class MemberSupportPayoutController(ISportHubDbContext db, IClock clock,
    IAuditWriter audit, INotificationWriter notifications, ISystemSettingProvider settings) : ControllerBase
{
    [HttpPost("{requestId:guid}/confirm-received")]
    public Task<IActionResult> Confirm(Guid requestId, CancellationToken ct)
        => UpdateReceipt(requestId, true, ct);

    [HttpPost("{requestId:guid}/report-not-received")]
    public Task<IActionResult> Report(Guid requestId, CancellationToken ct)
        => UpdateReceipt(requestId, false, ct);

    private async Task<IActionResult> UpdateReceipt(Guid requestId, bool received, CancellationToken ct)
    {
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        var request = await db.Set<MemberSupportRequest>().FromSqlInterpolated(
            $"SELECT * FROM member_support_requests WHERE request_id = {requestId} FOR UPDATE")
            .SingleOrDefaultAsync(ct) ?? throw new NotFoundException("support_request_not_found", "Support request not found.");
        if (request.MemberId != User.RequireUserId())
            throw new ForbiddenException("support_request_not_owned", "Support request not owned.");
        var payout = await db.Set<MemberSupportPayout>().SingleOrDefaultAsync(x => x.RequestId == requestId, ct)
            ?? throw new NotFoundException(PaymentSupportErrorCodes.PayoutNotFound, "Payout not found.");
        if (payout.MemberConfirmedAtUtc is not null)
        {
            if (received) return Ok(new { payout.PayoutId, payout.MemberConfirmedAtUtc, payout.MemberConfirmedBy });
            throw new ConflictException("payout_already_confirmed", "Receipt has already been confirmed.");
        }
        if (request.Status is "DONE" or "REJECTED")
            throw new ConflictException("support_request_final", "The payout review has already been finalized.");
        var now = clock.UtcNow;
        var receiptEventId = Guid.NewGuid();
        if (received)
        {
            payout.MemberConfirmedAtUtc = now;
            payout.MemberConfirmedBy = "MEMBER";
            // The member can acknowledge a delayed transfer during the review.
            request.Status = "CLOSED";
            request.ClosedAt = request.UpdatedAt = now;
        }
        else
        {
            if (request.Status != "CLOSED" || await db.Set<MemberSupportEvent>().AnyAsync(e =>
                e.RequestId == requestId && e.Type == "MEMBER_REPORTED_NOT_RECEIVED", ct))
                throw new ConflictException("payout_already_reported", "This payout has already been reported.");
            request.Status = "OPEN";
            request.AssignedToUserId = null;
            request.ClosedAt = null;
            request.SlaDueAtUtc = now.AddHours(await settings.GetIntAsync(SystemSettingKeys.SupportSlaHours, ct));
            request.UpdatedAt = now;
            var managers = await db.Set<UserAccount>().AsNoTracking()
                .Where(x => x.Status == SportHub.Identity.Domain.Enums.UserStatus.Active && x.Role != null
                    && x.Role.RoleName == SportHub.Identity.Domain.Enums.UserRole.CenterManager)
                .Select(x => x.UserId).ToListAsync(ct);
            foreach (var manager in managers)
                notifications.Queue(new NotificationRequest(manager, NotificationEvents.SupportPayoutNotReceived,
                    $"A member reported that payout for support request {requestId} was not received.", receiptEventId));
        }
        db.Set<MemberSupportEvent>().Add(new MemberSupportEvent
        {
            EventId = receiptEventId, RequestId = requestId, ActorUserId = request.MemberId,
            Type = received ? "MEMBER_CONFIRMED_RECEIVED" : "MEMBER_REPORTED_NOT_RECEIVED", CreatedAt = now
        });
        audit.Write(new AuditEntry(request.MemberId,
            received ? "SUPPORT_PAYOUT_CONFIRMED" : "SUPPORT_PAYOUT_NOT_RECEIVED",
            nameof(MemberSupportPayout), payout.PayoutId.ToString(), NewValue: JsonSerializer.Serialize(new {
                request.RequestId, payout.InvoiceId, payout.Amount, received,
                confirmedBy = received ? "MEMBER" : null
            })));
        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);
        return Ok(new { payout.PayoutId, payout.MemberConfirmedAtUtc, payout.MemberConfirmedBy, request.Status });
    }
}

internal static class SupportPayoutProof
{
    public static async Task<List<MemberSupportAttachment>> ReadAsync(List<IFormFile>? files, DateTime now,
        CancellationToken ct)
    {
        if (files is null || files.Count == 0)
            throw new BadRequestException(PaymentSupportErrorCodes.PayoutProofRequired, "Attach at least one payout proof image.");
        if (files.Count > 3)
            throw new BadRequestException("support_attachment_count", "You can attach up to 3 images.");
        var result = new List<MemberSupportAttachment>();
        foreach (var file in files)
        {
            if (file.Length is <= 0 or > 5 * 1024 * 1024)
                throw new BadRequestException("support_attachment_size", "Each image must be no larger than 5 MB.");
            await using var stream = file.OpenReadStream();
            await using var buffer = new MemoryStream();
            await stream.CopyToAsync(buffer, ct);
            var bytes = buffer.ToArray();
            var contentType = bytes.Length > 12 && bytes[0] == 0xFF && bytes[1] == 0xD8 && bytes[2] == 0xFF
                ? "image/jpeg" : bytes.Length > 8 && bytes[0] == 0x89 && bytes[1] == 0x50
                    && bytes[2] == 0x4E && bytes[3] == 0x47 ? "image/png"
                    : bytes.Length > 12 && bytes[0] == 'R' && bytes[1] == 'I' && bytes[2] == 'F'
                        && bytes[3] == 'F' && bytes[8] == 'W' && bytes[9] == 'E'
                        && bytes[10] == 'B' && bytes[11] == 'P' ? "image/webp" : null;
            if (contentType is null)
                throw new BadRequestException("support_attachment_type", "Attachments must be JPG, PNG or WebP images.");
            var name = Path.GetFileName(file.FileName);
            result.Add(new MemberSupportAttachment
            {
                AttachmentId = Guid.NewGuid(), Kind = SupportAttachmentKinds.PayoutProof,
                FileName = string.IsNullOrWhiteSpace(name) ? "image" : name.Length > 120 ? name[^120..] : name,
                ContentType = contentType, Content = bytes, CreatedAt = now
            });
        }
        return result;
    }
}
