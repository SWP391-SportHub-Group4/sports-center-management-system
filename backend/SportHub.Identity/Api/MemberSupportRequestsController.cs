using System.ComponentModel.DataAnnotations;
using System.Text.Json;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SportHub.BuildingBlocks.Abstractions.Persistence;
using SportHub.BuildingBlocks.Abstractions.Audit;
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

    [Required, MinLength(3), MaxLength(200)]
    public string Subject { get; set; } = string.Empty;

    [Required, MinLength(3), MaxLength(2000)]
    public string Description { get; set; } = string.Empty;
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
    string? AssignedToName = null);

public sealed record AssignSupportRequest(Guid AssigneeUserId);
public sealed class UpdateSupportProgress
{
    [Required, MinLength(3), MaxLength(1000)] public string Note { get; set; } = string.Empty;
}
public sealed class FinishSupportRequest
{
    [Required, MinLength(3), MaxLength(1000)] public string Reason { get; set; } = string.Empty;
}

[ApiController]
[Authorize(Policy = SportHubPolicies.FrontDesk)]
[Route("api/member-support-requests")]
public sealed class MemberSupportRequestsController(
    ISportHubDbContext db,
    IClock clock,
    IAuditWriter audit,
    INotificationWriter notifications) : ControllerBase
{
    private static MemberSupportRequestResponse Map(MemberSupportRequest x) => new(
        x.RequestId, x.MemberId, x.RecordedByUserId, x.Category, x.Subject,
        x.Description, x.Status, x.CreatedAt, x.AssignedToUserId,
        x.ProgressNote, x.UpdatedAt, x.ClosedAt);

    private IQueryable<MemberSupportRequestResponse> Project(IQueryable<MemberSupportRequest> query)
        => query.Select(x => new MemberSupportRequestResponse(
            x.RequestId, x.MemberId, x.RecordedByUserId, x.Category, x.Subject,
            x.Description, x.Status, x.CreatedAt, x.AssignedToUserId,
            x.ProgressNote, x.UpdatedAt, x.ClosedAt,
            db.Set<UserAccount>().Where(u => u.UserId == x.MemberId)
                .Select(u => u.Profile != null ? u.Profile.FullName : u.Email).FirstOrDefault(),
            db.Set<UserAccount>().Where(u => u.UserId == x.MemberId).Select(u => u.Email).FirstOrDefault(),
            db.Set<UserAccount>().Where(u => u.UserId == x.AssignedToUserId)
                .Select(u => u.Profile != null ? u.Profile.FullName : u.Email).FirstOrDefault()));

    [HttpGet]
    public async Task<IActionResult> List(
        [FromQuery] Guid memberId,
        CancellationToken ct = default)
    {
        var memberExists = await db
            .Set<UserAccount>()
            .AsNoTracking()
            .Include(x => x.Role)
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

        var subject = request.Subject.Trim();
        var description = request.Description.Trim();
        var category = request.Category.Trim().ToUpperInvariant();

        if (subject.Length < 3 ||
            description.Length < 3)
        {
            return BadRequest(new
            {
                error = "support_request_invalid",
                message =
                    "Subject and description must contain at least 3 characters."
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

        var entity = new MemberSupportRequest
        {
            RequestId = Guid.NewGuid(),
            MemberId = request.MemberId,
            RecordedByUserId = User.RequireUserId(),
            Category = category,
            Subject = subject,
            Description = description,
            Status = "OPEN",
            CreatedAt = clock.UtcNow
        };

        db.Set<MemberSupportRequest>().Add(entity);
        audit.Write(new AuditEntry(User.RequireUserId(), "CREATE_SUPPORT_REQUEST", nameof(MemberSupportRequest),
            entity.RequestId.ToString(), NewValue: JsonSerializer.Serialize(new { entity.MemberId, entity.Category, entity.Subject })));

        await db.SaveChangesAsync(ct);

        return Ok(Map(entity));
    }

    [HttpGet("stats")]
    public async Task<IActionResult> Stats(CancellationToken ct = default)
    {
        var counts = await db.Set<MemberSupportRequest>()
            .AsNoTracking()
            .GroupBy(x => x.Status)
            .Select(g => new { Status = g.Key, Count = g.Count() })
            .ToListAsync(ct);
        int Count(string status) => counts.FirstOrDefault(x => x.Status == status)?.Count ?? 0;
        return Ok(new
        {
            open = Count("OPEN"),
            assigned = Count("ASSIGNED"),
            inProgress = Count("IN_PROGRESS"),
            done = Count("DONE") + Count("CLOSED"),
            rejected = Count("REJECTED")
        });
    }

    [HttpGet("queue")]
    public async Task<IActionResult> Queue([FromQuery] string? status = null,
        [FromQuery] int page = 1, [FromQuery] int pageSize = 20,
        [FromQuery, MaxLength(200)] string? search = null, [FromQuery] Guid? assignedToUserId = null,
        [FromQuery, MaxLength(50)] string? category = null,
        CancellationToken ct = default)
    {
        page = Math.Max(1, page);
        pageSize = Math.Clamp(pageSize, 1, 100);
        var query = db.Set<MemberSupportRequest>().AsNoTracking().AsQueryable();
        if (!string.IsNullOrWhiteSpace(status))
        {
            var value = status.Trim().ToUpperInvariant();
            if (value is not ("OPEN" or "ASSIGNED" or "IN_PROGRESS" or "DONE" or "REJECTED" or "CLOSED"))
                throw new BadRequestException("support_status_invalid", "Invalid support request status.");
            query = value == "DONE"
                ? query.Where(x => x.Status == "DONE" || x.Status == "CLOSED")
                : query.Where(x => x.Status == value);
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
    public async Task<IActionResult> Assignees(CancellationToken ct)
    {
        var canAssignAdmin = User.IsInRole(nameof(UserRole.CenterManager));
        return Ok(await db.Set<UserAccount>().AsNoTracking()
            .Where(x => x.Status == UserStatus.Active && x.Role != null
                && (x.Role.RoleName == UserRole.Receptionist || x.Role.RoleName == UserRole.CenterManager
                    || (canAssignAdmin && x.Role.RoleName == UserRole.SystemAdministrator)))
            .OrderBy(x => x.Email)
            .Select(x => new { x.UserId, Name = x.Profile != null ? x.Profile.FullName : x.Email,
                x.Email, Role = x.Role!.RoleName }).ToListAsync(ct));
    }

    [HttpPost("{requestId:guid}/assign")]
    public async Task<IActionResult> Assign(Guid requestId, [FromBody] AssignSupportRequest body, CancellationToken ct)
    {
        var assignee = await db.Set<UserAccount>().AsNoTracking()
            .Where(x => x.UserId == body.AssigneeUserId && x.Status == UserStatus.Active && x.Role != null)
            .Select(x => new { Role = x.Role!.RoleName }).SingleOrDefaultAsync(ct);
        if (assignee?.Role == UserRole.SystemAdministrator
            && !User.IsInRole(nameof(UserRole.CenterManager)))
            return StatusCode(403, new { error = "support_admin_assignment_forbidden",
                message = "Only a manager can assign requests to an administrator." });
        if (assignee is null || (assignee.Role != UserRole.Receptionist
            && assignee.Role != UserRole.CenterManager && assignee.Role != UserRole.SystemAdministrator))
            throw new BadRequestException("support_assignee_invalid", "Choose an eligible active staff member.");
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        var row = await LockAsync(requestId, ct);
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
        if (assignee.Role == UserRole.SystemAdministrator)
        {
            var actorId = User.RequireUserId();
            var names = await db.Set<UserAccount>().AsNoTracking()
                .Where(x => x.UserId == actorId || x.UserId == row.MemberId)
                .Select(x => new { x.UserId, Name = x.Profile != null ? x.Profile.FullName : x.Email })
                .ToDictionaryAsync(x => x.UserId, x => x.Name, ct);
            // The source identifies this assignment occurrence, allowing a later reassignment
            // back to the same administrator without colliding with the notification unique index.
            notifications.Queue(new NotificationRequest(body.AssigneeUserId, NotificationEvents.SupportRequestAssigned,
                $"Manager {names.GetValueOrDefault(actorId)} assigned a member support request to you.\n"
                + $"Subject: {row.Subject}\nMember: {names.GetValueOrDefault(row.MemberId)}\n"
                + $"Category: {row.Category}\n{row.Description}", Guid.NewGuid()));
        }
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
        if (IsFinal(row.Status)) throw new ConflictException("support_request_final", "Support request has already been finalized.");
        if (row.AssignedToUserId is null)
            throw new ConflictException("support_request_unassigned", "Assign the request before updating progress.");
        row.Status = "IN_PROGRESS";
        row.ProgressNote = note;
        row.UpdatedAt = clock.UtcNow;
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
    public Task<IActionResult> Reject(Guid requestId, [FromBody] FinishSupportRequest body, CancellationToken ct)
        => Finish(requestId, body, "REJECTED", ct);

    private async Task<IActionResult> Finish(Guid requestId, FinishSupportRequest body, string target, CancellationToken ct)
    {
        var reason = body.Reason?.Trim();
        if (reason?.Length is not >= 3 or > 1000)
            throw new BadRequestException("support_final_note_invalid", "Final note must contain 3 to 1000 characters.");
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        var row = await LockAsync(requestId, ct);
        if (IsFinal(row.Status))
            throw new ConflictException("support_request_final", "Support request has already been finalized.");
        if (row.AssignedToUserId is null)
            throw new ConflictException("support_request_unassigned", "Assign the request before finalizing it.");
        row.Status = target;
        row.ProgressNote = reason;
        row.ClosedAt = row.UpdatedAt = clock.UtcNow;
        audit.Write(new AuditEntry(User.RequireUserId(),
            target == "DONE" ? "COMPLETE_SUPPORT_REQUEST" : "REJECT_SUPPORT_REQUEST",
            nameof(MemberSupportRequest), requestId.ToString(),
            NewValue: JsonSerializer.Serialize(target), Reason: reason));
        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);
        return Ok(Map(row));
    }

    private async Task<MemberSupportRequest> LockAsync(Guid requestId, CancellationToken ct)
    {
        var rows = await db.Set<MemberSupportRequest>().FromSqlInterpolated(
            $"SELECT * FROM member_support_requests WHERE request_id = {requestId} FOR UPDATE").ToListAsync(ct);
        return rows.SingleOrDefault()
            ?? throw new NotFoundException("support_request_not_found", "Support request not found.");
    }
}
