namespace SportHub.Administration.Domain.Entities;

public static class ReportColumnLabels
{
    private static readonly IReadOnlyDictionary<string, string> Labels =
        new Dictionary<string, string>(StringComparer.Ordinal)
        {
            ["date"] = "Ngày thực thu (VN)",
            ["legacyCashCollected"] = "Tiền thu legacy",
            ["reconciliationCashCollected"] = "Tiền đối soát/bồi hoàn",
            ["source"] = "Nguồn thu",
            ["sportId"] = "Mã môn",
            ["sportName"] = "Môn thể thao",
            ["externalCoachId"] = "HLV ngoài",
            ["pointsRedeemed"] = "Điểm đã dùng",
            ["pointsRedeemedVnd"] = "Giá trị điểm (VND)",
            ["pointsIssued"] = "Điểm hoàn/bồi hoàn",
            ["managerPointAdjustment"] = "Điều chỉnh điểm của Manager",
            ["outstandingPoints"] = "Điểm khả dụng và đang giữ",
            ["fromDate"] = "Từ ngày",
            ["toDate"] = "Đến ngày",
            ["newMembers"] = "Hội viên mới",
            ["activeMembersAtPeriodEnd"] = "Hội viên có Membership cuối kỳ",
            ["classId"] = "Mã khóa",
            ["code"] = "Mã khóa học",
            ["name"] = "Tên khóa học",
            ["capacity"] = "Sức chứa",
            ["confirmedCount"] = "Đã xác nhận",
            ["activeHoldCount"] = "Đang giữ chỗ",
            ["availableSeats"] = "Chỗ còn lại",
            ["fillRatio"] = "Tỷ lệ lấp đầy",
            ["breakEvenThreshold"] = "Ngưỡng hòa vốn",
            ["thresholdStatus"] = "Trạng thái ngưỡng",
            ["firstSessionStartUtc"] = "Buổi đầu (UTC)",
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
        , "legacyCashCollected", "reconciliationCashCollected", "pointsRedeemed", "pointsRedeemedVnd",
        "newMembers", "activeMembersAtPeriodEnd", "capacity", "confirmedCount", "activeHoldCount",
        "availableSeats", "fillRatio", "breakEvenThreshold", "pointsIssued", "managerPointAdjustment", "outstandingPoints"
    };

    public static string For(string column) => Labels.GetValueOrDefault(column, column);

    public static bool IsNumeric(string column) => NumericColumns.Contains(column);

    public static string ReportTitle(string reportType) => reportType switch
    {
        ReportTypes.Revenue => "Báo cáo doanh thu",
        ReportTypes.RevenueDaily => "Doanh thu theo ngày thực thu",
        ReportTypes.RevenueSummary => "Tổng hợp doanh thu và điểm",
        ReportTypes.RevenueDimensions => "Doanh thu theo môn và nguồn",
        ReportTypes.CourtRentalRevenue => "Doanh thu thuê sân",
        ReportTypes.MembershipPeriod => "Hội viên theo kỳ",
        ReportTypes.ClassEnrollment => "Sĩ số khóa học",
        ReportTypes.MemberSummary => "Tổng hợp hội viên",
        _ => reportType
    };
}
