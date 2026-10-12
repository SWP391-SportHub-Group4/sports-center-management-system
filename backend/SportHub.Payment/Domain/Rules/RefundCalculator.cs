namespace SportHub.Payment.Domain.Rules;

/// <summary>
/// BR-90–94, 121–122 and 129: calculate point refunds against the value actually paid
/// for one InvoiceItem. Callers subtract prior refunds before invoking these rules.
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
        var totalDays = endDate.DayNumber - startDate.DayNumber;
        if (totalDays <= 0) return 0;
        var remainingDays = Math.Clamp(endDate.DayNumber - requestDateVietnam.DayNumber, 0, totalDays);
        // Lỗi trung tâm chỉ hoàn phần chưa dùng (Source of Truth §Hoàn trả), không hoàn 100% giá trị đã dùng.
        if (centerFault) return PointsForRatio(itemPaidVnd, 100m * remainingDays / totalDays);
        return remainingDays * 3 >= totalDays * 2
            ? PointsForRatio(itemPaidVnd, 50)
            : 0;
    }

    public static int PtPoints(
        decimal itemPaidVnd,
        bool hasConsumedSession,
        bool centerFault = false,
        int totalQuota = 0,
        int consumedSessions = 0)
    {
        if (centerFault)
        {
            // Lỗi trung tâm hoàn theo số buổi chưa dùng; chưa dùng buổi nào (hoặc thiếu hạn mức) thì hoàn đủ.
            if (consumedSessions <= 0 || totalQuota <= 0) return PointsForRatio(itemPaidVnd, 100);
            var unused = Math.Max(0, totalQuota - consumedSessions);
            return PointsForRatio(itemPaidVnd, 100m * unused / totalQuota);
        }
        return hasConsumedSession ? 0 : PointsForRatio(itemPaidVnd, 50);
    }

    public static int ClassPoints(
        decimal itemPaidVnd,
        int totalProvidedSessions,
        int sessionsNotProvided,
        TimeSpan untilFirstSession,
        bool centerFault = false)
    {
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
        if (cancelledByCenter) return PointsForRatio(itemPaidVnd, 100);
        return rentalStartVietnam - requestedAtVietnam >= TimeSpan.FromHours(cancelFreeHours)
            ? PointsForRatio(itemPaidVnd, 100)
            : 0;
    }

    public static int PointsForRatio(decimal itemPaidVnd, decimal ratioPercent)
    {
        if (itemPaidVnd < 0) throw new ArgumentOutOfRangeException(nameof(itemPaidVnd));
        if (ratioPercent is < 0 or > 100) throw new ArgumentOutOfRangeException(nameof(ratioPercent));
        var refundableVnd = decimal.Floor(itemPaidVnd * ratioPercent / 100m);
        return checked((int)decimal.Floor(refundableVnd / VndPerPoint));
    }
}
