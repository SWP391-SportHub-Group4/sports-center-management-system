using Microsoft.EntityFrameworkCore;
using Npgsql;
using SportHub.BuildingBlocks.Abstractions.Audit;
using SportHub.BuildingBlocks.Abstractions.Identity;
using SportHub.BuildingBlocks.Abstractions.Persistence;
using SportHub.BuildingBlocks.SharedKernel.Errors;
using SportHub.BuildingBlocks.SharedKernel.Time;
using SportHub.Identity.Domain.Entities;
using SportHub.Identity.Domain.Enums;
using SportHub.Membership.Domain.Entities;
using SportHub.Membership.Domain.Enums;
using SportHub.Training.Application.Commands;
using SportHub.Training.Application.Interfaces;
using SportHub.Training.Domain.Rules;

namespace SportHub.Training.Application.Services;

/// <summary>
/// Cài đặt <see cref="IPtEntitlementLifecycle"/> — xem docs/backend-be4-pt-training-implementation-plan.md
/// §9. Không tạo Invoice/InvoiceItem, không tính giá — đó là việc của Payment.
/// </summary>
public sealed class PtEntitlementLifecycleService(
    ISportHubDbContext db,
    IAuditWriter audit,
    ICoachSpecialtyReader specialties,
    IClock clock) : IPtEntitlementLifecycle
{
    public async Task<Guid> CreatePendingAsync(
        CreatePendingPtEntitlementCommand command, CancellationToken ct = default)
    {
        var member = await db.Set<UserAccount>()
            .Include(u => u.Role)
            .SingleOrDefaultAsync(u => u.UserId == command.MemberId, ct)
            ?? throw new NotFoundException("member_not_found", "Không tìm thấy hội viên.");

        if (member.Role?.RoleName != UserRole.Member)
        {
            throw new BadRequestException("member_not_found", "Tài khoản không có vai trò Member.");
        }

        if (!await specialties.IsPersonalTrainerAsync(command.CoachId, ct))
        {
            throw new BadRequestException(
                "coach_must_be_personal_trainer",
                "Chỉ Coach có chuyên môn huấn luyện cá nhân (PT 1-1) mới nhận được PtEntitlement (BR-99).");
        }

        var originPackage = await db.Set<MemberPackage>()
            .SingleOrDefaultAsync(
                p => p.MemberPackageId == command.OriginMemberPackageId && p.MemberId == command.MemberId, ct)
            ?? throw new NotFoundException(
                "pt_entitlement_not_found", "Không tìm thấy Membership gốc của hội viên này.");

        if (originPackage.Status != MemberPackageStatus.Active)
        {
            throw new ConflictException(
                "pt_entitlement_not_active",
                "Membership gốc phải đang Active mới checkout PT (BR-70).");
        }

        var totalQuota = PtEntitlementRules.ComputeTotalQuota(
            command.FrequencyPerWeek, originPackage.StartDate, originPackage.EndDate);

        var entitlement = new PtEntitlement
        {
            EntitlementId = Guid.NewGuid(),
            MemberId = command.MemberId,
            CoachId = command.CoachId,
            OriginMemberPackageId = originPackage.MemberPackageId,
            CurrentMemberPackageId = originPackage.MemberPackageId,
            FrequencyPerWeek = command.FrequencyPerWeek,
            TotalQuota = totalQuota,
            ReservedSessions = 0,
            ConsumedSessions = 0,
            ValidityStartDate = originPackage.StartDate,
            ValidityEndDate = originPackage.EndDate,
            CarryOverUntilDate = originPackage.EndDate.AddDays(30),
            Status = PtEntitlementStatus.PendingPayment,
            Version = 0
        };

        db.Set<PtEntitlement>().Add(entitlement);

        audit.Write(new AuditEntry(
            command.MemberId, "CREATE_PT_ENTITLEMENT", nameof(PtEntitlement), entitlement.EntitlementId.ToString(),
            NewValue: $"{{\"coachId\":\"{command.CoachId}\",\"totalQuota\":{totalQuota}}}"));

        await db.SaveChangesAsync(ct);

        return entitlement.EntitlementId;
    }

    public async Task ActivateAsync(Guid entitlementId, Guid activationReference, CancellationToken ct = default)
    {
        var ownsTransaction = db.Database.CurrentTransaction is null;
        await using var transaction = ownsTransaction
            ? await db.Database.BeginTransactionAsync(ct)
            : null;

        var entitlement = await LockAsync(entitlementId, ct);

        // Idempotent: activate lần hai với cùng reference không được ném lỗi.
        if (entitlement.Status == PtEntitlementStatus.Active
            && entitlement.ActivationReference == activationReference)
        {
            return;
        }

        if (entitlement.Status != PtEntitlementStatus.PendingPayment)
        {
            throw new ConflictException(
                "pt_entitlement_invalid_state",
                $"Entitlement đang ở trạng thái {entitlement.Status}, không thể activate.");
        }

        var currentPackage = await db.Set<MemberPackage>()
            .SingleAsync(p => p.MemberPackageId == entitlement.CurrentMemberPackageId, ct);

        if (currentPackage.Status != MemberPackageStatus.Active)
        {
            throw new ConflictException(
                "pt_entitlement_not_active",
                "Membership liên kết không còn Active — không kích hoạt được PtEntitlement.");
        }

        entitlement.ActivationReference = activationReference;
        entitlement.Status = PtEntitlementStatus.Active;
        entitlement.ActivatedAt = clock.UtcNow;
        entitlement.Version += 1;

        audit.Write(new AuditEntry(
            entitlement.MemberId, "ACTIVATE_PT_ENTITLEMENT", nameof(PtEntitlement), entitlementId.ToString(),
            NewValue: $"{{\"activationReference\":\"{activationReference}\"}}"));

        try
        {
            await db.SaveChangesAsync(ct);
        }
        catch (DbUpdateException ex)
            when (ex.InnerException is PostgresException { SqlState: PostgresErrorCodes.UniqueViolation })
        {
            // Unique(ActivationReference) bắt được ca gọi hai lần đồng thời với 2 reference khác
            // nhau cho cùng entitlement — theo hợp đồng, mỗi entitlement chỉ activate một lần.
            throw new ConflictException(
                "pt_entitlement_invalid_state", "Entitlement đã được activate bằng reference khác.");
        }

        if (transaction is not null)
        {
            await transaction.CommitAsync(ct);
        }
    }

    public async Task CancelAsync(Guid entitlementId, string reason, CancellationToken ct = default)
    {
        var ownsTransaction = db.Database.CurrentTransaction is null;
        await using var transaction = ownsTransaction
            ? await db.Database.BeginTransactionAsync(ct)
            : null;

        var entitlement = await LockAsync(entitlementId, ct);

        if (entitlement.Status == PtEntitlementStatus.Cancelled)
        {
            return;
        }

        entitlement.Status = PtEntitlementStatus.Cancelled;
        entitlement.CancelledAt = clock.UtcNow;
        entitlement.Version += 1;

        audit.Write(new AuditEntry(
            entitlement.MemberId, "CANCEL_PT_ENTITLEMENT", nameof(PtEntitlement), entitlementId.ToString(),
            NewValue: "{\"status\":\"Cancelled\"}"));

        await db.SaveChangesAsync(ct);

        if (transaction is not null)
        {
            await transaction.CommitAsync(ct);
        }
    }

    public async Task CarryOverAsync(Guid entitlementId, Guid renewedMemberPackageId, CancellationToken ct = default)
    {
        var ownsTransaction = db.Database.CurrentTransaction is null;
        await using var transaction = ownsTransaction
            ? await db.Database.BeginTransactionAsync(ct)
            : null;

        var entitlement = await LockAsync(entitlementId, ct);

        if (entitlement.Status != PtEntitlementStatus.AwaitingCarryOver)
        {
            throw new ConflictException(
                "pt_entitlement_invalid_state",
                $"Entitlement đang ở trạng thái {entitlement.Status}, không carry-over được.");
        }

        var renewedPackage = await db.Set<MemberPackage>()
            .SingleOrDefaultAsync(p => p.MemberPackageId == renewedMemberPackageId, ct)
            ?? throw new NotFoundException("pt_entitlement_not_found", "Không tìm thấy Membership gia hạn.");

        entitlement.CurrentMemberPackageId = renewedPackage.MemberPackageId;
        entitlement.ValidityEndDate = renewedPackage.EndDate;
        entitlement.CarryOverUntilDate = renewedPackage.EndDate.AddDays(30);

        var remainingQuota = entitlement.TotalQuota - entitlement.ReservedSessions - entitlement.ConsumedSessions;
        entitlement.Status = remainingQuota > 0 ? PtEntitlementStatus.Active : PtEntitlementStatus.Exhausted;
        entitlement.Version += 1;

        audit.Write(new AuditEntry(
            entitlement.MemberId, "CARRY_OVER_PT_ENTITLEMENT", nameof(PtEntitlement), entitlementId.ToString(),
            NewValue: $"{{\"renewedMemberPackageId\":\"{renewedMemberPackageId}\","
                      + $"\"newValidityEndDate\":\"{renewedPackage.EndDate}\"}}"));

        await db.SaveChangesAsync(ct);

        if (transaction is not null)
        {
            await transaction.CommitAsync(ct);
        }
    }

    private async Task<PtEntitlement> LockAsync(Guid entitlementId, CancellationToken ct)
    {
        var locked = await db.Set<PtEntitlement>()
            .FromSqlInterpolated($"SELECT * FROM pt_entitlements WHERE entitlement_id = {entitlementId} FOR UPDATE")
            .ToListAsync(ct);

        return locked.SingleOrDefault()
            ?? throw new NotFoundException("pt_entitlement_not_found", "Không tìm thấy quyền lợi PT.");
    }
}
