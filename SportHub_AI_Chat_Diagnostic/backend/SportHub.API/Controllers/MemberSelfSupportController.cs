using System.ComponentModel.DataAnnotations;
using System.Globalization;
using System.Text.Json;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SportHub.BuildingBlocks.Abstractions.Audit;
using SportHub.BuildingBlocks.Abstractions.Configuration;
using SportHub.BuildingBlocks.Abstractions.Email;
using SportHub.BuildingBlocks.Abstractions.Notifications;
using SportHub.BuildingBlocks.Abstractions.Persistence;
using SportHub.BuildingBlocks.Api;
using SportHub.BuildingBlocks.SharedKernel.Errors;
using SportHub.BuildingBlocks.SharedKernel.Time;
using SportHub.Identity.Domain.Entities;
using SportHub.Identity.Domain.Enums;
using SportHub.Identity.Application.Services;
using SportHub.Payment.Domain.Entities;
using SportHub.Payment.Domain.Enums;

namespace SportHub.Identity.Api;

public sealed class SubmitSupportRequest
{
    [Required, MaxLength(50)]
    public string Category { get; set; } = string.Empty;

    [Required, MinLength(3), MaxLength(2000)]
    public string Description { get; set; } = string.Empty;

    public List<IFormFile>? Files { get; set; }
    public Guid? InvoiceId { get; set; }
    public Guid? InvoiceItemId { get; set; }
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
    ISystemSettingProvider settings,
    SupportReminderService reminders,
    SportHub.BuildingBlocks.Abstractions.Payment.ISupportInvoiceGuard invoiceGuard) : ControllerBase
{
    public const int MaxFiles = 3;
    public const int MaxFileBytes = 5 * 1024 * 1024;

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
        if (!await db.Set<UserAccount>().AsNoTracking()
            .AnyAsync(u => u.UserId == memberId
                && u.Status == UserStatus.Active
                && ((u.Credential != null && u.Credential.PasswordHash != null)
                    || u.ExternalLogins.Any()), ct))
            throw new ConflictException("member_not_activated", "Activate your account before submitting a support request.");
        var category = request.Category.Trim().ToUpperInvariant();
        if (!CategoryLabels.TryGetValue(category, out var label))
            throw new BadRequestException("support_category_invalid", "Invalid support request category.");
        var description = request.Description.Trim();
        if (description.Length < 3)
            throw new BadRequestException("support_request_invalid", "Please describe your issue in at least 3 characters.");

        var files = request.Files ?? [];
        if (category == "PAYMENT")
        {
            if (request.InvoiceId is null || request.InvoiceId == Guid.Empty)
                throw new BadRequestException("payment_request_invoice_required", "Choose one of your invoices.");
            if (files.Count == 0)
                throw new BadRequestException("payment_request_proof_required", "Attach at least one proof image.");
        }
        if (files.Count > MaxFiles)
            throw new BadRequestException("support_attachment_count", $"You can attach up to {MaxFiles} images.");
        var now = clock.UtcNow;
        var attachments = new List<MemberSupportAttachment>();
        foreach (var file in files)
        {
            if (file.Length == 0 || file.Length > MaxFileBytes)
                throw new BadRequestException("support_attachment_size", "Each image must be no larger than 5 MB.");
            await using var input = file.OpenReadStream();
            await using var buffer = new MemoryStream();
            await input.CopyToAsync(buffer, ct);
            var bytes = buffer.ToArray();
            var type = SniffImage(bytes)
                ?? throw new BadRequestException("support_attachment_type", "Attachments must be JPG, PNG or WebP images.");
            attachments.Add(new MemberSupportAttachment
            {
                AttachmentId = Guid.NewGuid(),
                Kind = SupportAttachmentKinds.MemberProof,
                FileName = SafeName(file.FileName),
                ContentType = type,
                Content = bytes,
                CreatedAt = now
            });
        }

        var member = await db.Set<UserAccount>().AsNoTracking()
            .Where(x => x.UserId == memberId)
            .Select(x => new { x.Email, Name = x.Profile != null ? x.Profile.FullName : x.Email })
            .SingleAsync(ct);

        var snippet = description.ReplaceLineEndings(" ");
        if (snippet.Length > 60) snippet = snippet[..60].TrimEnd() + "…";
        var entity = new MemberSupportRequest
        {
            RequestId = Guid.NewGuid(),
            MemberId = memberId,
            RecordedByUserId = memberId,
            Category = category,
            Subject = $"{label}: {snippet}",
            Description = description,
            Status = "OPEN",
            Channel = "ONLINE",
            CreatedAt = now,
            SlaDueAtUtc = now.AddHours(await settings.GetIntAsync(SystemSettingKeys.SupportSlaHours, ct))
        };
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        if (category == "PAYMENT")
        {
            var invoiceId = request.InvoiceId!.Value;
            var invoice = await db.Set<Invoice>().FromSqlInterpolated(
                $"SELECT * FROM invoices WHERE invoice_id = {invoiceId} FOR UPDATE").SingleOrDefaultAsync(ct);
            if (invoice is null || invoice.MemberId != memberId)
                throw new BadRequestException("payment_request_invoice_required", "Choose one of your invoices.");
            entity.InvoiceItemId = await invoiceGuard.EnsureEligibleAsync(memberId, invoiceId, ct, request.InvoiceItemId);
            entity.InvoiceId = invoiceId;
        }
        db.Set<MemberSupportEvent>().Add(new MemberSupportEvent
        {
            EventId = Guid.NewGuid(), RequestId = entity.RequestId, ActorUserId = memberId,
            Type = "CREATED", CreatedAt = now
        });
        foreach (var attachment in attachments) attachment.RequestId = entity.RequestId;

        db.Set<MemberSupportRequest>().Add(entity);
        db.Set<MemberSupportAttachment>().AddRange(attachments);
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

        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);
        return Ok(new
        {
            requestId = entity.RequestId,
            reference,
            status = entity.Status,
            createdAt = entity.CreatedAt,
            slaDueAtUtc = entity.SlaDueAtUtc
        });
    }

    [HttpGet("requests/mine")]
    public async Task<IActionResult> Mine(CancellationToken ct)
    {
        var memberId = User.RequireUserId();
        var now = clock.UtcNow;
        var cooldownHours = await settings.GetIntAsync(SystemSettingKeys.SupportRemindCooldownHours, ct);
        var rows = await db.Set<MemberSupportRequest>().AsNoTracking()
            .Where(x => x.MemberId == memberId)
            .OrderByDescending(x => x.CreatedAt)
            .Take(30)
            .Select(x => new
            {
                x.RequestId,
                x.Category,
                x.Description,
                x.Status,
                x.InvoiceId,
                x.InvoiceItemId,
                x.CreatedAt,
                x.UpdatedAt,
                Response = x.ProgressNote,
                x.SlaDueAtUtc,
                x.RemindCount,
                x.LastMemberRemindAtUtc
            })
            .ToListAsync(ct);
        var requestIds = rows.Select(x => x.RequestId).ToArray();
        var payouts = await db.Set<MemberSupportPayout>().AsNoTracking()
            .Where(p => requestIds.Contains(p.RequestId))
            .Select(p => new { p.RequestId, p.PayoutId, p.Amount, p.PointsRefunded, p.InvoiceItemId, p.RecordedAtUtc,
                p.MemberConfirmedAtUtc, p.MemberConfirmedBy })
            .ToDictionaryAsync(p => p.RequestId, ct);
        var payoutIds = payouts.Values.Select(p => p.PayoutId).ToArray();
        var proofs = await db.Set<MemberSupportAttachment>().AsNoTracking()
            .Where(a => a.PayoutId != null && payoutIds.Contains(a.PayoutId.Value))
            .Select(a => new { a.PayoutId, a.AttachmentId }).ToListAsync(ct);
        return Ok(rows.Select(x => new
        {
            x.RequestId, x.Category, x.Description, x.Status, x.InvoiceId, x.InvoiceItemId, x.CreatedAt, x.UpdatedAt,
            x.Response, x.SlaDueAtUtc, x.RemindCount,
            Payout = payouts.TryGetValue(x.RequestId, out var p)
                ? new { p.Amount, p.PointsRefunded, p.InvoiceItemId, p.RecordedAtUtc, p.MemberConfirmedAtUtc, p.MemberConfirmedBy,
                    ProofAttachmentIds = proofs.Where(a => a.PayoutId == p.PayoutId)
                        .Select(a => a.AttachmentId).ToArray() } : null,
            IsOverdue = x.Status is not ("DONE" or "REJECTED" or "CLOSED") && x.SlaDueAtUtc <= now,
            CanRemindAtUtc = x.Status is "DONE" or "REJECTED" or "CLOSED"
                ? (DateTime?)null
                : x.LastMemberRemindAtUtc is DateTime last && last.AddHours(cooldownHours) > x.SlaDueAtUtc
                    ? last.AddHours(cooldownHours) : x.SlaDueAtUtc
        }));
    }

    [HttpPost("requests/{requestId:guid}/remind")]
    public async Task<IActionResult> Remind(Guid requestId, CancellationToken ct)
    {
        var result = await reminders.RemindAsync(requestId, User.RequireUserId(), byStaff: false, ct);
        if (result.Sent) return Ok(result);
        var seconds = Math.Max(1, (int)Math.Ceiling((result.CanRemindAtUtc - clock.UtcNow).TotalSeconds));
        Response.Headers.RetryAfter = seconds.ToString(CultureInfo.InvariantCulture);
        return Conflict(new
        {
            error = PaymentSupportErrorCodes.SupportRemindTooEarly,
            message = "You can remind us after the support response deadline or cooldown.",
            retryAfter = seconds,
            canRemindAtUtc = result.CanRemindAtUtc
        });
    }

    private static string? SniffImage(byte[] b)
    {
        if (b.Length > 12 && b[0] == 0xFF && b[1] == 0xD8 && b[2] == 0xFF) return "image/jpeg";
        if (b.Length > 8 && b[0] == 0x89 && b[1] == 0x50 && b[2] == 0x4E && b[3] == 0x47) return "image/png";
        if (b.Length > 12 && b[0] == 'R' && b[1] == 'I' && b[2] == 'F' && b[3] == 'F'
            && b[8] == 'W' && b[9] == 'E' && b[10] == 'B' && b[11] == 'P') return "image/webp";
        return null;
    }

    private static string SafeName(string? name)
    {
        var value = Path.GetFileName(name ?? "image");
        return string.IsNullOrWhiteSpace(value) ? "image" : value.Length > 120 ? value[^120..] : value;
    }
}

/// <summary>Ảnh đính kèm: chủ yêu cầu (Member) hoặc nhân sự quầy/Manager mới xem được.</summary>
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
                AssignedTo = db.Set<MemberSupportRequest>().Where(r => r.RequestId == a.RequestId)
                    .Select(r => r.AssignedToUserId).FirstOrDefault()
            })
            .SingleOrDefaultAsync(ct);
        var manager = User.IsInRole(nameof(UserRole.CenterManager));
        var receptionist = User.IsInRole(nameof(UserRole.Receptionist));
        var canRead = row is not null && (row.Kind switch
        {
            SupportAttachmentKinds.MemberProof => row.OwnerId == userId || receptionist || manager
                || ((User.IsInRole(nameof(UserRole.Coach)) || User.IsInRole(nameof(UserRole.SystemAdministrator)))
                    && row.AssignedTo == userId),
            SupportAttachmentKinds.PayoutProof => row.OwnerId == userId || manager,
            _ => false
        });
        if (!canRead)
            throw new NotFoundException("support_attachment_not_found", "Attachment not found.");
        Response.Headers.CacheControl = "private, no-store";
        return File(row!.Content, row.ContentType);
    }
}
