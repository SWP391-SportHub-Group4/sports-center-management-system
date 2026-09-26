namespace SportHub.Administration.Domain.Entities;

public static class ReportColumnLabels
{
    private static readonly IReadOnlyDictionary<string, string> Labels =
        new Dictionary<string, string>(StringComparer.Ordinal)
        {
            ["invoiceNumber"] = "Số hóa đơn",
            ["issuedAt"] = "Ngày phát hành",
            ["memberEmail"] = "Email hội viên",
            ["memberName"] = "Tên hội viên",
            ["totalAmount"] = "Tổng tiền",
            ["collectedAmount"] = "Đã thu",
            ["obligationReduction"] = "Giảm nghĩa vụ",
            ["refundedAmount"] = "Đã hoàn",
            ["netCollected"] = "Thực thu",
            ["netPayable"] = "Nghĩa vụ",
            ["outstanding"] = "Còn phải thu",
            ["refundDue"] = "Cần hoàn",
            ["status"] = "Trạng thái",

            ["email"] = "Email",
            ["fullName"] = "Họ tên",
            ["phone"] = "Điện thoại",
            ["joinedAt"] = "Ngày tham gia",
            ["activePackages"] = "Gói đang hoạt động",
            ["remainingSessions"] = "Buổi còn lại",
            ["totalSpent"] = "Tổng chi tiêu"
        };

    private static readonly IReadOnlySet<string> NumericColumns = new HashSet<string>(StringComparer.Ordinal)
    {
        "totalAmount", "collectedAmount", "obligationReduction", "refundedAmount",
        "netCollected", "netPayable", "outstanding", "refundDue",
        "activePackages", "remainingSessions", "totalSpent"
    };

    public static string For(string column) => Labels.GetValueOrDefault(column, column);

    public static bool IsNumeric(string column) => NumericColumns.Contains(column);

    public static string ReportTitle(string reportType) => reportType switch
    {
        ReportTypes.Revenue => "Báo cáo doanh thu",
        ReportTypes.MemberSummary => "Tổng hợp hội viên",
        _ => reportType
    };
}
