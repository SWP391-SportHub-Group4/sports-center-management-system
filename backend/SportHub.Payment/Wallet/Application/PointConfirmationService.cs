using System.Globalization;
using System.Security.Cryptography;
using Microsoft.EntityFrameworkCore;
using SportHub.BuildingBlocks.Abstractions.Audit;
using SportHub.BuildingBlocks.Abstractions.Notifications;
using SportHub.BuildingBlocks.Abstractions.Configuration;
using SportHub.BuildingBlocks.Abstractions.Identity;
using SportHub.BuildingBlocks.Abstractions.Persistence;
using SportHub.BuildingBlocks.Abstractions.Wallet;
using SportHub.BuildingBlocks.SharedKernel.Errors;
using SportHub.BuildingBlocks.SharedKernel.Time;
using SportHub.Payment.Domain.Entities;
using SportHub.Payment.Wallet.Domain;

namespace SportHub.Payment.Wallet.Application;

/// <summary>Counter OTP proves a member's consent before any points are held.</summary>
public sealed class PointConfirmationService(
    ISportHubDbContext db, IUserAccessReader users, IPointWalletService wallets,
    INotificationWriter notifications, ISystemSettingProvider settings, IAuditWriter audit, IClock clock)
{
    private static readonly TimeSpan ResendCooldown = TimeSpan.FromSeconds(60);

    public async Task<PointConfirmationResponse> RequestAsync(Guid invoiceId, Guid memberId, int points, int revision,
        Guid receptionistId, CancellationToken ct)
    {
        await RequireReceptionistAsync(receptionistId, ct);
        var member = await RequireMemberAsync(memberId, ct);
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        var invoice = await LockInvoiceAsync(invoiceId, ct);
        await ValidateCheckoutAsync(invoice, memberId, ct);
        if (invoice.CheckoutRevision != revision)
            throw new ConflictException("checkout_revision_changed", "Hóa đơn đã thay đổi; hãy tải lại trước khi chọn điểm.");
        ValidatePoints(invoice, points);

        var latest = await db.Set<PointConfirmation>().Where(x => x.InvoiceId == invoiceId)
            .OrderByDescending(x => x.CreatedAtUtc).FirstOrDefaultAsync(ct);
        if (latest is { RevokedAtUtc: null, ConsumedAtUtc: null } && latest.Points == points
            && clock.UtcNow - latest.CreatedAtUtc < ResendCooldown)
            throw new ConflictException("point_confirmation_cooldown", "Hãy đợi 60 giây trước khi gửi lại mã.");

        await ResetSelectionAsync(invoice, receptionistId, ct);
        if (latest is { RevokedAtUtc: null, ConsumedAtUtc: null }) latest.RevokedAtUtc = clock.UtcNow;

        var code = RandomNumberGenerator.GetInt32(0, 1_000_000).ToString("D6", CultureInfo.InvariantCulture);
        var salt = RandomNumberGenerator.GetBytes(16);
        var otpMinutes = await settings.GetIntAsync(SystemSettingKeys.PointsConfirmOtpMinutes, ct);
        if (otpMinutes is < 1 or > 15)
            throw new ConflictException("point_confirmation_setting_invalid", "Thời hạn OTP điểm phải từ 1 đến 15 phút.");
        var expires = Min(clock.UtcNow.AddMinutes(otpMinutes), invoice.HoldExpiresAtUtc!.Value);
        var confirmation = new PointConfirmation
        {
            PointConfirmationId = Guid.NewGuid(), InvoiceId = invoiceId, MemberId = memberId,
            RequestedByUserId = receptionistId, CheckoutCycleId = invoice.CheckoutCycleId!.Value,
            CheckoutRevision = invoice.CheckoutRevision, Points = points,
            CodeSalt = Convert.ToHexString(salt), CodeHash = Hash(code, salt),
            CreatedAtUtc = clock.UtcNow, ExpiresAtUtc = expires
        };
        db.Set<PointConfirmation>().Add(confirmation);
        notifications.QueueEmail(new EmailNotificationRequest(memberId, member.Email,
            NotificationEvents.PointConfirmationOtpRequested, confirmation.PointConfirmationId,
            "Mã xác nhận sử dụng điểm SportHub",
            $"<p>Mã xác nhận sử dụng {points} điểm cho hóa đơn {System.Net.WebUtility.HtmlEncode(invoice.InvoiceNumber)}: <strong>{code}</strong></p>"
            + $"<p>Mã có hiệu lực tối đa {otpMinutes} phút. Không chia sẻ mã ngoài giao dịch tại quầy.</p>"));
        audit.Write(new AuditEntry(receptionistId, "REQUEST_POINT_CONFIRMATION", nameof(Invoice), invoiceId.ToString(),
            NewValue: System.Text.Json.JsonSerializer.Serialize(new { memberId, points, confirmation.PointConfirmationId })));
        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);

        return ToResponse(confirmation, invoice.HoldExpiresAtUtc.Value);
    }

    public async Task<PointSelectionResponse> VerifyAsync(Guid confirmationId, string code, Guid receptionistId, CancellationToken ct)
    {
        await RequireReceptionistAsync(receptionistId, ct);
        var candidate = await db.Set<PointConfirmation>().AsNoTracking()
            .SingleOrDefaultAsync(x => x.PointConfirmationId == confirmationId, ct)
            ?? throw new NotFoundException("point_confirmation_not_found", "Không tìm thấy xác nhận điểm.");
        if (candidate.RequestedByUserId != receptionistId)
            throw new ForbiddenException("point_confirmation_actor_mismatch", "Xác nhận thuộc giao dịch của lễ tân khác.");
        if (candidate.ConsumedAtUtc is not null && !Matches(code, candidate))
            throw new BadRequestException("point_confirmation_invalid", "Mã xác nhận không đúng.");
        if (candidate.ConsumedAtUtc is null)
        {
            ValidateCodeState(candidate);
            if (!Matches(code, candidate))
            {
                var updated = await db.Set<PointConfirmation>().Where(x => x.PointConfirmationId == confirmationId
                        && x.ConsumedAtUtc == null && x.RevokedAtUtc == null && x.ExpiresAtUtc > clock.UtcNow
                        && x.FailedAttempts < 5)
                    .ExecuteUpdateAsync(s => s.SetProperty(x => x.FailedAttempts, x => x.FailedAttempts + 1), ct);
                if (updated == 0) throw new ConflictException("point_confirmation_unavailable", "Mã xác nhận không còn hiệu lực.");
                throw new BadRequestException("point_confirmation_invalid", "Mã xác nhận không đúng.");
            }
        }

        await using var tx = await db.Database.BeginTransactionAsync(ct);
        var invoice = await LockInvoiceAsync(candidate.InvoiceId, ct);
        var confirmation = await db.Set<PointConfirmation>().FromSqlInterpolated($"""
            SELECT * FROM point_confirmations WHERE point_confirmation_id = {confirmationId} FOR UPDATE
            """).SingleAsync(ct);
        if (confirmation.ConsumedAtUtc is not null)
        {
            if (invoice.CheckoutCycleId == confirmation.CheckoutCycleId && invoice.PointsApplied == confirmation.Points)
                return ToSelection(invoice);
            throw new ConflictException("point_confirmation_stale", "Lựa chọn điểm đã thay đổi.");
        }
        ValidateCodeState(confirmation);
        if (!Matches(code, confirmation))
            throw new ConflictException("point_confirmation_changed", "Mã xác nhận đã thay đổi. Hãy thử lại.");
        if (invoice.CheckoutCycleId != confirmation.CheckoutCycleId
            || invoice.CheckoutRevision != confirmation.CheckoutRevision
            || invoice.MemberId != confirmation.MemberId)
            throw new ConflictException("point_confirmation_stale", "Hóa đơn hoặc lựa chọn điểm đã thay đổi.");
        await ValidateCheckoutAsync(invoice, confirmation.MemberId, ct);
        await RequireMemberAsync(confirmation.MemberId, ct);
        ValidatePoints(invoice, confirmation.Points);
        await wallets.HoldAsync(new WalletOperation(confirmation.MemberId, confirmation.Points,
            "CheckoutSession", confirmation.CheckoutCycleId, receptionistId), ct);
        invoice.PointsApplied = confirmation.Points;
        invoice.CashAmount = invoice.TotalAmount - confirmation.Points * (decimal)PointWalletService.VndPerPoint;
        confirmation.ConsumedAtUtc = clock.UtcNow;
        audit.Write(new AuditEntry(receptionistId, "CONFIRM_POINT_SELECTION", nameof(Invoice), invoice.InvoiceId.ToString(),
            NewValue: System.Text.Json.JsonSerializer.Serialize(new { confirmation.Points, invoice.CashAmount })));
        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);
        return ToSelection(invoice);
    }

    public async Task<PointSelectionResponse> SelectSelfAsync(Guid invoiceId, int points, Guid ownerId, CancellationToken ct)
    {
        var owner = await users.GetAsync(ownerId, ct);
        if (owner is null || !owner.IsActive || owner.Role is not ("Member" or "ExternalCoach"))
            throw new ForbiddenException("wallet_owner_invalid", "Tài khoản không được dùng ví.");
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        var invoice = await LockInvoiceAsync(invoiceId, ct);
        await ValidateCheckoutAsync(invoice, ownerId, ct);
        if (points < 0) throw new BadRequestException("invalid_points", "Số điểm không hợp lệ.");
        var pendingCounterCode = await db.Set<PointConfirmation>().AnyAsync(x => x.InvoiceId == invoiceId
            && x.ConsumedAtUtc == null && x.RevokedAtUtc == null, ct);
        if (points == invoice.PointsApplied && !pendingCounterCode) return ToSelection(invoice);
        if (points > 0) ValidatePoints(invoice, points);
        await ResetSelectionAsync(invoice, ownerId, ct);
        if (points > 0)
        {
            await wallets.HoldAsync(new WalletOperation(ownerId, points, "CheckoutSession", invoice.CheckoutCycleId!.Value, ownerId), ct);
            invoice.PointsApplied = points;
            invoice.CashAmount = invoice.TotalAmount - points * (decimal)PointWalletService.VndPerPoint;
        }
        audit.Write(new AuditEntry(ownerId, "SELECT_SELF_POINTS", nameof(Invoice), invoice.InvoiceId.ToString(),
            NewValue: System.Text.Json.JsonSerializer.Serialize(new { points, invoice.CashAmount })));
        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);
        return ToSelection(invoice);
    }

    public async Task<int> ReleaseExpiredAsync(CancellationToken ct)
    {
        var expiredIds = await db.Set<Invoice>().AsNoTracking()
            .Where(x => x.PointsApplied > 0 && (x.Status == InvoiceStatus.Void
                || (x.HoldExpiresAtUtc <= clock.UtcNow && x.Status == InvoiceStatus.Issued)))
            .Select(x => x.InvoiceId).Take(100).ToListAsync(ct);
        var released = 0;
        foreach (var id in expiredIds)
        {
            await using var tx = await db.Database.BeginTransactionAsync(ct);
            var invoice = await LockInvoiceAsync(id, ct);
            if (invoice.PointsApplied > 0 && (invoice.Status == InvoiceStatus.Void
                || (invoice.HoldExpiresAtUtc <= clock.UtcNow && invoice.Status == InvoiceStatus.Issued)))
            {
                await ResetSelectionAsync(invoice, null, ct);
                await db.SaveChangesAsync(ct);
                released++;
            }
            await tx.CommitAsync(ct);
        }
        return released;
    }

    public async Task<PointSelectionResponse> GetSelectionAsync(Guid invoiceId, Guid actorId, CancellationToken ct)
    {
        var actor = await users.GetAsync(actorId, ct);
        if (actor is null || !actor.IsActive || actor.Role is not ("Member" or "ExternalCoach" or "Receptionist"))
            throw new ForbiddenException("point_selection_forbidden", "Không có quyền xem lựa chọn điểm.");
        var invoice = await db.Set<Invoice>().AsNoTracking().SingleOrDefaultAsync(x => x.InvoiceId == invoiceId, ct)
            ?? throw new NotFoundException("invoice_not_found", "Không tìm thấy hóa đơn.");
        if (actor.Role != "Receptionist" && invoice.MemberId != actorId)
            throw new ForbiddenException("invoice_not_owned", "Hóa đơn không thuộc tài khoản của bạn.");
        if (actor.Role == "Receptionist")
        {
            await RequireMemberAsync(invoice.MemberId, ct);
            audit.Write(new AuditEntry(actorId, "VIEW_MEMBER_POINT_SELECTION", nameof(Invoice), invoiceId.ToString()));
            await db.SaveChangesAsync(ct);
        }
        return ToSelection(invoice);
    }

    public async Task<PointSelectionResponse> ClearCounterAsync(Guid invoiceId, Guid memberId, int revision,
        Guid actorId, CancellationToken ct)
    {
        await RequireReceptionistAsync(actorId, ct);
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        var invoice = await LockInvoiceAsync(invoiceId, ct);
        await ValidateCheckoutAsync(invoice, memberId, ct);
        if (invoice.CheckoutRevision != revision)
            throw new ConflictException("checkout_revision_changed", "Hóa đơn đã thay đổi; hãy tải lại trước khi bỏ chọn điểm.");
        await ResetSelectionAsync(invoice, actorId, ct);
        audit.Write(new AuditEntry(actorId, "CLEAR_COUNTER_POINTS", nameof(Invoice), invoiceId.ToString()));
        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);
        return ToSelection(invoice);
    }

    private async Task ResetSelectionAsync(Invoice invoice, Guid? actorId, CancellationToken ct)
    {
        var previousCycle = invoice.CheckoutCycleId;
        if (invoice.PointsApplied > 0)
            await wallets.ReleaseAsync(new WalletOperation(invoice.MemberId, invoice.PointsApplied,
                "CheckoutSession", invoice.CheckoutCycleId!.Value, actorId), ct);
        invoice.PointsApplied = 0;
        invoice.CashAmount = invoice.TotalAmount;
        invoice.CheckoutCycleId = Guid.NewGuid();
        invoice.CheckoutRevision++;
        if (previousCycle is Guid previousId)
        {
            var previous = await db.Set<CheckoutSession>().SingleOrDefaultAsync(
                x => x.CheckoutSessionId == previousId, ct);
            if (previous is not null)
            {
                previous.State = "Superseded";
                db.Set<CheckoutSession>().Add(new CheckoutSession
                {
                    CheckoutSessionId = invoice.CheckoutCycleId.Value, InvoiceId = invoice.InvoiceId,
                    Revision = invoice.CheckoutRevision, Kind = previous.Kind, State = "Active",
                    IdempotencyKey = Guid.NewGuid().ToString("N"), CreatedAtUtc = clock.UtcNow,
                    ExpiresAtUtc = invoice.HoldExpiresAtUtc ?? clock.UtcNow,
                    ResourceHoldId = previous.ResourceHoldId, ClassId = previous.ClassId,
                    PtMemberPackageId = previous.PtMemberPackageId,
                    PtCoachId = previous.PtCoachId, PtFrequency = previous.PtFrequency
                });
            }
        }
        await db.Set<PointConfirmation>().Where(x => x.InvoiceId == invoice.InvoiceId
                && x.ConsumedAtUtc == null && x.RevokedAtUtc == null)
            .ExecuteUpdateAsync(s => s.SetProperty(x => x.RevokedAtUtc, clock.UtcNow), ct);
    }

    private async Task ValidateCheckoutAsync(Invoice invoice, Guid memberId, CancellationToken ct)
    {
        if (invoice.MemberId != memberId)
            throw new ForbiddenException("invoice_not_owned", "Hóa đơn không thuộc tài khoản đã chọn.");
        if (invoice.Status != InvoiceStatus.Issued || invoice.CheckoutCycleId is null
            || invoice.HoldExpiresAtUtc is null || invoice.HoldExpiresAtUtc <= clock.UtcNow)
            throw new ConflictException("checkout_unavailable", "Chu kỳ thanh toán không còn hiệu lực.");
        if (await db.Set<PaymentAttempt>().AnyAsync(x => x.InvoiceId == invoice.InvoiceId, ct)
            || await db.Set<SportHub.Payment.Domain.Entities.Payment>().AnyAsync(x => x.InvoiceId == invoice.InvoiceId, ct)
            || await db.Set<PaymentAdjustment>().AnyAsync(x => x.InvoiceId == invoice.InvoiceId, ct))
            throw new ConflictException("payment_already_started", "Thanh toán đã bắt đầu; không thể đổi số điểm.");
    }

    private static void ValidatePoints(Invoice invoice, int points)
    {
        if (points <= 0 || invoice.TotalAmount <= 0 || points > invoice.TotalAmount / PointWalletService.VndPerPoint)
            throw new BadRequestException("invalid_points", "Số điểm vượt số tiền của hóa đơn.");
    }

    private async Task RequireReceptionistAsync(Guid actorId, CancellationToken ct)
    {
        var actor = await users.GetAsync(actorId, ct);
        if (actor is not { Role: "Receptionist", IsActive: true })
            throw new ForbiddenException("point_confirmation_forbidden", "Chỉ lễ tân được xác nhận điểm tại quầy.");
    }

    private async Task<UserAccessInfo> RequireMemberAsync(Guid memberId, CancellationToken ct)
    {
        var member = await users.GetAsync(memberId, ct);
        if (member is not { Role: "Member", IsActive: true })
            throw new NotFoundException("member_not_found", "Không tìm thấy hội viên đang hoạt động.");
        return member;
    }

    private void ValidateCodeState(PointConfirmation confirmation)
    {
        if (confirmation.RevokedAtUtc is not null || confirmation.ExpiresAtUtc <= clock.UtcNow)
            throw new ConflictException("point_confirmation_expired", "Mã xác nhận đã hết hiệu lực.");
        if (confirmation.FailedAttempts >= 5)
            throw new ConflictException("point_confirmation_locked", "Đã nhập sai mã 5 lần.");
    }

    private static string Hash(string code, byte[] salt)
        => Convert.ToHexString(Rfc2898DeriveBytes.Pbkdf2(code, salt, 100_000, HashAlgorithmName.SHA256, 32));

    private static bool Matches(string code, PointConfirmation confirmation)
        => code.Length == 6 && code.All(char.IsAsciiDigit)
            && CryptographicOperations.FixedTimeEquals(
                Convert.FromHexString(confirmation.CodeHash),
                Convert.FromHexString(Hash(code, Convert.FromHexString(confirmation.CodeSalt))));

    private static DateTime Min(DateTime a, DateTime b) => a < b ? a : b;
    private static PointConfirmationResponse ToResponse(PointConfirmation c, DateTime holdExpires)
        => new(c.PointConfirmationId, c.InvoiceId, c.MemberId, c.Points, c.ExpiresAtUtc, holdExpires, "Pending", c.CheckoutRevision);
    private PointSelectionResponse ToSelection(Invoice invoice)
        => new(invoice.InvoiceId, invoice.MemberId, invoice.PointsApplied, invoice.CashAmount,
            invoice.HoldExpiresAtUtc, invoice.CheckoutCycleId is null ? "Unavailable"
                : invoice.Status == InvoiceStatus.Void ? "Cancelled"
                : invoice.Status == InvoiceStatus.PaidAfterReconciliation ? "Compensated"
                : invoice.HoldExpiresAtUtc <= clock.UtcNow ? "Expired"
                : invoice.PointsApplied > 0 ? "Confirmed" : "Pending", invoice.CheckoutRevision);

    private async Task<Invoice> LockInvoiceAsync(Guid invoiceId, CancellationToken ct)
        => await db.Set<Invoice>().FromSqlInterpolated($"SELECT * FROM invoices WHERE invoice_id = {invoiceId} FOR UPDATE")
               .SingleOrDefaultAsync(ct)
           ?? throw new NotFoundException("invoice_not_found", "Không tìm thấy hóa đơn.");
}
