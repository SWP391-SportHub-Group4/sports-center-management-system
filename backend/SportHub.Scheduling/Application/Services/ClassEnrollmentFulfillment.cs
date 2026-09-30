using Microsoft.EntityFrameworkCore;
using SportHub.BuildingBlocks.Abstractions.Identity;
using SportHub.BuildingBlocks.Abstractions.Persistence;
using SportHub.BuildingBlocks.Abstractions.Scheduling;
using SportHub.BuildingBlocks.Abstractions.Training;
using SportHub.BuildingBlocks.SharedKernel.Errors;
using SportHub.BuildingBlocks.SharedKernel.Time;
using SportHub.Scheduling.Threshold.Domain;

namespace SportHub.Scheduling.Application.Services;

/// <summary>
/// Bản cài đặt <see cref="IClassEnrollmentFulfillment"/>. Scheduling sở hữu giá, chỗ và ghi danh; Payment (caller) quyết định
/// "đã trả tiền". Chạy trong DbContext/transaction của caller.
///
/// Chống bán vượt sĩ số bằng UPDATE có điều kiện trên <c>classes.reserved_count</c> (cộng CHECK trong DB), không phải "đọc rồi ghi".
/// Thứ tự khóa: Member (tuần tự hóa lịch của Member) → dòng lớp (qua UPDATE có điều kiện) → hold.
/// Ghi danh chỉ sinh ở <see cref="ConfirmAsync"/> — không có đường ghi danh miễn phí.
/// </summary>
public sealed class ClassEnrollmentFulfillment(
    ISportHubDbContext db,
    IUserAccessReader users,
    ICoachRelationshipRegistrar coachRelationships,
    IClock clock) : IClassEnrollmentFulfillment
{
    public async Task<ClassQuote> QuoteAsync(int classId, Guid memberId, CancellationToken cancellationToken = default)
        => (await EnsureBookableAsync(classId, memberId, cancellationToken)).Quote;

    public async Task<ClassSeatReservation> ReserveAsync(
        int classId, Guid memberId, Guid? invoiceId, DateTimeOffset holdExpiresAtUtc,
        CancellationToken cancellationToken = default, Guid? transferSourceEnrollmentId = null)
    {
        RequireTransaction();
        await CourseScheduleLock.AcquireAsync(db, changingSchedule: false, cancellationToken);
        var now = clock.UtcNow;

        if (holdExpiresAtUtc.UtcDateTime <= now)
        {
            throw new BadRequestException("hold_expiry_in_past", "Hạn giữ chỗ phải ở tương lai.");
        }

        // 1) Khóa Member trước: hai checkout song song của cùng Member (kể cả hai lớp trùng giờ) chạy tuần tự.
        await db.Database.ExecuteSqlInterpolatedAsync(
            $"SELECT user_id FROM user_accounts WHERE user_id = {memberId} FOR UPDATE", cancellationToken);

        int? sourceClassToIgnore = null;
        if (transferSourceEnrollmentId is Guid sourceEnrollmentId)
        {
            sourceClassToIgnore = await db.Set<Enrollment>().Where(x => x.EnrollmentId == sourceEnrollmentId
                    && x.MemberId == memberId && x.Status == EnrollmentStatus.Confirmed)
                .Select(x => (int?)x.ClassId).SingleOrDefaultAsync(cancellationToken)
                ?? throw new ConflictException("transfer_source_inactive", "Ghi danh nguồn không còn hiệu lực.");
        }
        var (quote, _) = await EnsureBookableAsync(classId, memberId, cancellationToken, sourceClassToIgnore);

        // 2) Chốt chặn overbooking: chỉ tăng khi còn chỗ và khóa đang mở bán. Nếu 0 dòng thì đã hết chỗ hoặc hết mở bán.
        var published = (int)ClassStatus.Published;
        var updated = await db.Database.ExecuteSqlInterpolatedAsync(
            $"UPDATE classes SET reserved_count = reserved_count + 1, version = version + 1 WHERE class_id = {classId} AND status = {published} AND reserved_count < capacity",
            cancellationToken);

        if (updated == 0)
        {
            throw new ConflictException("class_full", "Khóa học đã hết chỗ hoặc không còn nhận ghi danh.");
        }

        var hold = new SeatHold
        {
            HoldId = Guid.NewGuid(),
            ClassId = classId,
            MemberId = memberId,
            InvoiceId = invoiceId,
            ExpiresAtUtc = holdExpiresAtUtc.UtcDateTime,
            Status = SeatHoldStatus.Active,
            CreatedAt = now
        };

        db.Set<SeatHold>().Add(hold);
        await db.SaveChangesAsync(cancellationToken);

        return new ClassSeatReservation(hold.HoldId, quote);
    }

    public async Task<Guid> ConfirmAsync(Guid seatHoldId, Guid invoiceItemId, CancellationToken cancellationToken = default,
        Guid? sourceEnrollmentId = null, Guid? transferDifferenceInvoiceItemId = null)
    {
        RequireTransaction();
        await CourseScheduleLock.AcquireAsync(db, changingSchedule: false, cancellationToken);
        // Idempotent: cùng InvoiceItem đã có ghi danh thì trả lại.
        var existing = await db.Set<Enrollment>().AsNoTracking()
            .Where(e => e.InvoiceItemId == invoiceItemId && e.Status == EnrollmentStatus.Confirmed)
            .Select(e => (Guid?)e.EnrollmentId)
            .SingleOrDefaultAsync(cancellationToken);

        if (existing is Guid id)
        {
            return id;
        }

        var hold = await LockHoldAsync(seatHoldId, cancellationToken)
                   ?? throw new NotFoundException("seat_hold_not_found", "Không tìm thấy giữ chỗ.");

        // A concurrent fulfillment may have committed while this request waited for the hold lock.
        existing = await db.Set<Enrollment>().AsNoTracking()
            .Where(e => e.InvoiceItemId == invoiceItemId && e.Status == EnrollmentStatus.Confirmed)
            .Select(e => (Guid?)e.EnrollmentId).SingleOrDefaultAsync(cancellationToken);
        if (existing is Guid confirmedId)
        {
            return confirmedId;
        }

        if (hold.Status != SeatHoldStatus.Active)
        {
            throw new ConflictException("seat_hold_not_active", "Giữ chỗ đã hết hạn, đã hủy hoặc đã được dùng.");
        }

        if (hold.ExpiresAtUtc <= clock.UtcNow)
        {
            throw new ConflictException("seat_hold_expired", "Giữ chỗ đã hết hạn; cần đối soát thanh toán trước khi cấp quyền lợi.");
        }

        var cls = await db.Set<Class>().AsNoTracking().SingleAsync(c => c.ClassId == hold.ClassId, cancellationToken);

        if (cls.Status != ClassStatus.Published)
        {
            throw new ConflictException("class_not_open", "Khóa không còn nhận ghi danh.");
        }

        // Không nhận ghi danh khi đã đến buổi đầu (dù job chuyển InProgress chưa chạy).
        var firstStart = await FirstSessionStartAsync(hold.ClassId, cancellationToken);
        if (firstStart is null || firstStart <= clock.UtcNow)
        {
            throw new ConflictException("class_started", "Khóa đã bắt đầu — không còn nhận ghi danh.");
        }

        var enrollment = new Enrollment
        {
            EnrollmentId = Guid.NewGuid(),
            ClassId = hold.ClassId,
            MemberId = hold.MemberId,
            InvoiceItemId = invoiceItemId,
            SourceEnrollmentId = sourceEnrollmentId,
            TransferDifferenceInvoiceItemId = transferDifferenceInvoiceItemId,
            Status = EnrollmentStatus.Confirmed,
            EnrolledAt = clock.UtcNow
        };

        hold.Status = SeatHoldStatus.Converted;
        db.Set<Enrollment>().Add(enrollment);

        // reserved_count không đổi (hold đã được tính); confirmed_count + 1.
        var updated = await db.Database.ExecuteSqlInterpolatedAsync(
            $"UPDATE classes SET confirmed_count = confirmed_count + 1, version = version + 1 WHERE class_id = {hold.ClassId} AND confirmed_count < reserved_count",
            cancellationToken);

        if (updated == 0)
        {
            throw new InvalidOperationException("Sai lệch bộ đếm chỗ: confirmed_count đã bằng reserved_count khi chuyển giữ chỗ thành ghi danh.");
        }

        await db.SaveChangesAsync(cancellationToken);

        // Quan hệ huấn luyện ClassBased chỉ cấp cho Coach có chuyên môn PT (BR-99/100) — Training tự quyết định.
        if (cls.CoachId is Guid coachId)
        {
            await coachRelationships.EnsureClassBasedAsync(coachId, hold.MemberId, hold.ClassId, cancellationToken);
            await db.SaveChangesAsync(cancellationToken);
        }

        return enrollment.EnrollmentId;
    }

    public async Task AttachHoldToInvoiceAsync(Guid seatHoldId, Guid invoiceId, CancellationToken cancellationToken = default)
    {
        RequireTransaction();
        var hold = await LockHoldAsync(seatHoldId, cancellationToken)
            ?? throw new NotFoundException("seat_hold_not_found", "Không tìm thấy giữ chỗ.");
        if (hold.Status != SeatHoldStatus.Active || hold.InvoiceId is not null)
            throw new ConflictException("seat_hold_already_linked", "Giữ chỗ không còn Active hoặc đã gắn hóa đơn.");
        hold.InvoiceId = invoiceId;
        await db.SaveChangesAsync(cancellationToken);
    }

    public async Task CompleteTransferAsync(Guid thresholdResponseId, Guid seatHoldId,
        Guid differenceInvoiceItemId, CancellationToken cancellationToken = default)
    {
        RequireTransaction();
        var responseRows = await db.Set<ThresholdResponse>().FromSqlInterpolated($"""
            SELECT * FROM class_threshold_responses
            WHERE threshold_response_id = {thresholdResponseId} FOR UPDATE
            """).ToListAsync(cancellationToken);
        var response = responseRows.SingleOrDefault()
            ?? throw new ConflictException("threshold_response_not_found", "Không tìm thấy phản hồi chuyển lớp.");
        if (response.ResolutionStatus == ThresholdResolutionStatus.Completed)
        {
            if (await db.Set<Enrollment>().AnyAsync(x => x.SourceEnrollmentId == response.EnrollmentId
                && x.TransferDifferenceInvoiceItemId == differenceInvoiceItemId
                && x.Status == EnrollmentStatus.Confirmed, cancellationToken)) return;
            throw new ConflictException("threshold_transfer_already_resolved", "Phản hồi chuyển lớp đã được xử lý.");
        }
        if (response.Choice != ThresholdResponseChoice.Transfer
            || response.ResolutionStatus != ThresholdResolutionStatus.AwaitingPayment
            || response.DeadlineUtc <= clock.UtcNow)
            throw new ConflictException("threshold_transfer_expired", "Chuyển lớp đã hết hạn hoặc không chờ thanh toán.");
        var source = await db.Set<Enrollment>().SingleOrDefaultAsync(x => x.EnrollmentId == response.EnrollmentId
            && x.Status == EnrollmentStatus.Confirmed, cancellationToken)
            ?? throw new ConflictException("transfer_source_inactive", "Ghi danh nguồn không còn hiệu lực.");
        if (source.ClassId != response.ClassId || source.InvoiceItemId is not Guid rootItemId)
            throw new ConflictException("transfer_source_mismatch", "Ghi danh nguồn không khớp phản hồi.");
        var hold = await LockHoldAsync(seatHoldId, cancellationToken)
            ?? throw new ConflictException("transfer_hold_missing", "Không tìm thấy giữ chỗ lớp đích.");
        if (hold.ClassId != response.TargetClassId || hold.MemberId != response.MemberId
            || hold.InvoiceId != response.AdditionalInvoiceId)
            throw new ConflictException("transfer_hold_mismatch", "Giữ chỗ không khớp hóa đơn chuyển lớp.");
        await db.Database.ExecuteSqlInterpolatedAsync(
            $"SELECT user_id FROM user_accounts WHERE user_id = {response.MemberId} FOR UPDATE", cancellationToken);
        await CourseScheduleLock.AcquireAsync(db, changingSchedule: false, cancellationToken);
        foreach (var classId in new[] { source.ClassId, hold.ClassId }.Order())
            await db.Database.ExecuteSqlInterpolatedAsync($"SELECT class_id FROM classes WHERE class_id = {classId} FOR UPDATE", cancellationToken);
        await CancelAsync(rootItemId, EnrollmentEndReason.TransferredOut, cancellationToken);
        await ConfirmAsync(seatHoldId, rootItemId, cancellationToken,
            source.EnrollmentId, differenceInvoiceItemId);
        response.ResolutionStatus = ThresholdResolutionStatus.Completed;
        response.ResolvedAtUtc = clock.UtcNow;
        await db.SaveChangesAsync(cancellationToken);
    }

    public async Task ReleaseAsync(Guid seatHoldId, CancellationToken cancellationToken = default)
    {
        RequireTransaction();
        var hold = await LockHoldAsync(seatHoldId, cancellationToken);

        if (hold is null || hold.Status is SeatHoldStatus.Released or SeatHoldStatus.Expired)
        {
            return; // đã nhả một lần, không giảm lần hai
        }

        if (hold.Status == SeatHoldStatus.Converted)
        {
            throw new ConflictException("seat_hold_already_converted", "Giữ chỗ đã chuyển thành ghi danh — không nhả được.");
        }

        hold.Status = SeatHoldStatus.Released;
        await DecrementReservedAsync(hold.ClassId, 1, cancellationToken);
        await db.SaveChangesAsync(cancellationToken);
    }

    public async Task CancelAsync(Guid invoiceItemId, EnrollmentEndReason endReason, CancellationToken cancellationToken = default)
    {
        RequireTransaction();
        await db.Database.ExecuteSqlInterpolatedAsync(
            $"SELECT enrollment_id FROM enrollments WHERE invoice_item_id = {invoiceItemId} AND status = {(int)EnrollmentStatus.Confirmed} FOR UPDATE", cancellationToken);
        var enrollment = await db.Set<Enrollment>().SingleOrDefaultAsync(e => e.InvoiceItemId == invoiceItemId
            && e.Status == EnrollmentStatus.Confirmed, cancellationToken);

        if (enrollment is null || enrollment.Status != EnrollmentStatus.Confirmed)
        {
            return; // idempotent
        }

        // Khóa dòng lớp trước khi đổi bộ đếm để hai hủy song song tuần tự.
        await db.Database.ExecuteSqlInterpolatedAsync(
            $"SELECT class_id FROM classes WHERE class_id = {enrollment.ClassId} FOR UPDATE", cancellationToken);

        enrollment.Status = endReason switch
        {
            EnrollmentEndReason.Refunded => EnrollmentStatus.Refunded,
            EnrollmentEndReason.TransferredOut => EnrollmentStatus.TransferredOut,
            _ => EnrollmentStatus.CancelledByCenter
        };
        enrollment.EndedAt = clock.UtcNow;

        var updated = await db.Database.ExecuteSqlInterpolatedAsync(
            $"UPDATE classes SET confirmed_count = confirmed_count - 1, reserved_count = reserved_count - 1, version = version + 1 WHERE class_id = {enrollment.ClassId} AND confirmed_count > 0",
            cancellationToken);

        if (updated == 0)
        {
            throw new InvalidOperationException("Sai lệch bộ đếm chỗ khi kết thúc ghi danh.");
        }

        await db.SaveChangesAsync(cancellationToken);
    }

    public async Task<ClassRefundFacts?> GetRefundFactsAsync(Guid invoiceItemId, CancellationToken cancellationToken = default)
    {
        var enrollment = await db.Set<Enrollment>().AsNoTracking()
            .Where(e => e.InvoiceItemId == invoiceItemId && e.Status == EnrollmentStatus.Confirmed)
            .OrderByDescending(e => e.EnrolledAt).FirstOrDefaultAsync(cancellationToken);
        if (enrollment is null) return null;
        var sessions = await db.Set<ClassSession>().AsNoTracking()
            .Where(s => s.ClassId == enrollment.ClassId)
            .Select(s => new { s.StartAtUtc, s.Status, s.IsMakeup, s.RescheduledFromSessionId })
            .ToListAsync(cancellationToken);
        var originals = sessions.Where(s => !s.IsMakeup).ToList();
        var first = originals.Count == 0 ? null : originals.Min(s => (DateTime?)s.StartAtUtc);
        if (first is null) return null;
        var total = originals.Count;
        var notProvided = originals.Count(s => s.Status != ClassSessionStatus.Completed);
        var compensated = sessions.Count(s => s.IsMakeup && s.Status == ClassSessionStatus.Completed
            && s.RescheduledFromSessionId is not null);
        notProvided = Math.Max(0, notProvided - compensated);
        return new ClassRefundFacts(enrollment.MemberId,
            new DateTimeOffset(DateTime.SpecifyKind(first.Value, DateTimeKind.Utc)), total,
            notProvided, enrollment.Status == EnrollmentStatus.Confirmed);
    }

    // ---------------------------------------------------------------- Nội bộ

    private void RequireTransaction()
    {
        if (db.Database.CurrentTransaction is null)
        {
            throw new InvalidOperationException("Class fulfillment requires the caller's transaction.");
        }
    }

    private async Task<(ClassQuote Quote, Class Class)> EnsureBookableAsync(int classId, Guid memberId, CancellationToken ct,
        int? excludedSourceClassId = null)
    {
        var row = await db.Set<Class>().AsNoTracking()
                      .Where(c => c.ClassId == classId)
                      .Select(c => new { Class = c, SportName = c.Sport!.Name })
                      .SingleOrDefaultAsync(ct)
                  ?? throw new NotFoundException("class_not_found", "Không tìm thấy khóa học.");

        var cls = row.Class;

        // Không cần Membership: khóa nhóm mua trọn gói bằng tiền/điểm (BR-110).
        if (cls.Status != ClassStatus.Published)
        {
            throw new ConflictException("class_not_open", "Khóa học chưa mở hoặc đã đóng ghi danh.");
        }

        if (cls.ThresholdStatus == ThresholdStatus.AtRisk
            && cls.ThresholdResponseDeadlineUtc is DateTime responseDeadline
            && responseDeadline <= clock.UtcNow)
        {
            throw new ConflictException("class_threshold_response_closed",
                "Khóa đang kết thúc quy trình ngưỡng hoàn vốn và không nhận thêm ghi danh.");
        }

        var sessions = await db.Set<ClassSession>().AsNoTracking()
            .Where(s => s.ClassId == classId && s.Status == ClassSessionStatus.Scheduled)
            .Select(s => new { s.StartAtUtc, s.EndAtUtc })
            .ToListAsync(ct);

        if (sessions.Count == 0)
        {
            throw new ConflictException("class_not_open", "Khóa học chưa có lịch.");
        }

        var firstStart = await FirstSessionStartAsync(classId, ct);
        if (firstStart is null || firstStart <= clock.UtcNow)
        {
            throw new ConflictException("class_started", "Khóa đã bắt đầu — không còn nhận ghi danh.");
        }

        var member = await users.GetAsync(memberId, ct);
        if (member is null || member.Role != "Member" || !member.IsActive)
        {
            throw new BadRequestException("member_not_found", "Người mua phải là Hội viên đang hoạt động.");
        }

        if (await db.Set<Enrollment>().AnyAsync(e => e.ClassId == classId && e.MemberId == memberId && e.Status == EnrollmentStatus.Confirmed, ct))
        {
            throw new ConflictException("already_enrolled", "Hội viên đã ghi danh khóa này.");
        }

        if (await db.Set<SeatHold>().AnyAsync(h => h.ClassId == classId && h.MemberId == memberId && h.Status == SeatHoldStatus.Active, ct))
        {
            throw new ConflictException("seat_hold_exists", "Hội viên đang giữ chỗ khóa này.");
        }

        // Trùng lịch với khóa khác mà Member đã ghi danh hoặc đang giữ chỗ.
        var otherClassIds = await db.Set<Enrollment>().AsNoTracking()
            .Where(e => e.MemberId == memberId && e.Status == EnrollmentStatus.Confirmed && e.ClassId != classId
                && (excludedSourceClassId == null || e.ClassId != excludedSourceClassId))
            .Select(e => e.ClassId)
            .Union(db.Set<SeatHold>().AsNoTracking()
                .Where(h => h.MemberId == memberId && h.Status == SeatHoldStatus.Active && h.ClassId != classId
                    && (excludedSourceClassId == null || h.ClassId != excludedSourceClassId))
                .Select(h => h.ClassId))
            .ToListAsync(ct);

        if (otherClassIds.Count > 0)
        {
            var from = sessions.Min(s => s.StartAtUtc);
            var to = sessions.Max(s => s.EndAtUtc);

            var others = await db.Set<ClassSession>().AsNoTracking()
                .Where(s => otherClassIds.Contains(s.ClassId) && s.Status == ClassSessionStatus.Scheduled
                            && s.StartAtUtc < to && s.EndAtUtc > from)
                .Select(s => new { s.StartAtUtc, s.EndAtUtc })
                .ToListAsync(ct);

            if (others.Any(o => sessions.Any(s => s.StartAtUtc < o.EndAtUtc && s.EndAtUtc > o.StartAtUtc)))
            {
                throw new ConflictException("member_schedule_conflict", "Lịch khóa này trùng giờ với khóa khác của hội viên.");
            }
        }

        var quote = new ClassQuote(
            cls.ClassId, cls.SportId, row.SportName, cls.Price, new DateTimeOffset(DateTime.SpecifyKind(firstStart.Value, DateTimeKind.Utc)));

        return (quote, cls);
    }

    private async Task<DateTime?> FirstSessionStartAsync(int classId, CancellationToken ct)
        => await db.Set<ClassSession>().AsNoTracking()
            .Where(s => s.ClassId == classId && s.Status != ClassSessionStatus.Cancelled)
            .MinAsync(s => (DateTime?)s.StartAtUtc, ct);

    private async Task<SeatHold?> LockHoldAsync(Guid holdId, CancellationToken ct)
    {
        await db.Database.ExecuteSqlInterpolatedAsync($"SELECT hold_id FROM seat_holds WHERE hold_id = {holdId} FOR UPDATE", ct);
        return await db.Set<SeatHold>().SingleOrDefaultAsync(h => h.HoldId == holdId, ct);
    }

    private Task<int> DecrementReservedAsync(int classId, int by, CancellationToken ct)
        => db.Database.ExecuteSqlInterpolatedAsync(
            $"UPDATE classes SET reserved_count = reserved_count - {by}, version = version + 1 WHERE class_id = {classId} AND reserved_count - {by} >= confirmed_count",
            ct);
}
