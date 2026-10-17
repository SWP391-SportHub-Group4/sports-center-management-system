using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using SportHub.Audit.Domain.Entities;
using SportHub.BuildingBlocks.Abstractions.Audit;
using SportHub.BuildingBlocks.Abstractions.Persistence;
using SportHub.BuildingBlocks.SharedKernel.Time;
using SportHub.Identity.Domain.Entities;
using SportHub.Identity.Domain.Enums;
using SportHub.Membership.Domain.Entities;
using SportHub.Notification.Domain.Enums;
using SportHub.Payment.Domain.Entities;
using SportHub.Payment.Wallet.Domain;
using SportHub.Scheduling.Domain.Entities;
using SportHub.Scheduling.Rental.Domain;
using NotificationRow = SportHub.Notification.Domain.Entities.Notification;

namespace SportHub.Administration.Application.Services;

/// <summary>
/// Removes members the front desk registered who never activated their account. After <see cref="PendingLifetime"/> with no password
/// and no Google login, the account leaves the system and its email is free again (the creation audit stays). A member who has
/// already been given anything at the desk (an invoice, enrollment, rental, package or points) is NOT removed: that record belongs
/// to the center, so the account stays and keeps waiting for activation.
/// </summary>
public sealed class MemberInvitationExpiryService(ISportHubDbContext db, IClock clock)
{
    public static readonly TimeSpan PendingLifetime = TimeSpan.FromDays(7);
    public const string ExpiryAction = AccountAuditActions.ExpireUnactivatedMemberAccount;

    /// <summary>Accounts that may be removed at <paramref name="nowUtc"/>; the same predicate is rechecked under lock before deleting.</summary>
    private IQueryable<UserAccount> Expirable(DateTime nowUtc)
    {
        var cutoff = nowUtc - PendingLifetime;
        return db.Set<UserAccount>().Where(u => u.CreatedAt <= cutoff && u.Role!.RoleName == UserRole.Member
            && (u.Credential == null || u.Credential.PasswordHash == null || u.Credential.PasswordHash == "")
            && !u.ExternalLogins.Any()
            && db.Set<AuditLog>().Any(a => a.Action == AccountAuditActions.FrontDeskCreateMember
                && a.TargetEntity == nameof(UserAccount) && a.TargetId == u.UserId.ToString())
            && !db.Set<Invoice>().Any(i => i.MemberId == u.UserId)
            && !db.Set<Enrollment>().Any(e => e.MemberId == u.UserId)
            && !db.Set<CourtRental>().Any(r => r.MemberId == u.UserId)
            && !db.Set<MemberPackage>().Any(p => p.MemberId == u.UserId)
            && !db.Set<PointLedgerEntry>().Any(e => db.Set<PointWallet>()
                .Any(w => w.WalletId == e.WalletId && w.OwnerUserId == u.UserId)));
    }

    public Task<List<Guid>> FindCandidatesAsync(CancellationToken ct = default)
        => Expirable(clock.UtcNow).AsNoTracking().OrderBy(u => u.CreatedAt).ThenBy(u => u.UserId)
            .Select(u => u.UserId).Take(200).ToListAsync(ct);

    public async Task<bool> ExpireAsync(Guid userId, CancellationToken ct = default)
    {
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        // Activation and resend take this same lock before touching credentials or OTPs.
        var user = await db.Set<UserAccount>()
            .FromSqlInterpolated($"SELECT * FROM user_accounts WHERE user_id = {userId} FOR UPDATE")
            .AsNoTracking().SingleOrDefaultAsync(ct);
        var now = clock.UtcNow;
        if (user is null || !await Expirable(now).AnyAsync(u => u.UserId == userId, ct)) return false;

        var creation = await db.Set<AuditLog>().AsNoTracking()
            .Where(a => a.Action == AccountAuditActions.FrontDeskCreateMember && a.TargetEntity == nameof(UserAccount)
                && a.TargetId == userId.ToString())
            .OrderBy(a => a.Timestamp).FirstOrDefaultAsync(ct);
        if (creation is null) return false;

        await db.Set<EmailOtp>().Where(o => o.Email == user.Email).ExecuteDeleteAsync(ct);
        await db.Set<NotificationRow>().Where(n => n.UserId == userId
            || (n.Channel == NotificationChannel.Email
                && n.SourceEventType == NotificationSourceEventType.PasswordResetOtpRequested
                && n.RecipientAddress != null && n.RecipientAddress.ToLower() == user.Email.ToLower()))
            .ExecuteDeleteAsync(ct);
        // The empty wallet created at registration (no ledger entries, checked above).
        await db.Set<PointWallet>().Where(w => w.OwnerUserId == userId).ExecuteDeleteAsync(ct);
        // Profile and credential rows are removed by ON DELETE CASCADE; operational records were excluded above.
        await db.Set<UserAccount>().Where(u => u.UserId == userId).ExecuteDeleteAsync(ct);

        db.Set<AuditLog>().Add(new AuditLog
        {
            AuditId = Guid.NewGuid(), UserId = creation.UserId, ActorRole = "SYSTEM",
            Action = ExpiryAction, TargetEntity = nameof(UserAccount), TargetId = userId.ToString(), Timestamp = now,
            OldValue = JsonSerializer.Serialize(new { email = user.Email, user.CreatedAt, user.RoleId }),
            // The audit actor column is required; keep the registering staff member and name the system executor.
            NewValue = JsonSerializer.Serialize(new
            {
                executedBy = "MemberInvitationExpiryJob", registeredByUserId = creation.UserId,
                expiredAtUtc = user.CreatedAt + PendingLifetime, emailReleased = true
            })
        });
        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);
        return true;
    }
}
