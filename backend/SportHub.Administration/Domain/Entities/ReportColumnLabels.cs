namespace SportHub.Administration.Domain.Entities;

/// <summary>
/// Nhãn tiếng Việt và kiểu canh lề cho từng cột báo cáo.
///
/// Chỉ dùng cho PDF. CSV cố tình giữ nguyên tên cột kỹ thuật (camelCase) vì file CSV thường
/// được máy khác đọc lại, còn PDF là để người đọc.
///
/// Nhãn ở đây bám theo các đại lượng BR-41 v1.4: "Đã thu" (gross) khác "Thực thu" (net), và
/// "Cần hoàn" khác "Đã hoàn". Đặt nhãn mơ hồ ở đây sẽ tái tạo đúng sự nhầm lẫn mà v1.4 sửa.
/// </summary>
public static class ReportColumnLabels
{
    private static readonly IReadOnlyDictionary<string, string> Labels =
        new Dictionary<string, string>(StringComparer.Ordinal)
        {
            // REVENUE
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
            ["dueDate"] = "Hạn thanh toán",

            // MEMBER_SUMMARY
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

    /// <summary>Nhãn hiển thị; cột lạ trả về chính tên kỹ thuật thay vì rỗng, để lỗi lộ ra.</summary>
    public static string For(string column) => Labels.GetValueOrDefault(column, column);

    public static bool IsNumeric(string column) => NumericColumns.Contains(column);

    public static string ReportTitle(string reportType) => reportType switch
    {
        ReportTypes.Revenue => "Báo cáo doanh thu",
        ReportTypes.MemberSummary => "Tổng hợp hội viên",
        _ => reportType
    };
}
