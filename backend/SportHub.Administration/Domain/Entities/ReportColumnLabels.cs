namespace SportHub.Administration.Domain.Entities;

public static class ReportColumnLabels
{
    private static readonly IReadOnlyDictionary<string, string> Labels =
        new Dictionary<string, string>(StringComparer.Ordinal)
        {
            ["date"] = "Collection date (VN)",
            ["legacyCashCollected"] = "Legacy cash collected",
            ["reconciliationCashCollected"] = "Reconciled/compensated cash",
            ["source"] = "Revenue source",
            ["sportId"] = "Sport ID",
            ["sportName"] = "Sport",
            ["memberId"] = "Member",
            ["pointsRedeemed"] = "Points redeemed",
            ["pointsRedeemedVnd"] = "Point value (VND)",
            ["pointsIssued"] = "Points refunded/compensated",
            ["managerPointAdjustment"] = "Manager point adjustment",
            ["outstandingPoints"] = "Available and held points",
            ["fromDate"] = "From date",
            ["toDate"] = "To date",
            ["newMembers"] = "New members",
            ["activeMembersAtPeriodEnd"] = "Active memberships at period end",
            ["classId"] = "Course ID",
            ["code"] = "Course code",
            ["name"] = "Course name",
            ["capacity"] = "Capacity",
            ["confirmedCount"] = "Confirmed",
            ["activeHoldCount"] = "Active holds",
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
            ["collectedAmount"] = "Collected",
            ["obligationReduction"] = "Obligation reduction",
            ["refundedAmount"] = "Refunded",
            ["netCollected"] = "Net collected",
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
        , "legacyCashCollected", "reconciliationCashCollected", "pointsRedeemed", "pointsRedeemedVnd",
        "newMembers", "activeMembersAtPeriodEnd", "capacity", "confirmedCount", "activeHoldCount",
        "availableSeats", "fillRatio", "breakEvenThreshold", "pointsIssued", "managerPointAdjustment", "outstandingPoints"
    };

    public static string For(string column) => Labels.GetValueOrDefault(column, column);

    public static bool IsNumeric(string column) => NumericColumns.Contains(column);

    public static string ReportTitle(string reportType) => reportType switch
    {
        ReportTypes.Revenue => "Revenue report",
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
