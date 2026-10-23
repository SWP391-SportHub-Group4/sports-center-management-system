using System.ComponentModel.DataAnnotations;
using System.Text.Json;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SportHub.BuildingBlocks.Abstractions.Audit;
using SportHub.BuildingBlocks.Abstractions.Email;
using SportHub.BuildingBlocks.Abstractions.Notifications;
using SportHub.BuildingBlocks.Abstractions.Payment;
using SportHub.BuildingBlocks.Abstractions.Persistence;
using SportHub.BuildingBlocks.Api;
using SportHub.BuildingBlocks.SharedKernel.Errors;
using SportHub.BuildingBlocks.SharedKernel.Time;
using SportHub.Identity.Domain.Entities;
using SportHub.Identity.Domain.Enums;

namespace SportHub.Identity.Api;

public sealed class SubmitSupportRequest
{
    [Required, MaxLength(50)]
    public string Category { get; set; } = string.Empty;

    [Required, MinLength(3), MaxLength(200)]
    public string Subject { get; set; } = string.Empty;

    [Required, MinLength(3), MaxLength(2000)]
    public string Description { get; set; } = string.Empty;

    public List<IFormFile>? Files { get; set; }

    /// <summary>Chỉ dùng cho PAYMENT: giao dịch (InvoiceItem) cần hoàn tiền.</summary>
    public Guid? InvoiceItemId { get; set; }

    [MaxLength(100)]
    public string? BankName { get; set; }

    [MaxLength(40)]
    public string? AccountNumber { get; set; }

    [MaxLength(120)]
    public string? AccountHolder { get; set; }
}

/// <summary>
/// Trợ giúp của Member: tự gửi yêu cầu hỗ trợ (cùng bảng với yêu cầu Lễ tân ghi hộ), nên hàng đợi
/// của Lễ tân và Manager hiển thị chung. Gửi xong có thông báo trong hệ thống và email xác nhận.
/// </summary>
[ApiController]
[Authorize(Policy = SportHubPolicies.Member)]
[Route("api/support")]
public sealed class MemberSelfSupportController(
    ISportHubDbContext db,
    IClock clock,
    IAuditWriter audit,
    INotificationWriter notifications,
    IBankRefundIntake bankRefunds) : ControllerBase
{
    public const int MaxFiles = SupportImageUploads.MaxFiles;
    public const int MaxFileBytes = SupportImageUploads.MaxFileBytes;

    private static readonly Dictionary<string, string> CategoryLabels = new()
    {
        ["PAYMENT"] = "Payment",
        ["MEMBERSHIP"] = "Membership",
        ["CLASS"] = "Coach",
        ["FACILITY"] = "Facilities",
        ["ACCOUNT"] = "Account",
        ["OTHER"] = "Other"
    };

    [HttpPost("requests")]
    [RequestSizeLimit(20 * 1024 * 1024)]
    [Consumes("multipart/form-data")]
    public async Task<IActionResult> Submit([FromForm] SubmitSupportRequest request, CancellationToken ct)
    {
        var memberId = User.RequireUserId();
        var category = request.Category.Trim().ToUpperInvariant();
        if (!CategoryLabels.TryGetValue(category, out var label))
            throw new BadRequestException("support_category_invalid", "Invalid support request category.");
        var description = request.Description.Trim();
        if (description.Length < 3)
            throw new BadRequestException("support_request_invalid", "Please describe your issue in at least 3 characters.");

        var subject = request.Subject.Trim();
        if (subject.Length < 3)
            throw new BadRequestException("support_subject_invalid", "Please enter a subject of at least 3 characters.");

        var files = request.Files ?? [];
        var now = clock.UtcNow;
        var attachments = await SupportImageUploads.ReadAsync(files, SupportAttachmentKinds.Evidence, memberId, now,
            required: false, ct);
        var payment = SupportPaymentFields.Parse(category, request.InvoiceItemId, request.BankName,
            request.AccountNumber, request.AccountHolder, attachments.Count);

        var member = await db.Set<UserAccount>().AsNoTracking()
            .Where(x => x.UserId == memberId)
            .Select(x => new { x.Email, Name = x.Profile != null ? x.Profile.FullName : x.Email })
            .SingleAsync(ct);

        var entity = new MemberSupportRequest
        {
            RequestId = Guid.NewGuid(),
            MemberId = memberId,
            RecordedByUserId = memberId,
            Category = category,
            Subject = subject,
            Description = description,
            Status = "OPEN",
            Channel = "ONLINE",
            CreatedAt = now,
            RequiresPayout = payment is not null
        };
        db.Set<MemberSupportEvent>().Add(new MemberSupportEvent
        {
            EventId = Guid.NewGuid(), RequestId = entity.RequestId, ActorUserId = memberId,
            Type = "CREATED", CreatedAt = now
        });
        foreach (var attachment in attachments) attachment.RequestId = entity.RequestId;

        db.Set<MemberSupportRequest>().Add(entity);
        db.Set<MemberSupportAttachment>().AddRange(attachments);
        // Ownership of the transaction, eligibility and the suggested amount are all decided server-side.
        if (payment is not null)
            await bankRefunds.AttachAsync(payment.ToIntake(entity.RequestId, memberId, memberId), ct);
        audit.Write(new AuditEntry(memberId, "CREATE_SUPPORT_REQUEST", nameof(MemberSupportRequest),
            entity.RequestId.ToString(), NewValue: JsonSerializer.Serialize(new { entity.MemberId, entity.Category, SelfService = true })));

        var reference = entity.RequestId.ToString("N")[..8].ToUpperInvariant();
        notifications.Queue(new NotificationRequest(memberId, NotificationEvents.SupportRequestReceived,
            $"We received your {label} support request (ref {reference}). Our team will review it and get back to you.",
            entity.RequestId));
        notifications.QueueEmail(new EmailNotificationRequest(memberId, member.Email,
            NotificationEvents.SupportRequestReceived, entity.RequestId,
            $"SportHub - We received your request ({reference})",
            EmailContent.Paragraph($"Hi {member.Name}, thank you for contacting SportHub. Your request has been received and is being handled by our team. We will update you as soon as there is progress.")
            + EmailContent.Details(
                ("Reference", reference),
                ("Topic", label),
                ("Your message", description),
                ("Attachments", attachments.Count == 0 ? "None" : $"{attachments.Count} image(s)"),
                ("Status", "Received"))));

        // Tell the front desk and managers there is a new request waiting for an owner.
        var isPaymentTicket = payment is not null;
        var staffIds = await db.Set<UserAccount>().AsNoTracking()
            .Where(x => x.Status == UserStatus.Active && x.Role != null
                && (x.Role.RoleName == UserRole.CenterManager
                    || (!isPaymentTicket && x.Role.RoleName == UserRole.Receptionist)))
            .Select(x => x.UserId)
            .ToListAsync(ct);
        foreach (var staffId in staffIds)
            notifications.Queue(new NotificationRequest(staffId, NotificationEvents.SupportRequestSubmitted,
                $"{member.Name} submitted a {label} request (ref {reference}).\nSubject: {subject}\n{description}",
                entity.RequestId));

        await db.SaveChangesAsync(ct);
        return Ok(new
        {
            requestId = entity.RequestId,
            reference,
            status = entity.Status,
            createdAt = entity.CreatedAt
        });
    }

    [HttpGet("requests/mine")]
    public async Task<IActionResult> Mine(CancellationToken ct)
    {
        var memberId = User.RequireUserId();
        var rows = await db.Set<MemberSupportRequest>().AsNoTracking()
            .Where(x => x.MemberId == memberId)
            .OrderByDescending(x => x.CreatedAt)
            .Take(30)
            .Select(x => new
            {
                x.RequestId,
                x.Category,
                x.Subject,
                x.Description,
                x.Status,
                x.CreatedAt,
                x.UpdatedAt,
                x.ClosedAt,
                x.RequiresPayout,
                Response = x.ProgressNote,
                Attachments = db.Set<MemberSupportAttachment>()
                    .Where(a => a.RequestId == x.RequestId && a.Kind == SupportAttachmentKinds.Evidence)
                    .OrderBy(a => a.CreatedAt).ThenBy(a => a.AttachmentId)
                    .Select(a => new SupportAttachmentInfo(a.AttachmentId, a.FileName, a.Kind)).ToList(),
                // Transfer receipts are the outcome of a refund and only become visible once the ticket is DONE.
                ResultAttachments = x.Status != "DONE" ? new List<SupportAttachmentInfo>()
                    : db.Set<MemberSupportAttachment>()
                        .Where(a => a.RequestId == x.RequestId && a.Kind == SupportAttachmentKinds.PayoutProof)
                        .OrderBy(a => a.CreatedAt).ThenBy(a => a.AttachmentId)
                        .Select(a => new SupportAttachmentInfo(a.AttachmentId, a.FileName, a.Kind)).ToList()
            })
            .ToListAsync(ct);
        return Ok(rows);
    }
}

/// <summary>
/// Ảnh đính kèm. Chủ yêu cầu (Member) và Lễ tân/Manager xem được ảnh chứng cứ. Chứng từ chuyển khoản (PAYOUT_PROOF) chỉ lộ cho
/// Member khi ticket đã DONE; Lễ tân và Manager xem được ở mọi trạng thái. Coach/Admin không có quyền.
/// </summary>
[ApiController]
[Authorize]
[Route("api/support/attachments")]
public sealed class SupportAttachmentsController(ISportHubDbContext db) : ControllerBase
{
    [HttpGet("{attachmentId:guid}")]
    public async Task<IActionResult> Get(Guid attachmentId, CancellationToken ct)
    {
        var userId = User.RequireUserId();
        var row = await db.Set<MemberSupportAttachment>().AsNoTracking()
            .Where(a => a.AttachmentId == attachmentId)
            .Select(a => new
            {
                a.Content,
                a.ContentType,
                a.Kind,
                OwnerId = db.Set<MemberSupportRequest>().Where(r => r.RequestId == a.RequestId)
                    .Select(r => r.MemberId).FirstOrDefault(),
                Status = db.Set<MemberSupportRequest>().Where(r => r.RequestId == a.RequestId)
                    .Select(r => r.Status).FirstOrDefault()
            })
            .SingleOrDefaultAsync(ct);
        var staff = User.IsInRole(nameof(UserRole.Receptionist)) || User.IsInRole(nameof(UserRole.CenterManager));
        var ownerMayView = row is not null && row.OwnerId == userId
            && (row.Kind != SupportAttachmentKinds.PayoutProof || row.Status == "DONE");
        if (row is null || (!ownerMayView && !staff))
            throw new NotFoundException("support_attachment_not_found", "Attachment not found.");
        Response.Headers.CacheControl = "private, max-age=300";
        return File(row.Content, row.ContentType);
    }
}
