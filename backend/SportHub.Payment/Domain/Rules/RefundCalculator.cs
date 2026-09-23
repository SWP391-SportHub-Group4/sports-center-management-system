using SportHub.Membership.Domain.Entities;

namespace SportHub.Payment.Domain.Rules;

/// <summary>
/// Số tiền hoàn MẶC ĐỊNH khi tạo yêu cầu điều chỉnh loại Refund (BR-52).
///
/// Chỉ là GỢI Ý: BR-52 cho Center Manager ghi đè khi phê duyệt, nên giá trị ở đây không bao
/// giờ là quyết định cuối cùng.
/// </summary>
public static class RefundCalculator
{
    /// <summary>
    /// Tỷ lệ phân bổ của TotalAmount theo phần chưa dùng:
    /// - gói giới hạn buổi → theo RemainingSessions / SessionLimit
    /// - gói theo thời hạn → theo số ngày còn lại / DurationDays
    ///
    /// Làm tròn XUỐNG về đồng (VND là số nguyên, SSOT §5.2): trung tâm không hoàn nhiều hơn
    /// phần tính được. Cách làm tròn và mốc "hôm nay" là đề xuất, BR-52 không nêu (quyết định C1).
    ///
    /// Hoá đơn không gắn gói nào (MemberPackage = null, vd phí phạt) không có cơ sở phân bổ —
    /// trả 0 và để Manager tự nhập, thay vì đoán một con số.
    /// </summary>
    public static decimal SuggestDefault(
        decimal invoiceTotal,
        MemberPackage? memberPackage,
        MembershipPackage? catalogPackage,
        DateOnly todayLocal)
    {
        if (memberPackage is null || catalogPackage is null || invoiceTotal <= 0m)
        {
            return 0m;
        }

        if (catalogPackage.SessionLimit is > 0)
        {
            var remaining = Math.Clamp(memberPackage.RemainingSessions ?? 0, 0, catalogPackage.SessionLimit.Value);

            return decimal.Floor(invoiceTotal * remaining / catalogPackage.SessionLimit.Value);
        }

        var totalDays = Math.Max(catalogPackage.DurationDays, 1);

        // DayNumber hiệu nhau cho số ngày nguyên; kẹp ở [0, totalDays] để gói đã quá hạn
        // không sinh số âm và gói chưa bắt đầu không hoàn nhiều hơn 100%.
        var remainingDays = Math.Clamp(memberPackage.EndDate.DayNumber - todayLocal.DayNumber, 0, totalDays);

        return decimal.Floor(invoiceTotal * remainingDays / totalDays);
    }
}
