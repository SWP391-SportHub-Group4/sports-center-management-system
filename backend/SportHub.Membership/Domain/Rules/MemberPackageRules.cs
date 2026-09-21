using SportHub.BuildingBlocks.SharedKernel.Time;

namespace SportHub.Membership.Domain.Rules;

/// <summary>
/// Quy tắc vòng đời gói của hội viên — BR-9 (điều kiện còn hiệu lực), BR-11 (tự hết hạn),
/// BR-18 (hoàn lượt khi huỷ đúng hạn).
///
/// Đặt ở Domain để Scheduling (đăng ký lớp, BR-16) và Payment (kích hoạt sau khi thu đủ,
/// BR-30) dùng chung đúng một định nghĩa — hai nơi tự viết lại điều kiện là cách chắc chắn
/// để chúng lệch nhau.
/// </summary>
public static class MemberPackageRules
{
    /// <summary>
    /// BR-9 — gói dùng được khi Status = Active VÀ còn trong khoảng ngày VÀ còn buổi
    /// (nếu gói có giới hạn buổi).
    ///
    /// Ngày biên tính theo giờ VN (SSOT §5.3, quyết định C4): còn hiệu lực khi
    /// StartDate &lt;= hôm nay &lt;= EndDate — cả hai đầu ĐỀU đóng, ngày cuối vẫn tập được.
    /// </summary>
    public static bool IsUsable(MemberPackage package, DateOnly todayLocal)
        => package.Status == MemberPackageStatus.Active
           && package.StartDate <= todayLocal
           && todayLocal <= package.EndDate
           && package.RemainingSessions is null or > 0;

    /// <summary>
    /// BR-11 — điều kiện để chuyển Active sang Expired: quá EndDate HOẶC hết buổi,
    /// tuỳ điều kiện nào đến trước.
    ///
    /// Lưu ý BR-64 (Gym check-in) chỉ xét Status = Active và cố tình KHÔNG lặp lại điều kiện
    /// này — việc chuyển trạng thái là việc của BR-11, không nhân bản vào rule check-in.
    /// </summary>
    public static bool ShouldExpire(MemberPackage package, DateOnly todayLocal)
        => package.Status == MemberPackageStatus.Active
           && (todayLocal > package.EndDate || package.RemainingSessions == 0);

    /// <summary>
    /// Trừ một lượt khi đăng ký lớp (BR-16). Trả về false nếu không trừ được — caller phải
    /// coi đó là từ chối đăng ký, không được đăng ký "chịu nợ".
    /// Gói không giới hạn buổi (RemainingSessions = null) luôn trừ thành công mà không đổi gì.
    /// </summary>
    public static bool TryConsumeSession(MemberPackage package, DateOnly todayLocal)
    {
        if (!IsUsable(package, todayLocal))
        {
            return false;
        }

        if (package.RemainingSessions is null)
        {
            return true;
        }

        package.RemainingSessions -= 1;

        // BR-11 — hết buổi thì hết hạn ngay, không đợi job chạy: nếu đợi, member vẫn đăng ký
        // được buổi tiếp theo trong khoảng thời gian giữa hai lần job chạy.
        if (package.RemainingSessions == 0)
        {
            package.Status = MemberPackageStatus.Expired;
        }

        return true;
    }

    /// <summary>
    /// Hoàn một lượt (BR-18 khi huỷ đúng hạn, BR-54 khi trung tâm huỷ/dời buổi).
    ///
    /// Nhánh Expired → Active: gói vừa Expired CHỈ vì hết buổi mà vẫn còn hạn thì được mở lại.
    /// Đây là state transition CHƯA có trong SSOT §4 — xem implementation-decisions.md C2
    /// (CẦN DUYỆT). Không tự gia hạn EndDate: gói hết hạn theo ngày thì lượt được cộng lại
    /// nhưng vẫn không dùng được, và gói đã Cancelled cũng không được hồi sinh.
    /// </summary>
    public static void RestoreSession(MemberPackage package, DateOnly todayLocal)
    {
        if (package.RemainingSessions is null)
        {
            return;
        }

        package.RemainingSessions += 1;

        if (package.Status == MemberPackageStatus.Expired && todayLocal <= package.EndDate)
        {
            package.Status = MemberPackageStatus.Active;
        }
    }

    /// <summary>
    /// Ngày bắt đầu/kết thúc khi gói được kích hoạt sau khi hoá đơn thanh toán đủ (BR-30).
    /// EndDate = StartDate + DurationDays - 1 để đúng "gói N ngày" tính cả ngày đầu
    /// (quyết định C4 — CẦN DUYỆT, BR không nêu).
    /// </summary>
    public static (DateOnly StartDate, DateOnly EndDate) ComputePeriod(DateOnly startLocal, int durationDays)
        => (startLocal, startLocal.AddDays(Math.Max(durationDays, 1) - 1));

    public static DateOnly Today(IClock clock) => VietnamTime.TodayLocal(clock);
}
