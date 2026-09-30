namespace SportHub.Payment.Domain.Rules;

/// <summary>
/// BR-90–94, 121–122 and 129: calculate point refunds against the value actually paid
/// for one InvoiceItem. Callers subtract prior refunds before invoking these rules.
/// </summary>
public static class RefundCalculator
{
    public const int VndPerPoint = 1_000;

    public static int MembershipPoints(
        decimal itemPaidVnd,
        DateOnly startDate,
        DateOnly endDate,
        DateOnly requestDateVietnam,
        bool centerFault = false)
    {
        if (centerFault) return PointsForRatio(itemPaidVnd, 100);
        var totalDays = endDate.DayNumber - startDate.DayNumber;
        if (totalDays <= 0) return 0;
        var remainingDays = Math.Clamp(endDate.DayNumber - requestDateVietnam.DayNumber, 0, totalDays);
        return remainingDays * 3 >= totalDays * 2
            ? PointsForRatio(itemPaidVnd, 50)
            : 0;
    }

    public static int PtPoints(decimal itemPaidVnd, bool hasConsumedSession, bool centerFault = false)
    {
        if (centerFault) return PointsForRatio(itemPaidVnd, 100);
        return hasConsumedSession ? 0 : PointsForRatio(itemPaidVnd, 50);
    }

    public static int ClassPoints(
        decimal itemPaidVnd,
        int totalProvidedSessions,
        int sessionsNotProvided,
        bool beforeFirstSession,
        bool centerFault = false)
    {
        if (centerFault && totalProvidedSessions <= 0)
            return PointsForRatio(itemPaidVnd, 100);
        if (totalProvidedSessions <= 0 || sessionsNotProvided < 0 || sessionsNotProvided > totalProvidedSessions)
            throw new ArgumentOutOfRangeException(nameof(sessionsNotProvided), "Class session counts are inconsistent.");
        if (beforeFirstSession) return PointsForRatio(itemPaidVnd, 100);
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
