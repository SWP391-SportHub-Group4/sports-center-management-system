using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using SportHub.BuildingBlocks.Abstractions.Audit;
using SportHub.BuildingBlocks.Abstractions.Notifications;
using SportHub.BuildingBlocks.Abstractions.Payment;
using SportHub.BuildingBlocks.Abstractions.Persistence;
using SportHub.BuildingBlocks.Abstractions.Scheduling;
using SportHub.BuildingBlocks.SharedKernel.Errors;
using SportHub.BuildingBlocks.SharedKernel.Time;
using SportHub.Scheduling.Application.Commands;
using SportHub.Scheduling.Threshold.Domain;

namespace SportHub.Scheduling.Application.Services;

/// <summary>Cancel paid courses using the same invoice, wallet and entitlement authorities as refunds.</summary>
public sealed class CourseCancellationService(ISportHubDbContext db, IRefundCreditService refunds,
    ICheckoutLifecycleService checkouts, IClassEnrollmentFulfillment enrollments, IOccupancyService occupancy,
    IAuditWriter audit, INotificationWriter notifications, IClock clock)
{
    public async Task<CourseCancellationPreview> PreviewAsync(int classId, CancellationToken ct = default)
    {
        var course = await db.Set<Class>().AsNoTracking().SingleOrDefaultAsync(x => x.ClassId == classId, ct)
            ?? throw new NotFoundException("class_not_found", "Không tìm thấy khóa học.");
        var members = await db.Set<Enrollment>().AsNoTracking().Where(x => x.ClassId == classId
            && x.Status == EnrollmentStatus.Confirmed).OrderBy(x => x.EnrollmentId).ToListAsync(ct);
        var holds = await db.Set<SeatHold>().AsNoTracking().Where(x => x.ClassId == classId
            && x.Status == SeatHoldStatus.Active).OrderBy(x => x.HoldId).ToListAsync(ct);
        var sessions = await db.Set<ClassSession>().AsNoTracking().Where(x => x.ClassId == classId).ToListAsync(ct);
        var originals = sessions.Where(x => !x.IsMakeup).ToList();
        var completedMakeups = sessions.Where(x => x.IsMakeup && x.Status == ClassSessionStatus.Completed
            && x.RescheduledFromSessionId != null).Select(x => x.RescheduledFromSessionId).ToHashSet();
        var remaining = originals.Count(x => x.Status != ClassSessionStatus.Completed && !completedMakeups.Contains(x.SessionId));
        var quotes = new List<CourseCancellationMember>();
        foreach (var member in members)
        {
            if (member.InvoiceItemId is not Guid itemId) continue;
            var value = await refunds.GetRemainingItemValueVndAsync(itemId, ct);
            var points = originals.Count == 0 ? 0 : checked((int)decimal.Floor(value * remaining / originals.Count / 1000m));
            quotes.Add(new(member.EnrollmentId, member.MemberId, itemId, value, points));
        }
        var canCancel = course.Status is not (ClassStatus.Completed or ClassStatus.Cancelled)
            && quotes.Count == members.Count && (members.Count == 0 || originals.Count > 0);
        var fingerprint = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(JsonSerializer.Serialize(new
            { course.Version, course.Status, remaining, total = originals.Count, quotes, holds = holds.Select(x => new { x.HoldId, x.InvoiceId }) }))));
        return new(canCancel, course.Version, originals.Count, remaining, members.Count, holds.Count,
            quotes.Sum(x => x.RefundPoints), fingerprint, quotes);
    }

    public async Task CancelAsync(int classId, CancelClassRequest request, Guid actorId, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(request.Reason) || request.Reason.Trim().Length is < 3 or > 500)
            throw new BadRequestException("class_cancel_reason_required", "Cần lý do hủy (3–500 ký tự).");
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        var selected = await db.Set<Enrollment>().AsNoTracking().Where(x => x.ClassId == classId && x.Status == EnrollmentStatus.Confirmed).ToListAsync(ct);
        var holds = await db.Set<SeatHold>().AsNoTracking().Where(x => x.ClassId == classId && x.Status == SeatHoldStatus.Active).ToListAsync(ct);
        var responses = await db.Set<ThresholdResponse>().AsNoTracking().Where(x => x.ClassId == classId
            && (x.ResolutionStatus == ThresholdResolutionStatus.Pending || x.ResolutionStatus == ThresholdResolutionStatus.AwaitingPayment)).ToListAsync(ct);
        var items = selected.Where(x => x.InvoiceItemId != null).Select(x => x.InvoiceItemId!.Value).Distinct().ToList();
        var invoices = holds.Where(x => x.InvoiceId != null).Select(x => x.InvoiceId!.Value)
            .Concat(responses.Where(x => x.AdditionalInvoiceId != null).Select(x => x.AdditionalInvoiceId!.Value)).Distinct().ToList();
        // Payment/checkout takes invoice then wallet then entitlement then class; follow that order.
        await refunds.LockBatchAsync(items, invoices, ct);
        foreach (var response in responses.OrderBy(x => x.ThresholdResponseId))
        {
            // Choice submission can already hold a response while waiting for its invoice.
            // Never wait in the opposite order: roll back and refresh the cancellation preview.
            var locked = await db.Set<ThresholdResponse>().FromSqlInterpolated(
                $"SELECT * FROM class_threshold_responses WHERE threshold_response_id = {response.ThresholdResponseId} FOR UPDATE SKIP LOCKED").ToListAsync(ct);
            if (locked.Count == 0)
                throw new ConflictException("class_cancellation_changed", "Phản hồi ngưỡng đang được xử lý; hãy thử lại.");
        }
        foreach (var hold in holds.OrderBy(x => x.HoldId))
            await db.Database.ExecuteSqlInterpolatedAsync($"SELECT 1 FROM seat_holds WHERE hold_id = {hold.HoldId} FOR UPDATE", ct);
        foreach (var member in selected.OrderBy(x => x.EnrollmentId))
            await db.Database.ExecuteSqlInterpolatedAsync($"SELECT 1 FROM enrollments WHERE enrollment_id = {member.EnrollmentId} FOR UPDATE", ct);
        await db.Database.ExecuteSqlInterpolatedAsync($"SELECT 1 FROM classes WHERE class_id = {classId} FOR UPDATE", ct);
        var course = await db.Set<Class>().SingleOrDefaultAsync(x => x.ClassId == classId, ct)
            ?? throw new NotFoundException("class_not_found", "Không tìm thấy khóa học.");
        await db.Entry(course).ReloadAsync(ct);
        if (course.Status == ClassStatus.Cancelled) { await tx.CommitAsync(ct); return; }
        var current = await PreviewAsync(classId, ct);
        if (!current.CanCancel)
            throw new ConflictException("class_not_cancellable", "Khóa đã kết thúc hoặc ghi danh cũ thiếu hóa đơn để hoàn điểm.");
        var currentHolds = await db.Set<SeatHold>().AsNoTracking().Where(x => x.ClassId == classId && x.Status == SeatHoldStatus.Active).ToListAsync(ct);
        var currentResponses = await db.Set<ThresholdResponse>().AsNoTracking().Where(x => x.ClassId == classId
            && (x.ResolutionStatus == ThresholdResolutionStatus.Pending || x.ResolutionStatus == ThresholdResolutionStatus.AwaitingPayment)).ToListAsync(ct);
        if (current.Members.Any(x => !items.Contains(x.InvoiceItemId))
            || currentHolds.Any(x => !holds.Any(h => h.HoldId == x.HoldId) || x.InvoiceId != null && !invoices.Contains(x.InvoiceId.Value))
            || currentResponses.Any(x => !responses.Any(r => r.ThresholdResponseId == x.ThresholdResponseId)
                || x.AdditionalInvoiceId != null && !invoices.Contains(x.AdditionalInvoiceId.Value)))
            throw new ConflictException("class_cancellation_changed", "Ghi danh/giữ chỗ vừa thay đổi; hãy xem trước lại.");
        if ((current.ConfirmedCount > 0 || current.ActiveHoldCount > 0) && request.PreviewToken != current.PreviewToken
            || request.PreviewToken != null && request.PreviewToken != current.PreviewToken)
            throw new ConflictException("class_cancellation_changed", "Phạm vi hoặc điểm hoàn đã đổi; hãy xem trước lại.");
        foreach (var invoiceId in invoices.Order())
            await checkouts.ReleaseForSystemAsync(invoiceId, "Hủy khóa bởi trung tâm", ct);
        foreach (var hold in currentHolds.Where(x => x.InvoiceId == null)) await enrollments.ReleaseAsync(hold.HoldId, ct);
        foreach (var member in current.Members)
        {
            await refunds.CreditAsync(new(member.InvoiceItemId, 100, $"Hủy khóa {classId}: {request.Reason.Trim()}", member.EnrollmentId,
                current.SessionsNotProvided, current.TotalSessions), ct);
            await enrollments.CancelAsync(member.InvoiceItemId, EnrollmentEndReason.CancelledByCenter, ct);
            notifications.Queue(new(member.MemberId, NotificationEvents.ClassCancelled,
                $"Khóa {course.Name} đã hủy; hoàn {member.RefundPoints} điểm vào ví. {request.Reason.Trim()}", member.EnrollmentId));
        }
        // Entitlement services update counts using SQL; reload before saving the class.
        await db.Entry(course).ReloadAsync(ct);
        var sessions = await db.Set<ClassSession>().Where(x => x.ClassId == classId && x.Status == ClassSessionStatus.Scheduled).ToListAsync(ct);
        foreach (var session in sessions)
        {
            session.Status = ClassSessionStatus.Cancelled;
            await occupancy.ReleaseAsync(OccupancySources.ClassSession, session.SessionId, ct);
        }
        var pendingResponses = await db.Set<ThresholdResponse>().Where(x => x.ClassId == classId
            && (x.ResolutionStatus == ThresholdResolutionStatus.Pending || x.ResolutionStatus == ThresholdResolutionStatus.AwaitingPayment)).ToListAsync(ct);
        foreach (var response in pendingResponses) { response.ResolutionStatus = ThresholdResolutionStatus.Expired; response.ResolvedAtUtc = clock.UtcNow; }
        course.Status = ClassStatus.Cancelled; course.Version++;
        audit.Write(new(actorId, "CANCEL_CLASS", nameof(Class), classId.ToString(),
            NewValue: JsonSerializer.Serialize(new { current.ConfirmedCount, current.ActiveHoldCount, current.RefundPoints, current.SessionsNotProvided }), Reason: request.Reason.Trim()));
        await db.SaveChangesAsync(ct); await tx.CommitAsync(ct);
    }
}
public sealed record CourseCancellationMember(Guid EnrollmentId, Guid MemberId, Guid InvoiceItemId, decimal RemainingPaidValueVnd, int RefundPoints);
public sealed record CourseCancellationPreview(bool CanCancel, int Version, int TotalSessions, int SessionsNotProvided,
    int ConfirmedCount, int ActiveHoldCount, int RefundPoints, string PreviewToken, IReadOnlyList<CourseCancellationMember> Members);
