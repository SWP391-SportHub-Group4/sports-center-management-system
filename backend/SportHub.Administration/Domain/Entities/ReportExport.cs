using SportHub.Identity.Domain.Entities;

namespace SportHub.Administration.Domain.Entities;

public class ReportExport
{
    public Guid ReportExportId { get; set; }

    public string ReportType { get; set; } = string.Empty;

    public Guid RequestedByUserId { get; set; }

    public UserAccount? RequestedByUser { get; set; }

    public string ParametersJson { get; set; } = "{}";

    public string Format { get; set; } = ReportFormats.Csv;

    public ReportExportStatus Status { get; set; }

    public int RowCount { get; set; }

    public long SizeBytes { get; set; }

    public string? FailureReason { get; set; }

    public DateTime CreatedAt { get; set; }

    public DateTime? CompletedAt { get; set; }

    public DateTime ExpiresAt { get; set; }

    public bool IsDeleted { get; set; }

    public DateTime? DeletedAt { get; set; }
}

public static class ReportTypes
{
    public const string Revenue = "REVENUE";
    public const string RevenueDaily = "REVENUE_DAILY";
    public const string RevenueSummary = "REVENUE_SUMMARY";
    public const string RevenueDimensions = "REVENUE_DIMENSIONS";
    public const string CourtRentalRevenue = "COURT_RENTAL_REVENUE";
    public const string MembershipPeriod = "MEMBERSHIP_PERIOD";
    public const string ClassEnrollment = "CLASS_ENROLLMENT";

    public const string MemberSummary = "MEMBER_SUMMARY";

    public static readonly IReadOnlyDictionary<string, IReadOnlyList<string>> AllowedColumns =
        new Dictionary<string, IReadOnlyList<string>>
        {
            [RevenueDaily] =
            [
                "date", "collectedAmount", "refundedAmount", "obligationReduction", "netCollected",
                "legacyCashCollected", "reconciliationCashCollected"
            ],
            [RevenueSummary] = ["fromDate", "toDate", "collectedAmount", "refundedAmount", "netCollected", "legacyCashCollected", "reconciliationCashCollected", "pointsRedeemed", "pointsRedeemedVnd", "pointsIssued", "managerPointAdjustment", "outstandingPoints"],
            [RevenueDimensions] = ["source", "sportId", "sportName", "memberId", "collectedAmount", "legacyCashCollected", "pointsRedeemed", "pointsRedeemedVnd"],
            [CourtRentalRevenue] = ["source", "sportId", "sportName", "memberId", "collectedAmount", "legacyCashCollected", "pointsRedeemed", "pointsRedeemedVnd"],
            [MembershipPeriod] = ["fromDate", "toDate", "newMembers", "activeMembersAtPeriodEnd"],
            [ClassEnrollment] = ["classId", "code", "name", "sportId", "sportName", "status", "capacity", "confirmedCount", "activeHoldCount", "availableSeats", "fillRatio", "breakEvenThreshold", "thresholdStatus", "firstSessionStartUtc"],
            [Revenue] =
            [
                "invoiceNumber", "issuedAt", "memberEmail", "memberName", "totalAmount",
                "collectedAmount", "obligationReduction", "refundedAmount", "netCollected",
                "netPayable", "outstanding", "refundDue", "status"
            ],
            [MemberSummary] =
            [
                "email", "fullName", "phone", "status", "joinedAt",
                "activePackages", "remainingSessions", "totalSpent"
            ]
        };

    public static bool IsKnown(string reportType) => AllowedColumns.ContainsKey(reportType);
}

public static class ReportFormats
{
    public const string Csv = "Csv";

    public const string Pdf = "Pdf";

    public static readonly IReadOnlyList<string> All = [Csv, Pdf];

    public static string? Normalize(string? value)
        => All.FirstOrDefault(f => string.Equals(f, value?.Trim(), StringComparison.OrdinalIgnoreCase));

    public static string Extension(string format)
        => string.Equals(format, Pdf, StringComparison.OrdinalIgnoreCase) ? "pdf" : "csv";

    public static string ContentType(string format)
        => string.Equals(format, Pdf, StringComparison.OrdinalIgnoreCase) ? "application/pdf" : "text/csv";
}
