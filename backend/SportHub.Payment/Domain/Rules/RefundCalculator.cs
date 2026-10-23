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
        // BR-91 uses Vietnam calendar dates, including both the first and last day.
        var totalDays = endDate.DayNumber - startDate.DayNumber + 1;
        if (totalDays <= 0) return 0;
        // A prepaid renewal can start in the future; its unused share cannot exceed the full term.
        var remainingDays = Math.Clamp(endDate.DayNumber - requestDateVietnam.DayNumber + 1, 0, totalDays);
        // Lỗi trung tâm chỉ hoàn phần chưa dùng (Source of Truth §Hoàn trả), không hoàn 100% giá trị đã dùng.
        if (centerFault)
            return PointsForRatio(decimal.Floor(itemPaidVnd * remainingDays / totalDays), 100);
        return remainingDays * 3 >= totalDays * 2
            ? PointsForRatio(itemPaidVnd, 50)
            : 0;
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

    // ---- Bank refunds: same policy ratios as the point rules, applied to the real refundable VND ----
    // The amount is NOT derived from the rounded point figure: it is floor(paid × ratio) with an exact integer
    // ratio, so a 50% refund of 1,999,999 VND is 999,999 VND instead of 999,000.

    public static RefundPolicyQuote MembershipVnd(decimal itemPaidVnd, DateOnly startDate, DateOnly endDate,
        DateOnly requestDateVietnam, bool centerFault = false)
    {
        var totalDays = endDate.DayNumber - startDate.DayNumber + 1;
        if (totalDays <= 0) return RefundPolicyQuote.None("Membership term is invalid.");
        var remainingDays = Math.Clamp(endDate.DayNumber - requestDateVietnam.DayNumber + 1, 0, totalDays);
        if (centerFault)
            return RefundPolicyQuote.Of(itemPaidVnd, remainingDays, totalDays,
                $"Center fault: unused part of the term ({remainingDays}/{totalDays} days).");
        return remainingDays * 3 >= totalDays * 2
            ? RefundPolicyQuote.Of(itemPaidVnd, 1, 2,
                $"At least two thirds of the term remained at request time ({remainingDays}/{totalDays} days): 50%.")
            : RefundPolicyQuote.None(
                $"Less than two thirds of the term remained at request time ({remainingDays}/{totalDays} days): no refund.");
    }

    public static RefundPolicyQuote ClassVnd(decimal itemPaidVnd, int totalProvidedSessions, int sessionsNotProvided,
        TimeSpan untilFirstSession, bool centerFault = false)
    {
        if (centerFault && totalProvidedSessions <= 0)
            return RefundPolicyQuote.Of(itemPaidVnd, 1, 1, "Center fault before any session was scheduled: 100%.");
        if (totalProvidedSessions <= 0 || sessionsNotProvided < 0 || sessionsNotProvided > totalProvidedSessions)
            throw new ArgumentOutOfRangeException(nameof(sessionsNotProvided), "Class session counts are inconsistent.");
        if (untilFirstSession > TimeSpan.Zero)
        {
            if (centerFault) return RefundPolicyQuote.Of(itemPaidVnd, 1, 1, "Center fault before the first session: 100%.");
            return untilFirstSession >= ClassFullRefundWindow
                ? RefundPolicyQuote.Of(itemPaidVnd, 1, 1, "Requested at least 5 days before the first session: 100%.")
                : RefundPolicyQuote.Of(itemPaidVnd, ClassLateRefundPercent, 100,
                    "Requested less than 5 days before the first session: 50%.");
        }
        if (!centerFault)
            return RefundPolicyQuote.None("The first session had already started at request time: no refund.");
        return RefundPolicyQuote.Of(itemPaidVnd, sessionsNotProvided, totalProvidedSessions,
            $"Center fault: sessions not delivered ({sessionsNotProvided}/{totalProvidedSessions}).");
    }

    public static RefundPolicyQuote RentalVnd(decimal itemPaidVnd, DateTimeOffset requestedAtVietnam,
        DateTimeOffset rentalStartVietnam, bool cancelledByCenter = false, int cancelFreeHours = 24)
    {
        if (cancelFreeHours < 0) throw new ArgumentOutOfRangeException(nameof(cancelFreeHours));
        if (cancelledByCenter) return RefundPolicyQuote.Of(itemPaidVnd, 1, 1, "The rental was cancelled by the center: 100%.");
        return rentalStartVietnam - requestedAtVietnam >= TimeSpan.FromHours(cancelFreeHours)
            ? RefundPolicyQuote.Of(itemPaidVnd, 1, 1, $"Requested at least {cancelFreeHours} hours before the start time: 100%.")
            : RefundPolicyQuote.None($"Requested less than {cancelFreeHours} hours before the start time: no refund.");
    }

    public static int PointsForRatio(decimal itemPaidVnd, decimal ratioPercent)
    {
        if (itemPaidVnd < 0) throw new ArgumentOutOfRangeException(nameof(itemPaidVnd));
        if (ratioPercent is < 0 or > 100) throw new ArgumentOutOfRangeException(nameof(ratioPercent));
        var refundableVnd = decimal.Floor(itemPaidVnd * ratioPercent / 100m);
        return checked((int)decimal.Floor(refundableVnd / VndPerPoint));
    }
}

/// <summary>Policy outcome in VND for a bank refund: the ratio that applies, the amount and the reasoning shown to the manager.</summary>
public sealed record RefundPolicyQuote(decimal Percent, decimal Vnd, string Basis)
{
    public static RefundPolicyQuote None(string basis) => new(0m, 0m, basis);

    public static RefundPolicyQuote Of(decimal paidVnd, int numerator, int denominator, string basis)
    {
        if (paidVnd < 0) throw new ArgumentOutOfRangeException(nameof(paidVnd));
        if (denominator <= 0 || numerator < 0 || numerator > denominator)
            throw new ArgumentOutOfRangeException(nameof(numerator));
        return new RefundPolicyQuote(
            decimal.Round(100m * numerator / denominator, 4),
            decimal.Floor(paidVnd * numerator / denominator), basis);
    }
}
