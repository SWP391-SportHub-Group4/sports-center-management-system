using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using SportHub.Audit.Domain.Entities;
using SportHub.BuildingBlocks.Abstractions.Audit;
using SportHub.BuildingBlocks.Abstractions.Identity;
using SportHub.BuildingBlocks.Abstractions.Persistence;
using SportHub.BuildingBlocks.SharedKernel.Time;
using SportHub.Identity.Domain.Entities;
using SportHub.Identity.Domain.Enums;
using SportHub.Notification.Domain.Enums;
using NotificationRow = SportHub.Notification.Domain.Entities.Notification;

namespace SportHub.Administration.Application.Services;

/// <summary>Hard-deletes expired staff invitations, retaining the creation and expiry audit trails.</summary>
public sealed class StaffInvitationExpiryService(ISportHubDbContext db, IClock clock)
    : IStaffInvitationExpiryReader
{
    public static readonly TimeSpan InvitationLifetime = TimeSpan.FromDays(7);
    public const string ExpiryAction = AccountAuditActions.ExpireUnactivatedStaffAccount;

    private IQueryable<AuditLog> CreationAudit(Guid userId) => db.Set<AuditLog>()
        .Where(a => a.Action == AccountAuditActions.CreateStaffAccount
            && a.TargetEntity == nameof(UserAccount) && a.TargetId == userId.ToString());

    public Task<bool> IsExpiredAsync(Guid userId, DateTime createdAtUtc, DateTime nowUtc,
        CancellationToken ct = default)
        => createdAtUtc > nowUtc - InvitationLifetime
            ? Task.FromResult(false)
            : CreationAudit(userId).AnyAsync(ct);

    public Task<List<Guid>> FindCandidatesAsync(CancellationToken ct = default)
    {
        var cutoff = clock.UtcNow - InvitationLifetime;
        return db.Set<UserAccount>().AsNoTracking()
            .Where(u => u.CreatedAt <= cutoff && u.Role!.RoleName != UserRole.Member
                && (u.Credential == null || u.Credential.PasswordHash == null || u.Credential.PasswordHash == "")
                && !u.ExternalLogins.Any()
                && db.Set<AuditLog>().Any(a => a.Action == AccountAuditActions.CreateStaffAccount
                    && a.TargetEntity == nameof(UserAccount) && a.TargetId == u.UserId.ToString()))
            .OrderBy(u => u.CreatedAt).ThenBy(u => u.UserId)
            .Select(u => u.UserId).ToListAsync(ct);
    }

    public async Task<bool> ExpireAsync(Guid userId, CancellationToken ct = default)
    {
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        // Activation and resend acquire this same lock before touching credentials or OTPs.
        var user = await db.Set<UserAccount>()
            .FromSqlInterpolated($"SELECT * FROM user_accounts WHERE user_id = {userId} FOR UPDATE")
            .AsNoTracking().SingleOrDefaultAsync(ct);
        var now = clock.UtcNow;
        if (user is null || user.CreatedAt > now - InvitationLifetime
            || await db.Set<Role>().AnyAsync(r => r.RoleId == user.RoleId && r.RoleName == UserRole.Member, ct)
            || await db.Set<UserCredential>().AnyAsync(c => c.UserId == userId
                && c.PasswordHash != null && c.PasswordHash != "", ct)
            || await db.Set<UserExternalLogin>().AnyAsync(l => l.UserId == userId, ct))
            return false;

        var creation = await CreationAudit(userId).AsNoTracking().OrderBy(a => a.Timestamp).FirstOrDefaultAsync(ct);
        if (creation is null) return false; // Seed/system accounts are not invitations.

        await db.Set<EmailOtp>().Where(o => o.Email == user.Email).ExecuteDeleteAsync(ct);
        await db.Set<NotificationRow>().Where(n => n.UserId == userId
            || (n.Channel == NotificationChannel.Email
                && n.SourceEventType == NotificationSourceEventType.PasswordResetOtpRequested
                && n.RecipientAddress != null && n.RecipientAddress.ToLower() == user.Email.ToLower()))
            .ExecuteDeleteAsync(ct);
        await db.Set<UserSportSpecialty>().Where(s => s.UserId == userId).ExecuteDeleteAsync(ct);
        await db.Set<CoachServiceQualification>().Where(q => q.UserId == userId).ExecuteDeleteAsync(ct);
        // Profile, credential and coach profile have database ON DELETE CASCADE.
        // Operational references deliberately retain their FK protection: never erase classes/bookings.
        await db.Set<UserAccount>().Where(u => u.UserId == userId).ExecuteDeleteAsync(ct);

        db.Set<AuditLog>().Add(new AuditLog
        {
            AuditId = Guid.NewGuid(), UserId = creation.UserId,
            Action = ExpiryAction, TargetEntity = nameof(UserAccount), TargetId = userId.ToString(),
            Timestamp = now,
            OldValue = JsonSerializer.Serialize(new { email = user.Email, user.CreatedAt, user.RoleId }),
            // Audit's actor FK is required; retain the original inviter and explicitly identify the system executor.
            NewValue = JsonSerializer.Serialize(new
            {
                executedBy = "StaffInvitationExpiryJob", invitedByUserId = creation.UserId,
                expiredAtUtc = user.CreatedAt + InvitationLifetime, emailReleased = true
            })
        });
        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);
        return true;
    }
}
