namespace SportHub.Payment.Domain.Rules;

/// <summary>
/// BR-90–94, 121–122 and 129: calculate point refunds against the value actually paid
/// for one InvoiceItem. Callers subtract prior refunds before invoking these rules.
/// Quyết định 25/10/2026: Member tự hủy Gym, ghi danh lớp hoặc thuê sân thì KHÔNG được hoàn ở mọi thời điểm;
/// chỉ lỗi phía trung tâm (centerFault) mới có số điểm hoàn.
/// </summary>
public static class RefundCalculator
{
    public const int VndPerPoint = 1_000;

    /// <summary>Hủy ghi danh lớp từ mốc này trở lên trước buổi đầu được hoàn đủ; muộn hơn (vẫn trước buổi đầu) hoàn <see cref="ClassLateRefundPercent"/>%.</summary>
    public static readonly TimeSpan ClassFullRefundWindow = TimeSpan.FromDays(5);
    public const int ClassLateRefundPercent = 50;

    public static int MembershipPoints(
        decimal itemPaidVnd,
        DateOnly startDate,
        DateOnly endDate,
        DateOnly requestDateVietnam,
        bool centerFault = false)
    {
        // BR-91 uses Vietnam calendar dates, including both the first and last day.
        var totalDays = endDate.DayNumber - startDate.DayNumber + 1;
        if (totalDays <= 0) return 0;
        // A prepaid renewal can start in the future; its unused share cannot exceed the full term.
        var remainingDays = Math.Clamp(endDate.DayNumber - requestDateVietnam.DayNumber + 1, 0, totalDays);
        // Lỗi trung tâm chỉ hoàn phần chưa dùng (Source of Truth §Hoàn trả), không hoàn 100% giá trị đã dùng.
        if (centerFault)
            return PointsForRatio(decimal.Floor(itemPaidVnd * remainingDays / totalDays), 100);
        // Member tự hủy: không hoàn (BR-91). Mức 50% khi còn 2/3 thời hạn không còn áp dụng.
        return 0;
    }

    public static int ClassPoints(
        decimal itemPaidVnd,
        int totalProvidedSessions,
        int sessionsNotProvided,
        TimeSpan untilFirstSession,
        bool centerFault = false)
    {
        // Member tự hủy ghi danh: không hoàn ở mọi thời điểm (BR-122).
        if (!centerFault) return 0;
        if (centerFault && totalProvidedSessions <= 0)
            return PointsForRatio(itemPaidVnd, 100);
        if (totalProvidedSessions <= 0 || sessionsNotProvided < 0 || sessionsNotProvided > totalProvidedSessions)
            throw new ArgumentOutOfRangeException(nameof(sessionsNotProvided), "Class session counts are inconsistent.");
        if (untilFirstSession > TimeSpan.Zero)
            return PointsForRatio(itemPaidVnd,
                centerFault || untilFirstSession >= ClassFullRefundWindow ? 100 : ClassLateRefundPercent);
        if (!centerFault) return 0;
        return PointsForRatio(itemPaidVnd, 100m * sessionsNotProvided / totalProvidedSessions);
    }

    public static int RentalPoints(
        decimal itemPaidVnd,
        DateTimeOffset requestedAtVietnam,
        DateTimeOffset rentalStartVietnam,
        bool cancelledByCenter = false,
        int cancelFreeHours = 24)
    {
        if (cancelFreeHours < 0) throw new ArgumentOutOfRangeException(nameof(cancelFreeHours));
        // Member tự hủy lượt thuê: không hoàn ở mọi thời điểm (BR-129); chỉ trung tâm hủy mới hoàn 100%.
        return cancelledByCenter ? PointsForRatio(itemPaidVnd, 100) : 0;
    }

    public static int PointsForRatio(decimal itemPaidVnd, decimal ratioPercent)
    {
        if (itemPaidVnd < 0) throw new ArgumentOutOfRangeException(nameof(itemPaidVnd));
        if (ratioPercent is < 0 or > 100) throw new ArgumentOutOfRangeException(nameof(ratioPercent));
        var refundableVnd = decimal.Floor(itemPaidVnd * ratioPercent / 100m);
        return checked((int)decimal.Floor(refundableVnd / VndPerPoint));
    }
}
