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

public sealed class AvatarService(ISportHubDbContext db, IAvatarStorage storage, IAuditWriter audit,
    IClock clock, ILogger<AvatarService> logger, AvatarAuditImageService auditImages)
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
            var before = await auditImages.CaptureExistingAsync(userId, old, user.Profile.AvatarUrl, ct);
            var after = auditImages.Record(userId, uploaded.PublicId, bytes, contentType);
            user.Profile.AvatarUrl = uploaded.Url;
            user.Profile.AvatarPublicId = uploaded.PublicId;
            user.Profile.AvatarVersion++;
            QueueDeletion(old);
            audit.Write(new AuditEntry(userId, "UPDATE_AVATAR", nameof(UserProfile), userId.ToString(), OldValue: before, NewValue: after));
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
        var before = await auditImages.CaptureExistingAsync(userId, old, user.Profile.AvatarUrl, ct);
        user.Profile.AvatarUrl = null;
        user.Profile.AvatarPublicId = null;
        user.Profile.AvatarVersion++;
        QueueDeletion(old);
        audit.Write(new AuditEntry(userId, "DELETE_AVATAR", nameof(UserProfile), userId.ToString(), OldValue: before));
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
        var importedSnapshot = await auditImages.CaptureExistingAsync(userId, imported.PublicId, imported.Url, ct);
        audit.Write(new AuditEntry(userId, "IMPORT_GOOGLE_AVATAR", nameof(UserProfile), userId.ToString(), NewValue: importedSnapshot));
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
            && (u.Role.RoleName == UserRole.Member || u.Role.RoleName == UserRole.Coach
                || u.Role.RoleName == UserRole.CenterManager || u.Role.RoleName == UserRole.SystemAdministrator))
            .Select(u => new { Role = u.Role!.RoleName, AvatarUrl = u.Profile != null ? u.Profile.AvatarUrl : null })
            .SingleOrDefaultAsync(ct)
            ?? throw new NotFoundException("avatar_owner_not_found", "User not found.");
        if (anonymous && row.Role != UserRole.Coach)
            throw new ForbiddenException("avatar_not_public", "This profile photo is visible only to signed-in users.");
        return new AvatarResponse(targetUserId, row.AvatarUrl);
    }

    public async Task<AvatarResponse> ManagerDeleteMemberAsync(Guid managerId, Guid memberId, CancellationToken ct, bool allowCoach = false)
    {
        var member = await db.Set<UserAccount>().Include(u => u.Role).Include(u => u.Profile)
            .SingleOrDefaultAsync(u => u.UserId == memberId, ct)
            ?? throw new NotFoundException("user_not_found", "Account not found.");
        if (member.Role?.RoleName != UserRole.Member && !(allowCoach && member.Role?.RoleName == UserRole.Coach))
            throw new ForbiddenException("avatar_target_not_member", "Only member photos can be removed here.");
        if (member.Profile?.AvatarUrl is null) return new AvatarResponse(memberId, null);
        var old = member.Profile.AvatarPublicId;
        var before = await auditImages.CaptureExistingAsync(memberId, old, member.Profile.AvatarUrl, ct);
        member.Profile.AvatarUrl = null;
        member.Profile.AvatarPublicId = null;
        member.Profile.AvatarVersion++;
        QueueDeletion(old);
        foreach (var report in await db.Set<AvatarReport>().Where(r => r.TargetUserId == memberId && r.Status == "OPEN").ToListAsync(ct))
        {
            report.Status = "REMOVED";
            report.ReviewedByUserId = managerId; report.ReviewedAtUtc = clock.UtcNow;
        }
        audit.Write(new AuditEntry(managerId, "MANAGER_REMOVE_MEMBER_AVATAR", nameof(UserProfile), memberId.ToString(), OldValue: before));
        try { await db.SaveChangesAsync(ct); }
        catch (DbUpdateConcurrencyException)
        { throw new ConflictException("avatar_changed", "The avatar has changed. Please reload the member."); }
        await TryFlushDeletionAsync(old, ct);
        return new AvatarResponse(memberId, null);
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
        if (user.Role?.RoleName is not (UserRole.Member or UserRole.Coach or UserRole.CenterManager or UserRole.SystemAdministrator))
            throw new ForbiddenException("avatar_role_forbidden", "Only members, coaches, center managers and administrators can change their own avatars.");
        if (user.Status != UserStatus.Active)
            throw new ForbiddenException("avatar_account_inactive", "This account is deactivated.");
        return user;
    }

    internal static void ValidateImage(byte[] bytes, string contentType)
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
