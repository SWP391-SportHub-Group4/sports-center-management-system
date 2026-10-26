using System.ComponentModel.DataAnnotations;
using System.Text.Json;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SportHub.BuildingBlocks.Abstractions.Persistence;
using SportHub.BuildingBlocks.Abstractions.Audit;
using SportHub.BuildingBlocks.Abstractions.Configuration;
using SportHub.BuildingBlocks.Abstractions.Payment;
using SportHub.Identity.Application.Services;
using SportHub.BuildingBlocks.Abstractions.Notifications;
using SportHub.BuildingBlocks.Api;
using SportHub.BuildingBlocks.SharedKernel.Errors;
using SportHub.BuildingBlocks.SharedKernel.Pagination;
using SportHub.BuildingBlocks.SharedKernel.Time;
using SportHub.Identity.Domain.Entities;
using SportHub.Identity.Domain.Enums;

namespace SportHub.Identity.Api;

public sealed class CreateMemberSupportRequest
{
    [Required]
    public Guid MemberId { get; set; }

    [Required, MaxLength(50)]
    public string Category { get; set; } = string.Empty;

    [MaxLength(200)]
    public string? Subject { get; set; }

    [Required, MinLength(3), MaxLength(2000)]
    public string Description { get; set; } = string.Empty;

    /// <summary>COUNTER (mặc định), PHONE hoặc FANPAGE.</summary>
    [MaxLength(20)]
    public string? Channel { get; set; }

    /// <summary>Bàn giao ngay khi tạo; bỏ trống thì lễ tân tự xử lý (gán cho chính mình ở client).</summary>
    public Guid? AssigneeUserId { get; set; }

    [MaxLength(1000)]
    public string? HandoverNote { get; set; }

    /// <summary>Giải quyết ngay tại quầy: yêu cầu được tạo, gán cho người tạo và đóng (DONE) với ghi chú này.</summary>
    [MaxLength(1000)]
    public string? ResolveNote { get; set; }

    /// <summary>Bắt buộc với danh mục PAYMENT: hóa đơn VNPay đã thanh toán của chính Member này.</summary>
    public Guid? InvoiceId { get; set; }
}

public sealed record MemberSupportRequestResponse(
    Guid RequestId,
    Guid MemberId,
    Guid RecordedByUserId,
    string Category,
    string Subject,
    string Description,
    string Status,
    DateTime CreatedAt,
    Guid? AssignedToUserId,
    string? ProgressNote,
    DateTime? UpdatedAt,
    DateTime? ClosedAt,
    string? MemberName = null,
    string? MemberEmail = null,
    string? AssignedToName = null,
    IReadOnlyList<SupportAttachmentInfo>? Attachments = null,
    string Channel = "COUNTER", DateTime? SlaDueAtUtc = null,
    bool IsOverdue = false, int RemindCount = 0,
    Guid? InvoiceId = null, SupportPayoutInfo? Payout = null,
    string? Outcome = null);

public sealed record SupportPayoutInfo(Guid PayoutId, decimal Amount, DateTime RecordedAtUtc,
    DateTime? MemberConfirmedAtUtc, string? MemberConfirmedBy, IReadOnlyList<Guid> ProofAttachmentIds);

public sealed record SupportAttachmentInfo(Guid AttachmentId, string FileName,
    string Kind = SupportAttachmentKinds.MemberProof);

public sealed record AssignSupportRequest(Guid AssigneeUserId, string? Note = null);

public sealed record SupportEventResponse(Guid EventId, string Type, string? Note, DateTime CreatedAt,
    string ActorName, string? ActorRole, string? TargetName);
public sealed class UpdateSupportProgress
{
    [Required, MinLength(3), MaxLength(1000)] public string Note { get; set; } = string.Empty;
}
public sealed class FinishSupportRequest
{
    [Required, MinLength(3), MaxLength(1000)] public string Reason { get; set; } = string.Empty;
}

[ApiController]
[Authorize(Roles = "Receptionist,CenterManager,Coach,SystemAdministrator")]
[Route("api/member-support-requests")]
public sealed class MemberSupportRequestsController(
    ISportHubDbContext db,
    IClock clock,
    IAuditWriter audit,
    INotificationWriter notifications,
    SupportReminderService reminders,
    ISupportInvoiceGuard invoiceGuard) : ControllerBase
{
    private MemberSupportRequestResponse Map(MemberSupportRequest x) => new(
        x.RequestId, x.MemberId, x.RecordedByUserId, x.Category, x.Subject,
        x.Description, x.Status, x.CreatedAt, x.AssignedToUserId,
        x.ProgressNote, x.UpdatedAt, x.ClosedAt, Channel: x.Channel,
        SlaDueAtUtc: x.SlaDueAtUtc,
        IsOverdue: !IsFinal(x.Status) && x.SlaDueAtUtc <= clock.UtcNow,
        RemindCount: x.RemindCount, InvoiceId: x.InvoiceId,
        Outcome: x.Status == "CLOSED" ? "DONE" : null);

    private bool IsAssignedHandler => User.IsInRole(nameof(UserRole.Coach))
        || User.IsInRole(nameof(UserRole.SystemAdministrator));

    private IQueryable<MemberSupportRequest> VisibleRequests()
    {
        var rows = db.Set<MemberSupportRequest>().AsNoTracking();
        return IsAssignedHandler
            ? rows.Where(x => x.AssignedToUserId == User.RequireUserId()) : rows;
    }

    /// <summary>Payment requests are handled by managers only; the front desk may view, create and remind.</summary>
    private void RequireManagerForPayment(MemberSupportRequest row)
    {
        if (row.Category == "PAYMENT" && !User.IsInRole(nameof(UserRole.CenterManager)))
            throw new ForbiddenException(PaymentSupportErrorCodes.PaymentRequestManagerOnly,
                "Only a manager can handle a payment request.");
    }

    private void RequireAssignedHandler(MemberSupportRequest row)
    {
        if (IsAssignedHandler && row.AssignedToUserId != User.RequireUserId())
            throw new NotFoundException("support_request_not_found", "Support request not found.");
    }

    private IQueryable<MemberSupportRequestResponse> Project(IQueryable<MemberSupportRequest> query)
    {
        var canSeePayoutProof = User.IsInRole(nameof(UserRole.CenterManager));
        var now = clock.UtcNow;
        return query.Select(x => new MemberSupportRequestResponse(
            x.RequestId, x.MemberId, x.RecordedByUserId, x.Category, x.Subject,
            x.Description, x.Status, x.CreatedAt, x.AssignedToUserId,
            x.ProgressNote, x.UpdatedAt, x.ClosedAt,
            db.Set<UserAccount>().Where(u => u.UserId == x.MemberId)
                .Select(u => u.Profile != null ? u.Profile.FullName : u.Email).FirstOrDefault(),
            db.Set<UserAccount>().Where(u => u.UserId == x.MemberId).Select(u => u.Email).FirstOrDefault(),
            db.Set<UserAccount>().Where(u => u.UserId == x.AssignedToUserId)
                .Select(u => u.Profile != null ? u.Profile.FullName : u.Email).FirstOrDefault(),
            db.Set<MemberSupportAttachment>().Where(a => a.RequestId == x.RequestId
                && (canSeePayoutProof || a.Kind == SupportAttachmentKinds.MemberProof))
                .OrderBy(a => a.CreatedAt).ThenBy(a => a.AttachmentId)
                .Select(a => new SupportAttachmentInfo(a.AttachmentId, a.FileName, a.Kind)).ToList(),
            x.Channel, x.SlaDueAtUtc,
            x.Status != "DONE" && x.Status != "REJECTED" && x.Status != "CLOSED"
                && x.SlaDueAtUtc <= now,
            x.RemindCount, x.InvoiceId,
            db.Set<MemberSupportPayout>().Where(p => p.RequestId == x.RequestId)
                .Select(p => new SupportPayoutInfo(p.PayoutId, p.Amount, p.RecordedAtUtc,
                    p.MemberConfirmedAtUtc, p.MemberConfirmedBy,
                    db.Set<MemberSupportAttachment>().Where(a => canSeePayoutProof && a.PayoutId == p.PayoutId)
                        .Select(a => a.AttachmentId).ToList())).FirstOrDefault(),
            x.Status == "CLOSED" ? "DONE" : null));
    }

    [HttpGet]
    [Authorize(Policy = SportHubPolicies.FrontDesk)]
    public async Task<IActionResult> List(
        [FromQuery] Guid memberId,
        CancellationToken ct = default)
    {
        var memberExists = await db
            .Set<UserAccount>()
            .AsNoTracking()
            .Include(x => x.Role)
            .Include(x => x.Credential)
            .Include(x => x.ExternalLogins)
            .AnyAsync(
                x =>
                    x.UserId == memberId &&
                    x.Role != null &&
                    x.Role.RoleName == UserRole.Member,
                ct);

        if (!memberExists)
        {
            return NotFound(new
            {
                error = "member_not_found",
                message = "Member was not found."
            });
        }

        var rows = await Project(db
            .Set<MemberSupportRequest>()
            .AsNoTracking()
            .Where(x => x.MemberId == memberId)
            .OrderByDescending(x => x.CreatedAt)
            .Take(50))
            .ToListAsync(ct);

        return Ok(rows);
    }

    [HttpPost]
    [Authorize(Policy = SportHubPolicies.FrontDesk)]
    public async Task<IActionResult> Create(
        [FromBody] CreateMemberSupportRequest request,
        CancellationToken ct = default)
    {
        var member = await db
            .Set<UserAccount>()
            .AsNoTracking()
            .Include(x => x.Role)
            .SingleOrDefaultAsync(
                x => x.UserId == request.MemberId,
                ct);

        if (
            member is null ||
            member.Role is null ||
            member.Role.RoleName != UserRole.Member)
        {
            return NotFound(new
            {
                error = "member_not_found",
                message = "Member was not found."
            });
        }

        // Newly registered members can be Active but still lack login credentials.
        if (!await db.Set<UserAccount>().AsNoTracking()
            .AnyAsync(u => u.UserId == request.MemberId
                && u.Status == UserStatus.Active
                && ((u.Credential != null && u.Credential.PasswordHash != null)
                    || u.ExternalLogins.Any()), ct))
            throw new ConflictException("member_not_activated", "Member must activate the account before a support request can be created.");


        var description = request.Description.Trim();
        var category = request.Category.Trim().ToUpperInvariant();

        if (description.Length < 3)
        {
            return BadRequest(new
            {
                error = "support_request_invalid",
                message =
                    "Description must contain at least 3 characters."
            });
        }

        var allowedCategories = new[]
        {
            "GENERAL",
            "MEMBERSHIP",
            "CLASS",
            "PAYMENT",
            "PT",
            "FACILITY",
            "ACCOUNT",
            "OTHER"
        };

        if (!allowedCategories.Contains(category))
        {
            return BadRequest(new
            {
                error = "support_category_invalid",
                message = "Invalid support request category."
            });
        }

        if (category == "PAYMENT")
        {
            if (request.InvoiceId is null || request.InvoiceId == Guid.Empty)
                throw new BadRequestException(PaymentSupportErrorCodes.PaymentRequestInvoiceRequired,
                    "Choose the member's paid VNPay invoice.");
            if (!string.IsNullOrWhiteSpace(request.ResolveNote))
                throw new ForbiddenException(PaymentSupportErrorCodes.PaymentRequestManagerOnly,
                    "A payment request cannot be resolved at the counter. A manager handles it.");
            await invoiceGuard.EnsureEligibleAsync(request.MemberId, request.InvoiceId.Value, ct);
        }

        var channel = (request.Channel ?? "COUNTER").Trim().ToUpperInvariant();
        if (channel is not ("COUNTER" or "PHONE" or "FANPAGE"))
            throw new BadRequestException("support_channel_invalid", "Invalid request channel.");

        var subject = request.Subject?.Trim();
        if (string.IsNullOrEmpty(subject))
        {
            var snippet = description.ReplaceLineEndings(" ");
            if (snippet.Length > 60) snippet = snippet[..60].TrimEnd() + "…";
            subject = $"{CategoryLabel(category)}: {snippet}";
        }

        var now = clock.UtcNow;
        var actorId = User.RequireUserId();
        var entity = new MemberSupportRequest
        {
            RequestId = Guid.NewGuid(),
            MemberId = request.MemberId,
            RecordedByUserId = actorId,
            Category = category,
            Subject = subject.Length > 200 ? subject[..200] : subject,
            Description = description,
            Status = "OPEN",
            Channel = channel,
            CreatedAt = now,
            SlaDueAtUtc = now.AddHours(SupportReminderService.InactivityHours),
            InvoiceId = category == "PAYMENT" ? request.InvoiceId : null
        };
        AddEvent(entity.RequestId, "CREATED", null);
        if (!string.IsNullOrWhiteSpace(request.ResolveNote))
        {
            var resolution = request.ResolveNote.Trim();
            entity.AssignedToUserId = actorId;
            entity.Status = "DONE";
            entity.ProgressNote = resolution;
            entity.ClosedAt = entity.UpdatedAt = now;
            AddEvent(entity.RequestId, "ASSIGNED", null, actorId);
            AddEvent(entity.RequestId, "DONE", resolution);
        }
        else if (request.AssigneeUserId is Guid assigneeId)
        {
            var role = await ValidateAssigneeAsync(assigneeId, request.HandoverNote, ct);
            if (category == "PAYMENT" && role != UserRole.CenterManager)
                throw new ConflictException(PaymentSupportErrorCodes.PaymentRequestManagerOnly,
                    "A payment request can only be handed to a manager.");
            entity.AssignedToUserId = assigneeId;
            entity.Status = "ASSIGNED";
            entity.UpdatedAt = now;
            var assignmentId = AddEvent(entity.RequestId, "ASSIGNED", request.HandoverNote?.Trim(), assigneeId);
            if (role is UserRole.SystemAdministrator or UserRole.Coach)
                await QueueAssignmentNoticeAsync(assigneeId, role, entity, assignmentId, ct);
        }

        db.Set<MemberSupportRequest>().Add(entity);
        audit.Write(new AuditEntry(User.RequireUserId(), "CREATE_SUPPORT_REQUEST", nameof(MemberSupportRequest),
            entity.RequestId.ToString(), NewValue: JsonSerializer.Serialize(new { entity.MemberId, entity.Category, entity.Subject })));

        // Acknowledge the request to the member (in-app notice + email), same as the self-service form.
        var contact = await db.Set<UserAccount>().AsNoTracking()
            .Where(x => x.UserId == request.MemberId)
            .Select(x => new { x.Email, Name = x.Profile != null ? x.Profile.FullName : x.Email })
            .SingleAsync(ct);
        var reference = entity.RequestId.ToString("N")[..8].ToUpperInvariant();
        var label = CategoryLabel(category);
        var resolved = entity.Status == "DONE";
        notifications.Queue(new NotificationRequest(request.MemberId, NotificationEvents.SupportRequestReceived,
            resolved
                ? $"Your {label} request \"{entity.Subject}\" (ref {reference}) was recorded and resolved by our front desk."
                : $"We received your {label} request \"{entity.Subject}\" (ref {reference}). Our team will review it and get back to you.",
            entity.RequestId));
        notifications.QueueEmail(new EmailNotificationRequest(request.MemberId, contact.Email,
            NotificationEvents.SupportRequestReceived, entity.RequestId,
            $"SportHub - We received your request ({reference})",
            SportHub.BuildingBlocks.Abstractions.Email.EmailContent.Paragraph(
                $"Hi {contact.Name}, our front desk recorded your request. "
                + (resolved ? "It has already been resolved." : "It is being handled by our team and we will update you as soon as there is progress."))
            + SportHub.BuildingBlocks.Abstractions.Email.EmailContent.Details(
                ("Reference", reference),
                ("Topic", label),
                ("Subject", entity.Subject),
                ("Details", description),
                ("Status", resolved ? "Resolved" : "Received"))));

        await db.SaveChangesAsync(ct);

        return Ok(Map(entity));
    }

    [HttpGet("stats")]
    public async Task<IActionResult> Stats(CancellationToken ct = default)
    {
        var now = clock.UtcNow;
        var overdue = await VisibleRequests()
            .CountAsync(x => x.SlaDueAtUtc <= now && x.Status != "DONE"
                && x.Status != "REJECTED" && x.Status != "CLOSED", ct);
        var counts = await VisibleRequests()
            .GroupBy(x => x.Status)
            .Select(g => new { Status = g.Key, Count = g.Count() })
            .ToListAsync(ct);
        int Count(string status) => counts.FirstOrDefault(x => x.Status == status)?.Count ?? 0;
        return Ok(new
        {
            notStarted = Count("OPEN") + Count("ASSIGNED"),
            open = Count("OPEN"),
            assigned = Count("ASSIGNED"),
            inProgress = Count("IN_PROGRESS"),
            overdue,
            done = Count("DONE") + Count("CLOSED"),
            rejected = Count("REJECTED")
        });
    }

    [HttpGet("queue")]
    public async Task<IActionResult> Queue([FromQuery] string? status = null,
        [FromQuery] int page = 1, [FromQuery] int pageSize = 20,
        [FromQuery, MaxLength(200)] string? search = null, [FromQuery] Guid? assignedToUserId = null,
        [FromQuery, MaxLength(50)] string? category = null,
        [FromQuery] bool? overdue = null,
        CancellationToken ct = default)
    {
        page = Math.Max(1, page);
        pageSize = Math.Clamp(pageSize, 1, 100);
        var query = VisibleRequests();
        if (overdue is bool filterOverdue)
        {
            var now = clock.UtcNow;
            query = filterOverdue
                ? query.Where(x => x.SlaDueAtUtc <= now && x.Status != "DONE"
                    && x.Status != "REJECTED" && x.Status != "CLOSED")
                : query.Where(x => x.SlaDueAtUtc > now || x.Status == "DONE"
                    || x.Status == "REJECTED" || x.Status == "CLOSED");
        }
        if (!string.IsNullOrWhiteSpace(status))
        {
            var value = status.Trim().ToUpperInvariant();
            if (value is not ("NOT_STARTED" or "FINISHED" or "OPEN" or "ASSIGNED" or "IN_PROGRESS" or "DONE" or "REJECTED" or "CLOSED"))
                throw new BadRequestException("support_status_invalid", "Invalid support request status.");
            if (value == "NOT_STARTED")
                query = query.Where(x => x.Status == "OPEN" || x.Status == "ASSIGNED");
            else if (value == "FINISHED")
                query = query.Where(x => x.Status == "DONE" || x.Status == "CLOSED");
            else
                query = query.Where(x => x.Status == value);
        }
        if (!string.IsNullOrWhiteSpace(category))
        {
            var value = category.Trim().ToUpperInvariant();
            if (value is not ("GENERAL" or "MEMBERSHIP" or "CLASS" or "PAYMENT" or "PT" or "FACILITY" or "ACCOUNT" or "OTHER"))
                throw new BadRequestException("support_category_invalid", "Invalid support request category.");
            query = value switch
            {
                "CLASS" => query.Where(x => x.Category == "CLASS" || x.Category == "PT"),
                "OTHER" => query.Where(x => x.Category == "OTHER" || x.Category == "GENERAL"),
                _ => query.Where(x => x.Category == value)
            };
        }
        if (assignedToUserId is not null)
            query = query.Where(x => x.AssignedToUserId == assignedToUserId);
        if (!string.IsNullOrWhiteSpace(search))
        {
            var term = search.Trim().ToLowerInvariant();
            query = query.Where(x => x.Subject.ToLower().Contains(term)
                || x.Description.ToLower().Contains(term)
                || db.Set<UserAccount>().Any(u => u.UserId == x.MemberId
                    && (u.Email.ToLower().Contains(term)
                        || (u.Profile != null && u.Profile.FullName.ToLower().Contains(term)))));
        }
        return Ok(new PagedResult<MemberSupportRequestResponse>
        {
            Items = await Project(query.OrderByDescending(x => x.UpdatedAt ?? x.CreatedAt)
                .ThenByDescending(x => x.RequestId).Skip((page - 1) * pageSize)
                .Take(pageSize)).ToListAsync(ct),
            TotalCount = await query.CountAsync(ct), Page = page, PageSize = pageSize
        });
    }

    [HttpGet("assignees")]
    [Authorize(Policy = SportHubPolicies.FrontDesk)]
    public async Task<IActionResult> Assignees(CancellationToken ct)
    {
        var canAssignAdmin = User.IsInRole(nameof(UserRole.CenterManager));
        return Ok(await db.Set<UserAccount>().AsNoTracking()
            .Where(x => x.Status == UserStatus.Active && x.Role != null
                && (x.Role.RoleName == UserRole.Receptionist || x.Role.RoleName == UserRole.CenterManager
                    || (canAssignAdmin && (x.Role.RoleName == UserRole.SystemAdministrator || x.Role.RoleName == UserRole.Coach))))
            .OrderBy(x => x.Email)
            .Select(x => new { x.UserId, Name = x.Profile != null ? x.Profile.FullName : x.Email,
                x.Email, Role = x.Role!.RoleName }).ToListAsync(ct));
    }

    [HttpPost("{requestId:guid}/assign")]
    [Authorize(Policy = SportHubPolicies.FrontDesk)]
    public async Task<IActionResult> Assign(Guid requestId, [FromBody] AssignSupportRequest body, CancellationToken ct)
    {
        var assigneeRole = await ValidateAssigneeAsync(body.AssigneeUserId, body.Note, ct);
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        var row = await LockAsync(requestId, ct);
        RequireManagerForPayment(row);
        if (row.Category == "PAYMENT" && assigneeRole != UserRole.CenterManager)
            throw new ConflictException(PaymentSupportErrorCodes.PaymentRequestManagerOnly,
                "A payment request can only be handed to a manager.");
        if (IsFinal(row.Status)) throw new ConflictException("support_request_final", "Support request has already been finalized.");
        var old = row.AssignedToUserId;
        if (old == body.AssigneeUserId)
        {
            await tx.CommitAsync(ct);
            return Ok(Map(row));
        }
        row.AssignedToUserId = body.AssigneeUserId;
        row.Status = "ASSIGNED";
        row.UpdatedAt = clock.UtcNow;
        var assignmentId = AddEvent(requestId, "ASSIGNED", body.Note?.Trim(), body.AssigneeUserId);
        if (assigneeRole is UserRole.SystemAdministrator or UserRole.Coach)
            await QueueAssignmentNoticeAsync(body.AssigneeUserId, assigneeRole, row, assignmentId, ct);
        audit.Write(new AuditEntry(User.RequireUserId(), "ASSIGN_SUPPORT_REQUEST", nameof(MemberSupportRequest),
            requestId.ToString(), OldValue: old is null ? null : JsonSerializer.Serialize(old),
            NewValue: JsonSerializer.Serialize(body.AssigneeUserId)));
        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);
        return Ok(Map(row));
    }

    [HttpPost("{requestId:guid}/progress")]
    public async Task<IActionResult> Progress(Guid requestId, [FromBody] UpdateSupportProgress body, CancellationToken ct)
    {
        var note = body.Note?.Trim();
        if (note?.Length is not >= 3 or > 1000)
            throw new BadRequestException("support_progress_invalid", "Progress note must have 3 to 1000 characters.");
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        var row = await LockAsync(requestId, ct);
        RequireAssignedHandler(row);
        RequireManagerForPayment(row);
        if (IsFinal(row.Status)) throw new ConflictException("support_request_final", "Support request has already been finalized.");
        if (row.AssignedToUserId is null)
            throw new ConflictException("support_request_unassigned", "Assign the request before updating progress.");
        row.Status = "IN_PROGRESS";
        row.ProgressNote = note;
        row.UpdatedAt = clock.UtcNow;
        row.SlaDueAtUtc = clock.UtcNow.AddHours(SupportReminderService.InactivityHours);
        AddEvent(requestId, "PROGRESS", note);
        audit.Write(new AuditEntry(User.RequireUserId(), "UPDATE_SUPPORT_PROGRESS", nameof(MemberSupportRequest),
            requestId.ToString(), NewValue: JsonSerializer.Serialize(note)));
        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);
        return Ok(Map(row));
    }

    private static bool IsFinal(string status) => status is "DONE" or "REJECTED" or "CLOSED";

    [HttpPost("{requestId:guid}/done")]
    public Task<IActionResult> Done(Guid requestId, [FromBody] FinishSupportRequest body, CancellationToken ct)
        => Finish(requestId, body, "DONE", ct);

    [HttpPost("{requestId:guid}/reject")]
    [Authorize(Policy = SportHubPolicies.FrontDesk)]
    public Task<IActionResult> Reject(Guid requestId, [FromBody] FinishSupportRequest body, CancellationToken ct)
        => Finish(requestId, body, "REJECTED", ct);

    private async Task<IActionResult> Finish(Guid requestId, FinishSupportRequest body, string target, CancellationToken ct)
    {
        var reason = body.Reason?.Trim();
        if (reason?.Length is not >= 3 or > 1000)
            throw new BadRequestException("support_final_note_invalid", "Final note must contain 3 to 1000 characters.");
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        var row = await LockAsync(requestId, ct);
        RequireAssignedHandler(row);
        RequireManagerForPayment(row);
        if (IsFinal(row.Status))
            throw new ConflictException("support_request_final", "Support request has already been finalized.");
        var payoutReview = row.Category == "PAYMENT"
            && await db.Set<MemberSupportPayout>().AnyAsync(p => p.RequestId == requestId, ct)
            && await db.Set<MemberSupportEvent>().AnyAsync(e => e.RequestId == requestId
                && e.Type == "MEMBER_REPORTED_NOT_RECEIVED", ct);
        // Reporting non-receipt clears the assignee. A manager may finish the review
        // directly; preserve ownership and history in the same locked transaction.
        if (row.AssignedToUserId is null && payoutReview)
        {
            row.AssignedToUserId = User.RequireUserId();
            AddEvent(requestId, "ASSIGNED", "Taken for payout receipt review.", User.RequireUserId());
        }
        if (row.AssignedToUserId is null)
            throw new ConflictException("support_request_unassigned", "Assign the request before finalizing it.");
        row.Status = target;
        row.ProgressNote = reason;
        row.ClosedAt = row.UpdatedAt = clock.UtcNow;
        AddEvent(requestId, target, reason);
        audit.Write(new AuditEntry(User.RequireUserId(),
            target == "DONE" ? "COMPLETE_SUPPORT_REQUEST" : "REJECT_SUPPORT_REQUEST",
            nameof(MemberSupportRequest), requestId.ToString(),
            NewValue: JsonSerializer.Serialize(target), Reason: reason));
        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);
        return Ok(Map(row));
    }

    private static string CategoryLabel(string category) => category switch
    {
        "PAYMENT" => "Payment",
        "MEMBERSHIP" => "Membership",
        "CLASS" or "PT" => "Coach",
        "FACILITY" => "Facilities",
        "ACCOUNT" => "Account",
        _ => "Other"
    };

    private static int Rank(UserRole role) => role switch
    {
        UserRole.SystemAdministrator => 2,
        UserRole.CenterManager => 1,
        _ => 0
    };

    /// <summary>Kiểm tra người nhận hợp lệ; chuyển lên vai trò cao hơn người thao tác thì bắt buộc có ghi chú.</summary>
    private async Task<UserRole> ValidateAssigneeAsync(Guid assigneeId, string? note, CancellationToken ct)
    {
        var assignee = await db.Set<UserAccount>().AsNoTracking()
            .Where(x => x.UserId == assigneeId && x.Status == UserStatus.Active && x.Role != null)
            .Select(x => new { Role = x.Role!.RoleName }).SingleOrDefaultAsync(ct);
        if (assignee?.Role == UserRole.SystemAdministrator && !User.IsInRole(nameof(UserRole.CenterManager)))
            throw new ForbiddenException("support_admin_assignment_forbidden",
                "Only a manager can assign requests to an administrator.");
        if (assignee?.Role == UserRole.Coach && !User.IsInRole(nameof(UserRole.CenterManager)))
            throw new ForbiddenException("support_coach_assignment_forbidden", "Only a manager can assign requests to a coach.");
        if (assignee is null || (assignee.Role != UserRole.Receptionist
            && assignee.Role != UserRole.CenterManager && assignee.Role != UserRole.SystemAdministrator && assignee.Role != UserRole.Coach))
            throw new BadRequestException("support_assignee_invalid", "Choose an eligible active staff member.");
        var actorRank = User.IsInRole(nameof(UserRole.CenterManager)) ? 1 : 0;
        if (Rank(assignee.Role) > actorRank && (note?.Trim().Length ?? 0) < 3)
            throw new BadRequestException("support_transfer_note_required",
                "A transfer note is required when escalating to a higher role.");
        return assignee.Role;
    }

    private async Task QueueAssignmentNoticeAsync(Guid recipientId, UserRole role, MemberSupportRequest row, Guid assignmentId, CancellationToken ct)
    {
        var actorId = User.RequireUserId();
        var names = await db.Set<UserAccount>().AsNoTracking()
            .Where(x => x.UserId == actorId || x.UserId == row.MemberId)
            .Select(x => new { x.UserId, Name = x.Profile != null ? x.Profile.FullName : x.Email })
            .ToDictionaryAsync(x => x.UserId, x => x.Name, ct);
        // The source identifies this assignment occurrence, allowing a later reassignment
        // back to the same administrator without colliding with the notification unique index.
        var message = $"Manager {names.GetValueOrDefault(actorId)} assigned a member support request to you.\n"
            + $"Subject: {row.Subject}\nMember: {names.GetValueOrDefault(row.MemberId)}\n"
            + $"Category: {row.Category}\n{row.Description}";
        notifications.Queue(new NotificationRequest(recipientId, NotificationEvents.SupportRequestAssigned, message, assignmentId));
        if (role == UserRole.Coach)
        {
            var email = await db.Set<UserAccount>().Where(x => x.UserId == recipientId).Select(x => x.Email).SingleAsync(ct);
            notifications.QueueEmail(new EmailNotificationRequest(recipientId, email, NotificationEvents.SupportRequestAssigned,
                assignmentId, "SportHub - A support request has been assigned to you",
                SportHub.BuildingBlocks.Abstractions.Email.EmailContent.Paragraph($"Manager {names.GetValueOrDefault(actorId)} assigned a support request to you. Open Support requests in your Coach workspace to respond.")
                + SportHub.BuildingBlocks.Abstractions.Email.EmailContent.Details(("Reference", row.RequestId.ToString("N")[..8].ToUpperInvariant()),
                    ("Subject", row.Subject), ("Member", names.GetValueOrDefault(row.MemberId) ?? "Member"),
                    ("Category", CategoryLabel(row.Category)), ("Details", row.Description))));
        }
    }

    private Guid AddEvent(Guid requestId, string type, string? note, Guid? targetUserId = null)
    {
        var eventId = Guid.NewGuid();
        db.Set<MemberSupportEvent>().Add(new MemberSupportEvent
        {
            EventId = eventId,
            RequestId = requestId,
            ActorUserId = User.RequireUserId(),
            Type = type,
            Note = string.IsNullOrWhiteSpace(note) ? null : note.Trim(),
            TargetUserId = targetUserId,
            CreatedAt = clock.UtcNow
        });
        return eventId;
    }

    /// <summary>Front desk reminds the managers about a payment request on the member's behalf.</summary>
    [HttpPost("{requestId:guid}/remind")]
    [Authorize(Policy = SportHubPolicies.FrontDesk)]
    public async Task<IActionResult> Remind(Guid requestId, CancellationToken ct)
    {
        var result = await reminders.RemindAsync(requestId, User.RequireUserId(), byStaff: true, ct);
        if (result.Sent) return Ok(result);
        var seconds = Math.Max(1, (int)Math.Ceiling((result.CanRemindAtUtc - clock.UtcNow).TotalSeconds));
        Response.Headers.RetryAfter = seconds.ToString(System.Globalization.CultureInfo.InvariantCulture);
        return Conflict(new
        {
            error = PaymentSupportErrorCodes.SupportRemindTooEarly,
            message = "A reminder can be sent after the response deadline or cooldown.",
            retryAfter = seconds,
            canRemindAtUtc = result.CanRemindAtUtc
        });
    }

    [HttpGet("{requestId:guid}")]
    public async Task<IActionResult> GetOne(Guid requestId, CancellationToken ct)
        => await Project(VisibleRequests().Where(x => x.RequestId == requestId))
            .SingleOrDefaultAsync(ct) is { } row
            ? Ok(row)
            : throw new NotFoundException("support_request_not_found", "Support request not found.");

    [HttpGet("{requestId:guid}/events")]
    public async Task<IActionResult> Events(Guid requestId, CancellationToken ct)
    {
        if (!await VisibleRequests().AnyAsync(x => x.RequestId == requestId, ct))
            throw new NotFoundException("support_request_not_found", "Support request not found.");
        var events = await db.Set<MemberSupportEvent>().AsNoTracking()
            .Where(e => e.RequestId == requestId)
            .OrderBy(e => e.CreatedAt)
            .Select(e => new SupportEventResponse(e.EventId, e.Type, e.Note, e.CreatedAt,
                e.ActorUserId == null ? "System" : db.Set<UserAccount>().Where(u => u.UserId == e.ActorUserId)
                    .Select(u => u.Profile != null ? u.Profile.FullName : u.Email).FirstOrDefault() ?? "Unknown",
                db.Set<UserAccount>().Where(u => u.UserId == e.ActorUserId)
                    .Select(u => u.Role!.RoleName.ToString()).FirstOrDefault(),
                e.TargetUserId == null ? null
                    : db.Set<UserAccount>().Where(u => u.UserId == e.TargetUserId)
                        .Select(u => u.Profile != null ? u.Profile.FullName : u.Email).FirstOrDefault()))
            .ToListAsync(ct);
        return Ok(events);
    }

    private async Task<MemberSupportRequest> LockAsync(Guid requestId, CancellationToken ct)
    {
        var rows = await db.Set<MemberSupportRequest>().FromSqlInterpolated(
            $"SELECT * FROM member_support_requests WHERE request_id = {requestId} FOR UPDATE").ToListAsync(ct);
        return rows.SingleOrDefault()
            ?? throw new NotFoundException("support_request_not_found", "Support request not found.");
    }
}
