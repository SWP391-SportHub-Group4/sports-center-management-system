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

    public const string MemberSummary = "MEMBER_SUMMARY";

    public static readonly IReadOnlyDictionary<string, IReadOnlyList<string>> AllowedColumns =
        new Dictionary<string, IReadOnlyList<string>>
        {
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
