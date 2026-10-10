using System.Security.Cryptography;
using System.Text;
using Microsoft.EntityFrameworkCore;
using SportHub.BuildingBlocks.Abstractions.Audit;
using SportHub.BuildingBlocks.Abstractions.Payment;
using SportHub.BuildingBlocks.Abstractions.Configuration;
using SportHub.BuildingBlocks.Abstractions.Persistence;
using SportHub.BuildingBlocks.Abstractions.Scheduling;
using SportHub.BuildingBlocks.SharedKernel.Errors;
using SportHub.BuildingBlocks.SharedKernel.Time;
using SportHub.Scheduling.Domain.Entities;
using SportHub.Scheduling.Domain.Enums;
using SportHub.Scheduling.Application.Services;
using SportHub.Scheduling.Threshold.Domain;

namespace SportHub.Scheduling.Threshold.Application;

/// <summary>Authenticated owner response to a per-enrollment threshold link; selecting the same choice is idempotent.</summary>
public sealed class ThresholdResponseService(ISportHubDbContext db, IClassEnrollmentFulfillment classes,
    IRefundCreditService refunds, IInvoiceDraftWriter invoiceDrafts, ISystemSettingProvider settings,
    ICheckoutLifecycleService checkoutLifecycle, IAuditWriter audit, IClock clock)
{
    public async Task<ThresholdResponseView> GetAsync(Guid? id, string? token, Guid memberId, CancellationToken ct)
    {
        var query = db.Set<ThresholdResponse>().AsNoTracking().Where(x => x.MemberId == memberId);
        if (id.HasValue) query = query.Where(x => x.ThresholdResponseId == id);
        else
        {
            if (string.IsNullOrWhiteSpace(token) || token.Length > 128) throw new BadRequestException("invalid_threshold_response", "Liên kết không hợp lệ.");
            var hash = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(token)));
            query = query.Where(x => x.TokenHash == hash);
        }
        var response = await query.SingleOrDefaultAsync(ct) ?? throw new NotFoundException("threshold_response_not_found", "Không tìm thấy phản hồi.");
        var course = await db.Set<Class>().AsNoTracking().SingleAsync(x => x.ClassId == response.ClassId, ct);
        var itemId = await db.Set<Enrollment>().Where(e => e.EnrollmentId == response.EnrollmentId).Select(e => e.InvoiceItemId).SingleAsync(ct);
        var remaining = itemId.HasValue ? await refunds.GetRemainingItemValueVndAsync(itemId.Value, ct) : 0;
        return new(response.ThresholdResponseId, course.ClassId, course.Name, course.SportId, remaining,
            response.DeadlineUtc, response.Choice?.ToString(), response.TargetClassId, response.ResolutionStatus.ToString(), response.AdditionalInvoiceId, clock.UtcNow);
    }

    public async Task<object> QuoteTransferAsync(Guid id, int targetClassId, Guid memberId, CancellationToken ct)
    {
        var source = await GetAsync(id, null, memberId, ct);
        if (source.Choice is not null || source.DeadlineUtc <= clock.UtcNow)
            throw new ConflictException("threshold_response_closed", "Phản hồi đã đóng.");
        if (targetClassId == source.ClassId) throw new BadRequestException("transfer_same_class", "Khóa đích phải khác.");
        var target = await GetTargetQuoteAsync(targetClassId, ct);
        if (target.SportId != source.SportId) throw new ConflictException("transfer_sport_mismatch", "Khóa đích phải cùng môn.");
        var difference = target.Price - source.PaidValueVnd;
        if (difference % 1000 != 0) throw new ConflictException("transfer_value_not_point_divisible", "Chênh lệch không đổi chính xác sang điểm.");
        return new { targetClassId, targetPrice = target.Price, sourceValue = source.PaidValueVnd,
            cashDifference = Math.Max(0, difference), walletCreditPoints = difference < 0 ? (int)(-difference / 1000) : 0 };
    }

    public async Task<IReadOnlyList<ThresholdResponseView>> MineAsync(Guid memberId, CancellationToken ct)
    {
        var ids = await db.Set<ThresholdResponse>().Where(x => x.MemberId == memberId).OrderByDescending(x => x.CreatedAtUtc).Take(100).Select(x => x.ThresholdResponseId).ToListAsync(ct);
        var result = new List<ThresholdResponseView>();
        foreach (var id in ids) result.Add(await GetAsync(id, null, memberId, ct));
        return result;
    }

    public async Task<ThresholdResponseResult> RespondByIdAsync(Guid id, ThresholdResponseChoice choice, int? targetClassId, Guid memberId, CancellationToken ct)
    {
        var hash = await db.Set<ThresholdResponse>().Where(x => x.ThresholdResponseId == id && x.MemberId == memberId).Select(x => x.TokenHash).SingleOrDefaultAsync(ct)
            ?? throw new NotFoundException("threshold_response_not_found", "Không tìm thấy phản hồi.");
        return await RespondHashedAsync(hash, choice, targetClassId, memberId, ct);
    }

    public async Task<ThresholdResponseResult> RespondAsync(string token, ThresholdResponseChoice choice,
        int? targetClassId, Guid memberId, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(token) || token.Length > 128 || !Enum.IsDefined(choice))
            throw new BadRequestException("invalid_threshold_response", "Liên kết hoặc lựa chọn phản hồi không hợp lệ.");
        if (choice == ThresholdResponseChoice.Transfer && targetClassId is null)
            throw new BadRequestException("target_class_required", "Cần chọn khóa đích khi chuyển lớp.");
        if (choice != ThresholdResponseChoice.Transfer && targetClassId is not null)
            throw new BadRequestException("target_class_unexpected", "Không gửi khóa đích khi chọn hoàn điểm.");

        var tokenHash = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(token)));
        return await RespondHashedAsync(tokenHash, choice, targetClassId, memberId, ct);
    }

    private async Task<ThresholdResponseResult> RespondHashedAsync(string tokenHash, ThresholdResponseChoice choice, int? targetClassId, Guid memberId, CancellationToken ct)
    {
        if (!Enum.IsDefined(choice)) throw new BadRequestException("invalid_threshold_response", "Lựa chọn không hợp lệ.");
        if (choice == ThresholdResponseChoice.Transfer && targetClassId is null) throw new BadRequestException("target_class_required", "Cần khóa đích.");
        if (choice != ThresholdResponseChoice.Transfer && targetClassId is not null) throw new BadRequestException("target_class_unexpected", "Không gửi khóa đích.");
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        var rows = await db.Set<ThresholdResponse>().FromSqlInterpolated($"""
            SELECT * FROM class_threshold_responses WHERE token_hash = {tokenHash} FOR UPDATE
            """).ToListAsync(ct);
        var response = rows.SingleOrDefault() ?? throw new NotFoundException("threshold_response_not_found", "Liên kết phản hồi không hợp lệ.");
        if (response.MemberId != memberId)
            throw new ForbiddenException("threshold_response_not_owned", "Liên kết này không thuộc tài khoản của bạn.");
        if (response.Choice is not null)
        {
            if (response.Choice != choice || response.TargetClassId != targetClassId)
                throw new ConflictException("threshold_response_already_submitted", "Lựa chọn đã gửi là cuối cùng và không thể đổi.");
            if (response.ResolutionStatus == ThresholdResolutionStatus.AwaitingPayment
                && response.AdditionalInvoiceId is Guid priorInvoiceId)
            {
                var priorState = await checkoutLifecycle.GetStateAsync(priorInvoiceId, ct);
                if (priorState.InvoiceStatus == "Issued" && priorState.ExpiresAtUtc > clock.UtcNow)
                {
                    await tx.CommitAsync(ct);
                    return ToResult(response);
                }
                if (response.DeadlineUtc <= clock.UtcNow)
                    throw new ConflictException("threshold_response_expired", "Hạn chuyển lớp đã qua.");
                if (priorState.InvoiceStatus == "Issued")
                    await checkoutLifecycle.ReleaseForSystemAsync(priorInvoiceId, "Expired", ct);
                if (priorState.InvoiceStatus is not ("Void" or "Issued"))
                    throw new ConflictException("transfer_payment_reconciliation_pending",
                        "Checkout cũ đã nhận thanh toán hoặc cần đối soát; chưa thể tạo invoice mới.");
                var source = await db.Set<Enrollment>().SingleOrDefaultAsync(x => x.EnrollmentId == response.EnrollmentId
                    && x.MemberId == memberId && x.Status == EnrollmentStatus.Confirmed, ct)
                    ?? throw new ConflictException("threshold_enrollment_inactive", "Ghi danh không còn hiệu lực.");
                var rootItemId = source.InvoiceItemId
                    ?? throw new ConflictException("threshold_invoice_item_missing", "Ghi danh thiếu hóa đơn đã thanh toán.");
                await refunds.LockPaidItemAsync(rootItemId, ct);
                var invoiceId = await CreateTransferCheckoutAsync(response, source, rootItemId,
                    response.TargetClassId!.Value, memberId, ct);
                response.AdditionalInvoiceId = invoiceId;
                response.ResolutionStatus = ThresholdResolutionStatus.AwaitingPayment;
                await db.SaveChangesAsync(ct);
                await tx.CommitAsync(ct);
                return ToResult(response);
            }
            await tx.CommitAsync(ct);
            return ToResult(response);
        }
        if (response.ResolutionStatus != ThresholdResolutionStatus.Pending || response.DeadlineUtc <= clock.UtcNow)
            throw new ConflictException("threshold_response_expired", "Hạn phản hồi đã qua.");

        var enrollment = await db.Set<Enrollment>().SingleOrDefaultAsync(x => x.EnrollmentId == response.EnrollmentId
            && x.MemberId == memberId && x.Status == EnrollmentStatus.Confirmed, ct)
            ?? throw new ConflictException("threshold_enrollment_inactive", "Ghi danh không còn hiệu lực.");
        var itemId = enrollment.InvoiceItemId
            ?? throw new ConflictException("threshold_invoice_item_missing", "Ghi danh thiếu hóa đơn đã thanh toán.");

        Guid? additionalInvoiceId = null;
        if (choice is ThresholdResponseChoice.Refund or ThresholdResponseChoice.WaitNextCourse)
        {
            var refund = await refunds.CreditAsync(new RefundCreditRequest(itemId, 100,
                "Hoàn điểm theo lựa chọn khi khóa chưa đạt ngưỡng hoàn vốn", response.ThresholdResponseId), ct);
            await classes.CancelAsync(itemId, EnrollmentEndReason.Refunded, ct);
            if (choice == ThresholdResponseChoice.WaitNextCourse)
            {
                var sportId = await db.Set<Class>().Where(x => x.ClassId == response.ClassId)
                    .Select(x => x.SportId).SingleAsync(ct);
                db.Set<CourseInterestSubscription>().Add(new CourseInterestSubscription
                {
                    SubscriptionId = Guid.NewGuid(), ThresholdResponseId = response.ThresholdResponseId,
                    MemberId = memberId, SourceClassId = response.ClassId, SportId = sportId,
                    RefundedPoints = refund.PointsCredited, IsActive = true, CreatedAtUtc = clock.UtcNow
                });
            }
        }
        else
        {
            additionalInvoiceId = await TransferAsync(response, enrollment, itemId, targetClassId!.Value, memberId, ct);
        }

        response.Choice = choice;
        response.TargetClassId = targetClassId;
        response.AdditionalInvoiceId = additionalInvoiceId;
        response.ResolutionStatus = additionalInvoiceId is null
            ? ThresholdResolutionStatus.Completed : ThresholdResolutionStatus.AwaitingPayment;
        response.RespondedAtUtc = clock.UtcNow;
        if (additionalInvoiceId is null) response.ResolvedAtUtc = clock.UtcNow;
        audit.Write(new AuditEntry(memberId, "RESPOND_CLASS_THRESHOLD", nameof(ThresholdResponse),
            response.ThresholdResponseId.ToString(), NewValue: System.Text.Json.JsonSerializer.Serialize(new
            {
                choice = choice.ToString(), targetClassId, response.ResolutionStatus
            })));
        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);
        return ToResult(response);
    }

    private async Task<Guid?> TransferAsync(ThresholdResponse response, Enrollment source, Guid itemId,
        int targetClassId, Guid memberId, CancellationToken ct)
    {
        if (targetClassId == response.ClassId)
            throw new BadRequestException("transfer_same_class", "Khóa đích phải khác khóa hiện tại.");
        var sourceClass = await db.Set<Class>().AsNoTracking().SingleAsync(x => x.ClassId == source.ClassId, ct);
        var targetQuote = await GetTargetQuoteAsync(targetClassId, ct);
        if (targetQuote.SportId != sourceClass.SportId)
            throw new ConflictException("transfer_sport_mismatch", "Khóa đích phải cùng môn với khóa hiện tại.");
        // Lock the paid item before class rows, matching manager refund order (invoice → item → wallet → class).
        // If later seat or schedule checks fail, the whole transfer and any difference credit roll back.
        await refunds.LockPaidItemAsync(itemId, ct);
        var sourceValue = await refunds.GetRemainingItemValueVndAsync(itemId, ct);
        if (targetQuote.Price > sourceValue)
            return await CreateTransferCheckoutAsync(response, source, itemId, targetClassId, memberId, ct, targetQuote);
        var difference = sourceValue - targetQuote.Price;
        if (difference > 0)
        {
            if (difference % 1_000 != 0)
                throw new ConflictException("transfer_value_not_point_divisible", "Phần chênh lệch không đổi chính xác sang điểm.");
            await refunds.CreditDifferenceAsync(new RefundCreditDifferenceRequest(itemId,
                checked((int)(difference / 1_000)), "Hoàn chênh lệch khi chuyển sang khóa rẻ hơn",
                response.ThresholdResponseId), ct);
        }

        await db.Database.ExecuteSqlInterpolatedAsync($"SELECT user_id FROM user_accounts WHERE user_id = {memberId} FOR UPDATE", ct);
        await CourseScheduleLock.AcquireAsync(db, changingSchedule: false, ct);
        foreach (var classId in new[] { response.ClassId, targetClassId }.Order())
            await db.Database.ExecuteSqlInterpolatedAsync($"SELECT class_id FROM classes WHERE class_id = {classId} FOR UPDATE", ct);

        if (await db.Set<Enrollment>().AnyAsync(x => x.EnrollmentId == source.EnrollmentId
            && x.Status != EnrollmentStatus.Confirmed, ct))
            throw new ConflictException("transfer_source_inactive", "Ghi danh nguồn không còn hiệu lực.");

        // The target hold and source release join this transaction; failure keeps the original enrollment active.
        var hold = await classes.ReserveAsync(targetClassId, memberId, null,
            clock.UtcNow.AddMinutes(2), ct, source.EnrollmentId);
        await classes.CancelAsync(itemId, EnrollmentEndReason.TransferredOut, ct);
        await classes.ConfirmAsync(hold.SeatHoldId, itemId, ct,
            source.EnrollmentId, source.TransferDifferenceInvoiceItemId);
        return null;
    }

    private async Task<Guid> CreateTransferCheckoutAsync(ThresholdResponse response, Enrollment source,
        Guid rootItemId, int targetClassId, Guid memberId, CancellationToken ct, ClassQuote? knownQuote = null)
    {
        var sourceClass = await db.Set<Class>().AsNoTracking().SingleAsync(x => x.ClassId == source.ClassId, ct);
        var targetQuote = knownQuote ?? await GetTargetQuoteAsync(targetClassId, ct);
        if (targetQuote.SportId != sourceClass.SportId)
            throw new ConflictException("transfer_sport_mismatch", "Khóa đích phải cùng môn với khóa hiện tại.");
        var sourceValue = await refunds.GetRemainingItemValueVndAsync(rootItemId, ct);
        var difference = targetQuote.Price - sourceValue;
        if (difference <= 0 || difference % 1_000 != 0)
            throw new ConflictException("transfer_difference_invalid", "Phần chênh lệch phải dương và đổi được chính xác sang điểm.");
        var holdMinutes = await settings.GetIntAsync(SystemSettingKeys.HoldMinutes, ct);
        if (holdMinutes is < 1 or > 1440)
            throw new ConflictException("hold_setting_invalid", "Thời hạn checkout không hợp lệ.");
        var expires = clock.UtcNow.AddMinutes(holdMinutes);
        var responseDeadline = response.DeadlineUtc;
        if (expires > responseDeadline) expires = responseDeadline;
        var beforeStart = targetQuote.FirstSessionUtc.UtcDateTime.AddSeconds(-1);
        if (expires > beforeStart) expires = beforeStart;
        if (expires <= clock.UtcNow)
            throw new ConflictException("transfer_checkout_window_closed", "Không đủ thời gian thanh toán trước buổi đầu hoặc hết hạn phản hồi.");
        var expiresOffset = new DateTimeOffset(DateTime.SpecifyKind(expires, DateTimeKind.Utc));
        await db.Database.ExecuteSqlInterpolatedAsync(
            $"SELECT user_id FROM user_accounts WHERE user_id = {memberId} FOR UPDATE", ct);
        await CourseScheduleLock.AcquireAsync(db, changingSchedule: false, ct);
        foreach (var classId in new[] { response.ClassId, targetClassId }.Order())
            await db.Database.ExecuteSqlInterpolatedAsync($"SELECT class_id FROM classes WHERE class_id = {classId} FOR UPDATE", ct);
        var hold = await classes.ReserveAsync(targetClassId, memberId, null, expiresOffset, ct, source.EnrollmentId);
        var draft = await invoiceDrafts.CreateAsync(new InvoiceDraft(memberId, memberId,
            [new InvoiceDraftItem("ClassTransferDifference", $"Chênh lệch chuyển sang khóa {targetQuote.ClassId}",
                difference, targetQuote.SportId, targetQuote.ClassId, SourceEnrollmentId: source.EnrollmentId,
                SourceInvoiceItemId: rootItemId, RelatedEntityId: response.ThresholdResponseId, ResourceHoldId: hold.SeatHoldId,
                SportName: targetQuote.SportName)],
            expiresOffset, $"threshold-transfer-{response.ThresholdResponseId:N}"), ct);
        await classes.AttachHoldToInvoiceAsync(hold.SeatHoldId, draft.InvoiceId, ct);
        return draft.InvoiceId;
    }

    private async Task<ClassQuote> GetTargetQuoteAsync(int classId, CancellationToken ct)
    {
        var row = await db.Set<Class>().AsNoTracking().Where(x => x.ClassId == classId)
            .Select(x => new { x.ClassId, x.SportId, SportName = x.Sport!.Name, x.Price, x.Status })
            .SingleOrDefaultAsync(ct) ?? throw new NotFoundException("class_not_found", "Không tìm thấy khóa đích.");
        if (row.Status != ClassStatus.Published)
            throw new ConflictException("transfer_target_not_published", "Khóa đích phải Published.");
        var first = await db.Set<ClassSession>().Where(x => x.ClassId == classId && x.Status != ClassSessionStatus.Cancelled)
            .MinAsync(x => (DateTime?)x.StartAtUtc, ct);
        if (first is null || first <= clock.UtcNow)
            throw new ConflictException("transfer_target_started", "Khóa đích đã bắt đầu hoặc thiếu lịch.");
        return new ClassQuote(row.ClassId, row.SportId, row.SportName, row.Price,
            new DateTimeOffset(DateTime.SpecifyKind(first.Value, DateTimeKind.Utc)));
    }

    private static ThresholdResponseResult ToResult(ThresholdResponse response)
        => new(response.ThresholdResponseId, response.Choice?.ToString(), response.TargetClassId,
            response.ResolutionStatus.ToString(), response.DeadlineUtc, response.AdditionalInvoiceId);
}

public sealed record ThresholdResponseResult(Guid ResponseId, [property: SportHub.BuildingBlocks.Api.WireEnum] string? Choice, int? TargetClassId,
    [property: SportHub.BuildingBlocks.Api.WireEnum] string ResolutionStatus, DateTime DeadlineUtc, Guid? AdditionalInvoiceId);

public sealed record ThresholdResponseView(Guid ResponseId, int ClassId, string ClassName, int SportId, decimal PaidValueVnd,
    DateTime DeadlineUtc, [property: SportHub.BuildingBlocks.Api.WireEnum] string? Choice, int? TargetClassId,
    [property: SportHub.BuildingBlocks.Api.WireEnum] string ResolutionStatus, Guid? AdditionalInvoiceId, DateTime ServerNowUtc);
