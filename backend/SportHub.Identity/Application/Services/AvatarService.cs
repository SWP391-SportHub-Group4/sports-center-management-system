using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using SportHub.BuildingBlocks.Abstractions.Audit;
using SportHub.BuildingBlocks.Abstractions.Persistence;
using SportHub.BuildingBlocks.SharedKernel.Errors;
using SportHub.BuildingBlocks.SharedKernel.Time;
using SportHub.Identity.Application.Interfaces;
using SportHub.Identity.Domain.Entities;
using SportHub.Identity.Domain.Enums;

namespace SportHub.Identity.Application.Services;

public sealed record AvatarResponse(Guid UserId, string? AvatarUrl);
public sealed record AvatarReportResponse(Guid ReportId, Guid TargetUserId, string TargetName,
    Guid ReporterUserId, string ReporterName, string AvatarUrl, string Reason, string Status,
    DateTime CreatedAt, DateTime? ReviewedAt);

public sealed class AvatarService(ISportHubDbContext db, IAvatarStorage storage, IAuditWriter audit,
    IClock clock, ILogger<AvatarService> logger)
{
    public const int MaxUploadBytes = 5 * 1024 * 1024;

    public async Task<AvatarResponse> UploadAsync(Guid userId, byte[] bytes, string contentType, CancellationToken ct)
    {
        var user = await EditableUserAsync(userId, ct);
        ValidateImage(bytes, contentType);
        var uploaded = await storage.UploadAsync(userId, bytes, contentType, ct);
        var saved = false;
        try
        {
            user.Profile ??= new UserProfile { UserId = userId };
            var old = user.Profile.AvatarPublicId;
            user.Profile.AvatarUrl = uploaded.Url;
            user.Profile.AvatarPublicId = uploaded.PublicId;
            user.Profile.AvatarVersion++;
            QueueDeletion(old);
            CloseReports(userId, "STALE");
            audit.Write(new AuditEntry(userId, "UPDATE_AVATAR", nameof(UserProfile), userId.ToString()));
            try { await db.SaveChangesAsync(ct); }
            catch (DbUpdateConcurrencyException)
            { throw new ConflictException("avatar_changed", "The avatar has changed. Please try again."); }
            saved = true;
            await TryFlushDeletionAsync(old, ct);
            return new AvatarResponse(userId, uploaded.Url);
        }
        catch
        {
            // A failed database update must not leave the newly uploaded image unowned.
            // Once saved, deletion of the old image is retried from avatar_deletions.
            if (!saved)
                await TryDeleteUnreferencedAsync(uploaded.PublicId, ct);
            throw;
        }
    }

    public async Task<AvatarResponse> DeleteAsync(Guid userId, CancellationToken ct)
    {
        var user = await EditableUserAsync(userId, ct);
        var old = user.Profile?.AvatarPublicId;
        if (user.Profile is null || user.Profile.AvatarUrl is null) return new AvatarResponse(userId, null);
        user.Profile.AvatarUrl = null;
        user.Profile.AvatarPublicId = null;
        user.Profile.AvatarVersion++;
        QueueDeletion(old);
        CloseReports(userId, "STALE");
        audit.Write(new AuditEntry(userId, "DELETE_AVATAR", nameof(UserProfile), userId.ToString()));
        try { await db.SaveChangesAsync(ct); }
        catch (DbUpdateConcurrencyException)
        { throw new ConflictException("avatar_changed", "The avatar has changed. Please try again."); }
        await TryFlushDeletionAsync(old, ct);
        return new AvatarResponse(userId, null);
    }

    /// <summary>Only called for a newly created Google Member; later logins never sync the picture.</summary>
    public async Task ImportGooglePictureAsync(Guid userId, string pictureUrl, CancellationToken ct)
    {
        var user = await EditableUserAsync(userId, ct);
        if (user.Profile?.AvatarUrl is not null) return;
        var imported = await storage.ImportGooglePictureAsync(userId, pictureUrl, ct);
        user.Profile ??= new UserProfile { UserId = userId };
        user.Profile.AvatarUrl = imported.Url;
        user.Profile.AvatarPublicId = imported.PublicId;
        user.Profile.AvatarVersion++;
        audit.Write(new AuditEntry(userId, "IMPORT_GOOGLE_AVATAR", nameof(UserProfile), userId.ToString()));
        try { await db.SaveChangesAsync(ct); }
        catch
        {
            await TryDeleteUnreferencedAsync(imported.PublicId, ct);
            throw;
        }
    }

    public async Task<AvatarResponse> GetAsync(Guid targetUserId, bool anonymous, CancellationToken ct)
    {
        var row = await db.Set<UserAccount>().AsNoTracking().Where(u => u.UserId == targetUserId
            && u.Status == UserStatus.Active && u.Role != null
            && (u.Role.RoleName == UserRole.Member || u.Role.RoleName == UserRole.Coach))
            .Select(u => new { Role = u.Role!.RoleName, AvatarUrl = u.Profile != null ? u.Profile.AvatarUrl : null })
            .SingleOrDefaultAsync(ct)
            ?? throw new NotFoundException("avatar_owner_not_found", "User not found.");
        if (anonymous && row.Role != UserRole.Coach)
            throw new ForbiddenException("avatar_not_public", "Member avatars are visible only to signed-in users.");
        return new AvatarResponse(targetUserId, row.AvatarUrl);
    }

    public async Task<Guid> ReportAsync(Guid reporterUserId, Guid targetUserId, string reason, CancellationToken ct)
    {
        if (reporterUserId == targetUserId)
            throw new BadRequestException("avatar_self_report", "You cannot report your own avatar.");
        reason = reason?.Trim() ?? string.Empty;
        if (reason.Length is < 10 or > 500)
            throw new BadRequestException("avatar_report_reason_invalid", "The reason must be 10 to 500 characters long.");
        var target = await db.Set<UserAccount>().AsNoTracking().Where(u => u.UserId == targetUserId
            && u.Status == UserStatus.Active && u.Role != null
            && (u.Role.RoleName == UserRole.Member || u.Role.RoleName == UserRole.Coach))
            .Select(u => new { Url = u.Profile != null ? u.Profile.AvatarUrl : null,
                PublicId = u.Profile != null ? u.Profile.AvatarPublicId : null }).SingleOrDefaultAsync(ct)
            ?? throw new NotFoundException("avatar_owner_not_found", "User not found.");
        if (target.Url is null)
            throw new ConflictException("avatar_not_present", "This user has no avatar.");
        if (await db.Set<AvatarReport>().AnyAsync(r => r.ReporterUserId == reporterUserId
            && r.TargetUserId == targetUserId && r.AvatarUrl == target.Url && r.Status == "PENDING", ct))
            throw new ConflictException("avatar_already_reported", "You have already reported this avatar.");
        var report = new AvatarReport { ReportId = Guid.NewGuid(), ReporterUserId = reporterUserId,
            TargetUserId = targetUserId, AvatarUrl = target.Url, AvatarPublicId = target.PublicId,
            Reason = reason, CreatedAt = clock.UtcNow };
        db.Set<AvatarReport>().Add(report);
        audit.Write(new AuditEntry(reporterUserId, "REPORT_AVATAR", nameof(AvatarReport), report.ReportId.ToString()));
        await db.SaveChangesAsync(ct);
        return report.ReportId;
    }

    public async Task<IReadOnlyList<AvatarReportResponse>> ListReportsAsync(string status, CancellationToken ct)
    {
        status = status.ToUpperInvariant();
        if (status is not ("PENDING" or "REMOVED" or "DISMISSED" or "STALE"))
            throw new BadRequestException("avatar_report_status_invalid", "Invalid report status.");
        return await (from r in db.Set<AvatarReport>().AsNoTracking()
            join target in db.Set<UserAccount>().AsNoTracking() on r.TargetUserId equals target.UserId
            join reporter in db.Set<UserAccount>().AsNoTracking() on r.ReporterUserId equals reporter.UserId
            where r.Status == status
            orderby r.CreatedAt descending
            select new AvatarReportResponse(r.ReportId, r.TargetUserId,
                target.Profile != null ? target.Profile.FullName : target.Email,
                r.ReporterUserId, reporter.Profile != null ? reporter.Profile.FullName : reporter.Email,
                r.AvatarUrl, r.Reason, r.Status, r.CreatedAt, r.ReviewedAt))
            .Take(100).ToListAsync(ct);
    }

    public async Task ReviewAsync(Guid managerId, Guid reportId, bool remove, CancellationToken ct)
    {
        var report = await db.Set<AvatarReport>().SingleOrDefaultAsync(r => r.ReportId == reportId, ct)
            ?? throw new NotFoundException("avatar_report_not_found", "Report not found.");
        if (report.Status != "PENDING")
            throw new ConflictException("avatar_report_processed", "This report has already been processed.");
        var target = await db.Set<UserAccount>().Include(u => u.Profile).SingleAsync(u => u.UserId == report.TargetUserId, ct);
        if (remove)
        {
            if (target.Profile?.AvatarUrl != report.AvatarUrl)
                throw new ConflictException("avatar_report_stale", "The avatar has changed. This report cannot remove the new image.");
            var old = target.Profile.AvatarPublicId;
            target.Profile.AvatarUrl = null;
            target.Profile.AvatarPublicId = null;
            target.Profile.AvatarVersion++;
            QueueDeletion(old);
            CloseReports(report.TargetUserId, "REMOVED", managerId);
            audit.Write(new AuditEntry(managerId, "REMOVE_REPORTED_AVATAR", nameof(UserProfile), report.TargetUserId.ToString(),
                Reason: report.Reason));
            try { await db.SaveChangesAsync(ct); }
            catch (DbUpdateConcurrencyException)
            { throw new ConflictException("avatar_changed", "The avatar has changed. Please reload the report."); }
            await TryFlushDeletionAsync(old, ct);
        }
        else
        {
            report.Status = "DISMISSED";
            report.ReviewedById = managerId;
            report.ReviewedAt = clock.UtcNow;
            audit.Write(new AuditEntry(managerId, "DISMISS_AVATAR_REPORT", nameof(AvatarReport), reportId.ToString()));
            await db.SaveChangesAsync(ct);
        }
    }

    public async Task ProcessPendingDeletionsAsync(CancellationToken ct)
    {
        var ids = await db.Set<AvatarDeletion>().AsNoTracking().OrderBy(x => x.CreatedAt)
            .Take(20).Select(x => x.PublicId).ToListAsync(ct);
        foreach (var id in ids) await FlushDeletionAsync(id, ct);
    }

    private async Task<UserAccount> EditableUserAsync(Guid userId, CancellationToken ct)
    {
        var user = await db.Set<UserAccount>().Include(u => u.Role).Include(u => u.Profile)
            .SingleOrDefaultAsync(u => u.UserId == userId, ct)
            ?? throw new NotFoundException("user_not_found", "Account not found.");
        if (user.Role?.RoleName is not (UserRole.Member or UserRole.Coach))
            throw new ForbiddenException("avatar_role_forbidden", "Only members and coaches can change their own avatars.");
        if (user.Status != UserStatus.Active)
            throw new ForbiddenException("avatar_account_inactive", "This account is inactive.");
        return user;
    }

    private static void ValidateImage(byte[] bytes, string contentType)
    {
        if (bytes.Length == 0 || bytes.Length > MaxUploadBytes)
            throw new BadRequestException("avatar_size_invalid", "The image must be no larger than 5 MB.");
        var jpeg = bytes.Length >= 3 && bytes[0] == 0xff && bytes[1] == 0xd8 && bytes[2] == 0xff;
        var png = bytes.Length >= 8 && bytes.AsSpan(0, 8).SequenceEqual(new byte[] { 137, 80, 78, 71, 13, 10, 26, 10 });
        var webp = bytes.Length >= 12 && bytes.AsSpan(0, 4).SequenceEqual("RIFF"u8)
            && bytes.AsSpan(8, 4).SequenceEqual("WEBP"u8);
        if (!((contentType == "image/jpeg" && jpeg) || (contentType == "image/png" && png)
            || (contentType == "image/webp" && webp)))
            throw new BadRequestException("avatar_type_invalid", "Only JPG, PNG, and WebP images are supported.");
    }

    private void QueueDeletion(string? publicId)
    {
        if (publicId is null) return;
        db.Set<AvatarDeletion>().Add(new AvatarDeletion
        { DeletionId = Guid.NewGuid(), PublicId = publicId, CreatedAt = clock.UtcNow });
    }

    private void CloseReports(Guid targetUserId, string status, Guid? reviewerId = null)
    {
        foreach (var report in db.Set<AvatarReport>().Where(r => r.TargetUserId == targetUserId && r.Status == "PENDING"))
        {
            report.Status = status;
            report.ReviewedById = reviewerId;
            report.ReviewedAt = clock.UtcNow;
        }
    }

    private async Task FlushDeletionAsync(string? publicId, CancellationToken ct)
    {
        if (publicId is null) return;
        var pending = await db.Set<AvatarDeletion>().SingleOrDefaultAsync(x => x.PublicId == publicId, ct);
        if (pending is null) return;
        try
        {
            await storage.DeleteAsync(publicId, ct);
            db.Set<AvatarDeletion>().Remove(pending);
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            pending.Attempts++;
            pending.LastAttemptAt = clock.UtcNow;
            logger.LogWarning(ex, "Avatar cleanup will retry for {PublicId}", publicId);
        }
        await db.SaveChangesAsync(ct);
    }

    private async Task TryFlushDeletionAsync(string? publicId, CancellationToken ct)
    {
        try { await FlushDeletionAsync(publicId, ct); }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            // The deletion request was committed with the avatar change and the job can retry it.
            logger.LogWarning(ex, "Avatar was updated; cleanup will retry for {PublicId}", publicId);
        }
    }

    private async Task TryDeleteUnreferencedAsync(string publicId, CancellationToken ct)
    {
        try { await storage.DeleteAsync(publicId, ct); }
        catch (Exception ex) when (ex is not OperationCanceledException)
        { logger.LogWarning(ex, "Could not clean unreferenced new avatar {PublicId}", publicId); }
    }
}
