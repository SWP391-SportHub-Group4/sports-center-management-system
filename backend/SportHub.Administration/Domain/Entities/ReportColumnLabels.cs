namespace SportHub.Administration.Domain.Entities;

public static class ReportColumnLabels
{
    private static readonly IReadOnlyDictionary<string, string> Labels =
        new Dictionary<string, string>(StringComparer.Ordinal)
        {
            ["date"] = "Collection date (VN)",
            ["legacyCashCollected"] = "Legacy cash collected",
            ["reconciliationCashCollected"] = "Reconciled/compensated cash",
            ["bankRefundPaid"] = "Bank refunds paid (VND, not deducted from VNPay cash)",
            ["bankRefundCount"] = "Bank refunds paid (count)",
            ["source"] = "Revenue source",
            ["sportId"] = "Sport ID",
            ["sportName"] = "Sport",
            ["memberId"] = "Member ID",
            ["pointsRedeemed"] = "Points used by members in period",
            ["pointsRedeemedVnd"] = "Point value used (VND equivalent, not cash)",
            ["pointsIssued"] = "Points refunded",
            ["managerPointAdjustment"] = "Manager point adjustment in period",
            ["outstandingPoints"] = "Current outstanding points (available + held)",
            ["outstandingPointsAsOfUtc"] = "Current point balance observed at (UTC)",
            ["fromDate"] = "From date",
            ["toDate"] = "To date",
            ["newMembers"] = "New member accounts",
            ["membersPurchasingMembershipInPeriod"] = "Members purchasing Membership in period",
            ["activeMembersAtPeriodEnd"] = "Members with valid Membership on To date",
            ["classId"] = "Course ID",
            ["code"] = "Course code",
            ["name"] = "Course name",
            ["capacity"] = "Capacity",
            ["confirmedCount"] = "Confirmed enrollments",
            ["activeHoldCount"] = "Seats held for checkout",
            ["availableSeats"] = "Available seats",
            ["fillRatio"] = "Fill rate",
            ["breakEvenThreshold"] = "Break-even threshold",
            ["thresholdStatus"] = "Threshold status",
            ["firstSessionStartUtc"] = "First session (UTC)",
            ["invoiceNumber"] = "Invoice number",
            ["issuedAt"] = "Issued at",
            ["memberEmail"] = "Member email",
            ["memberName"] = "Member name",
            ["totalAmount"] = "Total amount",
            ["collectedAmount"] = "Cash collected (VND)",
            ["obligationReduction"] = "Obligation reduction",
            ["refundedAmount"] = "Legacy cash refunded (VND, excludes point refunds)",
            ["netCollected"] = "Cash collected less legacy cash refunds (VND)",
            ["netPayable"] = "Net payable",
            ["outstanding"] = "Outstanding",
            ["refundDue"] = "Refund due",
            ["status"] = "Status",

            ["email"] = "Email",
            ["fullName"] = "Full name",
            ["phone"] = "Phone",
            ["joinedAt"] = "Joined at",
            ["activePackages"] = "Active packages",
            ["remainingSessions"] = "Remaining sessions",
            ["totalSpent"] = "Total spent"
        };

    private static readonly IReadOnlySet<string> NumericColumns = new HashSet<string>(StringComparer.Ordinal)
    {
        "totalAmount", "collectedAmount", "obligationReduction", "refundedAmount",
        "netCollected", "netPayable", "outstanding", "refundDue",
        "activePackages", "remainingSessions", "totalSpent"
        , "legacyCashCollected", "reconciliationCashCollected", "bankRefundPaid", "bankRefundCount", "pointsRedeemed", "pointsRedeemedVnd",
        "newMembers", "membersPurchasingMembershipInPeriod", "activeMembersAtPeriodEnd", "capacity", "confirmedCount", "activeHoldCount",
        "availableSeats", "fillRatio", "breakEvenThreshold", "pointsIssued", "managerPointAdjustment", "outstandingPoints"
    };

    public static string For(string column) => column switch
    {
        "bookings" => "Confirmed bookings", "bookedHours" => "Booked hours", "dayPassesSold" => "Day passes sold", "startDate" => "Start date",
        _ => Labels.GetValueOrDefault(column, column)
    };

    public static bool IsNumeric(string column) => column is "bookings" or "bookedHours" or "dayPassesSold" || NumericColumns.Contains(column);

    public static string SourceName(string source) => source switch
    {
        "Rental" => "Hourly court rental",
        "LegacyUnclassified" => "Unclassified revenue",
        _ => source
    };

    public static string ReportTitle(string reportType) => reportType switch
    {
        ReportTypes.CourtBookings => "Court bookings by rental date",
        ReportTypes.ClassStatus => "Classes by start date (current status)",
        ReportTypes.Revenue => "Invoices by issue date",
        ReportTypes.RevenueDaily => "Revenue by collection date",
        ReportTypes.RevenueSummary => "Revenue and points summary",
        ReportTypes.RevenueDimensions => "Revenue by sport and source",
        ReportTypes.CourtRentalRevenue => "Court rental revenue",
        ReportTypes.MembershipPeriod => "Membership by period",
        ReportTypes.ClassEnrollment => "Course enrollment",
        ReportTypes.MemberSummary => "Member summary",
        _ => reportType
    };
}
