using SportHub.Identity.Domain.Entities;
using SportHub.Identity.Domain.Enums;
using System.ComponentModel.DataAnnotations;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;
using SportHub.BuildingBlocks.Api;
using SportHub.BuildingBlocks.Abstractions.Audit;
using SportHub.BuildingBlocks.Abstractions.Notifications;
using SportHub.BuildingBlocks.Abstractions.Persistence;
using SportHub.BuildingBlocks.SharedKernel.Errors;
using SportHub.BuildingBlocks.SharedKernel.Time;
using SportHub.Identity.Application.Services;

namespace SportHub.Identity.Api;

public sealed class ReportAvatarRequest
{
    public Guid TargetUserId { get; set; }
    [Required, MinLength(3), MaxLength(500)] public string Reason { get; set; } = "";
    [Required, MaxLength(2048)] public string AvatarUrl { get; set; } = "";
}

[ApiController, Authorize]
public sealed class AvatarReportsController(ISportHubDbContext db, IAuditWriter audit,
    INotificationWriter notices, IClock clock, AvatarService avatars) : ControllerBase
{
    [HttpPost("api/avatars/reports"), EnableRateLimiting("avatar-write")]
    public async Task<IActionResult> Report(ReportAvatarRequest request, CancellationToken ct)
    {
        var reporter = User.RequireUserId();
        if (request.Reason.Trim().Length < 3)
            throw new BadRequestException("avatar_report_reason_required", "Enter a reason with at least 3 characters.");
        if (reporter == request.TargetUserId)
            throw new BadRequestException("avatar_report_self", "You can remove your own photo from your profile.");
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        // Serialize duplicate reports and profile moderation for this account.
        await db.Database.ExecuteSqlInterpolatedAsync($"SELECT user_id FROM user_accounts WHERE user_id={request.TargetUserId} FOR UPDATE", ct);
        var target = await db.Set<UserAccount>().Include(u => u.Role).Include(u => u.Profile)
            .SingleOrDefaultAsync(u => u.UserId == request.TargetUserId, ct);
        if (target?.Role?.RoleName is not (UserRole.Member or UserRole.Coach) || target.Profile?.AvatarUrl is null)
            throw new NotFoundException("avatar_owner_not_found", "This profile photo is no longer available.");
        if (target.Profile.AvatarUrl != request.AvatarUrl)
            throw new ConflictException("avatar_changed", "The photo changed. Reload the profile before reporting it.");
        var duplicate = await db.Set<AvatarReport>().FirstOrDefaultAsync(r => r.TargetUserId == request.TargetUserId
            && r.ReporterUserId == reporter && r.AvatarUrl == request.AvatarUrl && r.Status == "OPEN", ct);
        if (duplicate is not null) return Ok(new { duplicate.ReportId });
        var report = new AvatarReport { ReportId = Guid.NewGuid(), TargetUserId = request.TargetUserId,
            ReporterUserId = reporter, AvatarUrl = request.AvatarUrl, Reason = request.Reason.Trim(), CreatedAtUtc = clock.UtcNow };
        db.Set<AvatarReport>().Add(report);
        var managers = await db.Set<UserAccount>().Where(u => u.Role!.RoleName == UserRole.SystemAdministrator
            && u.Status == UserStatus.Active).Select(u => u.UserId).ToArrayAsync(ct);
        foreach (var manager in managers)
            notices.Queue(new NotificationRequest(manager, NotificationEvents.AvatarReported,
                $"A profile photo was reported for {target.Profile.FullName ?? target.Email}. Review the account in Administration.", report.ReportId));
        audit.Write(new AuditEntry(reporter, "REPORT_AVATAR", nameof(AvatarReport), report.ReportId.ToString(), Reason: report.Reason));
        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);
        return Ok(new { report.ReportId });
    }

    [HttpGet("api/admin/avatar-reports"), Authorize(Policy = SportHubPolicies.SystemAdministrator)]
    public async Task<IActionResult> List(string? status, string? search, int page = 1, int pageSize = 20, CancellationToken ct = default)
    {
        page = Math.Max(1, page); pageSize = Math.Clamp(pageSize, 1, 100);
        var rows = from r in db.Set<AvatarReport>().AsNoTracking()
                   join u in db.Set<UserAccount>() on r.TargetUserId equals u.UserId
                   select new { r.ReportId, r.TargetUserId, TargetName = u.Profile != null ? u.Profile.FullName : u.Email,
                       TargetRole = u.Role!.RoleName == UserRole.Coach ? "COACH" : "MEMBER", r.AvatarUrl, CurrentAvatarUrl = u.Profile != null ? u.Profile.AvatarUrl : null,
                       r.Reason, r.Status, r.CreatedAtUtc, r.ReviewedAtUtc };
        if (!string.IsNullOrEmpty(status)) rows = rows.Where(r => r.Status == status);
        if (!string.IsNullOrWhiteSpace(search)) rows = rows.Where(r => (r.TargetName ?? "").ToLower().Contains(search.Trim().ToLower()));
        var totalCount = await rows.CountAsync(ct);
        return Ok(new { items = await rows.OrderByDescending(r => r.CreatedAtUtc).ThenBy(r => r.ReportId)
            .Skip((page - 1) * pageSize).Take(pageSize).ToListAsync(ct), totalCount, page, pageSize });
    }

    [HttpPost("api/admin/avatar-reports/{reportId:guid}/dismiss"), Authorize(Policy = SportHubPolicies.SystemAdministrator)]
    public async Task<IActionResult> Dismiss(Guid reportId, CancellationToken ct)
    {
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        var report = await db.Set<AvatarReport>().FromSqlInterpolated($"SELECT * FROM avatar_report WHERE report_id={reportId} FOR UPDATE")
            .SingleOrDefaultAsync(ct) ?? throw new NotFoundException("avatar_report_not_found", "Report not found.");
        if (report.Status != "OPEN") return NoContent();
        report.Status = "DISMISSED"; report.ReviewedByUserId = User.RequireUserId(); report.ReviewedAtUtc = clock.UtcNow;
        audit.Write(new AuditEntry(User.RequireUserId(), "DISMISS_AVATAR_REPORT", nameof(AvatarReport), reportId.ToString()));
        await db.SaveChangesAsync(ct); await tx.CommitAsync(ct); return NoContent();
    }

    [HttpDelete("api/admin/users/{userId:guid}/avatar"), Authorize(Policy = SportHubPolicies.SystemAdministrator), EnableRateLimiting("avatar-write")]
    public async Task<IActionResult> Remove(Guid userId, CancellationToken ct)
        => Ok(await avatars.ManagerDeleteMemberAsync(User.RequireUserId(), userId, ct, allowCoach: true));
}
