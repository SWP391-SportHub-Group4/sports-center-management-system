using System.Diagnostics;
using System.Globalization;
using System.Text;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using SportHub.AI.Application.DTOs.Chat;
using SportHub.AI.Domain.Constants;
using SportHub.BuildingBlocks.Abstractions.Persistence;
using SportHub.BuildingBlocks.SharedKernel.Time;
using SportHub.Identity.Domain.Entities;
using SportHub.Identity.Domain.Enums;
using SportHub.Membership.Domain.Entities;
using SportHub.Membership.Domain.Enums;
using SportHub.Scheduling.Domain.Entities;
using SportHub.Scheduling.Domain.Enums;
using SportHub.Scheduling.Catalog.Domain;
using SportHub.Scheduling.Rental.Domain;
using SportHub.Notification.Domain.Enums;
using SportHub.Payment.Wallet.Domain;
using MemberNotificationEntity = SportHub.Notification.Domain.Entities.Notification;

namespace SportHub.AI.Application.Services;

/// <summary>
/// MEMBER_OVERVIEW_V15. A narrowly scoped, deterministic, read-only Member Overview answer layer.
/// No Coach or AI Plan dependencies; unknown/complex questions fall through to v13/v14 + Gemini.
/// Data is always queried under the authenticated Member ID; nothing is taken from screenshot literals.
/// </summary>
internal static class MemberOverviewAnswers
{
    private static readonly TimeSpan VietnamOffset = TimeSpan.FromHours(7);
    private static string N(string raw)
    {
        var decomposed = (raw ?? "").Normalize(NormalizationForm.FormD);
        var b = new StringBuilder(decomposed.Length);
        foreach (var c in decomposed)
            if (CharUnicodeInfo.GetUnicodeCategory(c) != UnicodeCategory.NonSpacingMark)
                b.Append(c is 'đ' or 'Đ' ? 'd' : char.ToLowerInvariant(c));
        return b.ToString().Normalize(NormalizationForm.FormC);
    }
    private static bool Has(string s, params string[] terms) => terms.Any(t => s.Contains(t, StringComparison.Ordinal));
    private static string Vnd(decimal v) => v.ToString("N0", CultureInfo.GetCultureInfo("vi-VN")) + " ₫";
    private static string Date(DateOnly d) => d.ToString("dd/MM/yyyy", CultureInfo.InvariantCulture);

    internal static string ClassifyForTests(string question)
    {
        var q = N(question);
        if (Has(q, "o dau", "vao dau", "lam sao", "cach ", "how to", "where", "button", "nut ", "dang ky", "register", "book a court", "join a class", "renew gym", "choose a gym", "explore courses", "gym services", "see all", "update your measurements", "xem tat ca")) return "navigation";
        if (Has(q, "thong bao", "notification", "unread", "chuong")) return "notification";
        if (Has(q, "recommended", "goi y", "badminton", "basketball", "khoa nao", "lop nao", "gia lop", "hoc phi", "cho trong", "seats left")) return "courses";
        if (Has(q, "training summary", "tien do", "target", "muc tieu thang", "hoan thanh bao nhieu", "court rental", "thue san da", "con thieu bao nhieu buoi")) return "training";
        if (Has(q, "fitness profile", "bmi", "chieu cao", "can nang", "muc tieu tap", "muscle gain")) return "fitness";
        if (Has(q, "membership", "goi gym", "goi tap", "gym membership")) return "membership";
        if (Has(q, "diem cua toi", "bao nhieu diem", "points", "so diem")) return "points";
        if (Has(q, "ten toi", "ten cua toi", "my name", "hom nay ngay", "ngay hom nay", "today date")) return "identity";
        if (Has(q, "overview", "tong quan", "tong ket trang chu")) return "summary";
        return "legacy";
    }

    private static string? Navigation(string q)
    {
        if (Has(q, "thong bao", "chuong", "notification", "unread"))
            return "Trên thanh điều hướng, chọn biểu tượng chuông để mở Notifications. Bạn có thể xem thông báo trong danh sách; việc đánh dấu đã đọc cần thực hiện trên giao diện.";
        if (Has(q, "book a court", "dat san", "thue san"))
            return "Trên Overview chọn **Book a court**, hoặc mở **Services → Courts**. Trang khám phá sân: /member/services?section=courts&view=explore. Việc đặt sân phụ thuộc suất trống và bước xác nhận của giao diện.";
        if (Has(q, "join a class", "explore courses", "register now", "dang ky lop", "dang ky khoa", "see all", "xem tat ca", "lop hoc"))
            return "Trên Overview chọn **Join a class**, **Explore courses**, **See all** hoặc **Register now** trên thẻ lớp. Các nút này dẫn tới danh sách lớp: /member/services?section=courses&view=explore. Chọn lớp và hoàn tất quy trình đăng ký ở đó; **Register now** trên Overview không tự ghi danh ngay.";
        if (Has(q, "renew gym", "choose a gym", "membership", "gia han", "mua goi", "chon goi", "gym services"))
            return "Trên Overview chọn **Renew Gym membership**, **Choose a Gym membership** hoặc **Gym services** để mở /member/services?section=gym&view=explore. Nếu chưa có gói, cần chọn mua gói trước; không thể giả định đã có gói để gia hạn.";
        if (Has(q, "measurement", "fitness", "bmi", "can nang", "chieu cao", "profile"))
            return "Trên Overview, ở thẻ **Fitness profile**, chọn **Update your measurements**. Hoặc mở **Training → Fitness profile**: /member/training?tab=profile.";
        if (Has(q, "schedule", "lich", "buoi tap"))
            return "Chọn **My schedule** trên thanh điều hướng hoặc ở thẻ **Training summary**: /member/schedule.";
        return null;
    }

    internal static async Task<AiChatResponse?> TryAnswerAsync(
        ISportHubDbContext db, IClock clock, Guid authenticatedUserId,
        string question, CancellationToken ct)
    {
        using var readBudget = CancellationTokenSource.CreateLinkedTokenSource(ct);
        readBudget.CancelAfter(TimeSpan.FromSeconds(12));
        ct = readBudget.Token;
        var intent = ClassifyForTests(question);
        if (intent == "legacy") return null;
        if (authenticatedUserId == Guid.Empty) return null;
        var isMember = await db.Set<UserAccount>().AsNoTracking()
            .AnyAsync(u => u.UserId == authenticatedUserId && u.Role != null &&
                u.Role.RoleName == UserRole.Member, ct);
        if (!isMember) return null;
        var watch = Stopwatch.StartNew();
        var q = N(question);
        var navRequested = Has(q, "o dau", "vao dau", "lam sao", "cach ", "how to", "where", "button", "nut ", "nhan vao", "click", "di den", "mo trang", "huong dan", "see all", "xem tat ca", "register now", "book a court", "join a class", "renew gym", "choose a gym", "explore courses", "gym services", "update your measurements", "dang ky", "gia han");
        string? response = navRequested ? Navigation(q) : null;
        if (response == null && intent == "navigation") return null;

        if (response == null && intent == "notification")
        {
            // Read totals from backend, never from screenshot badge. Analysis/importance stays with Member v13 Gemini.
            if (Has(q, "quan trong", "uu tien", "noi dung", "moi nhat", "gan nhat", "tom tat", "vi sao")) return null;
            var n = db.Set<MemberNotificationEntity>().AsNoTracking()
                .Where(x => x.UserId == authenticatedUserId && x.Channel == NotificationChannel.InApp);
            var all = await n.CountAsync(ct);
            var unread = await n.CountAsync(x => x.Status != NotificationStatus.Read, ct);
            response = Has(q, "da doc") ? $"Bạn có {all - unread} thông báo đã đọc (trong {all} thông báo in-app)." :
                Has(q, "tong", "tat ca", "nhan bao nhieu") ? $"Bạn có {all} thông báo in-app; {unread} thông báo chưa đọc." :
                $"Bạn có {unread} thông báo in-app chưa đọc. Tổng cộng {all} thông báo.";
        }
        if (response == null && intent == "identity")
        {
            if (Has(q, "ngay", "date", "hom nay"))
            {
                var vn = new DateTimeOffset(clock.UtcNow, TimeSpan.Zero).ToOffset(VietnamOffset);
                response = "Ngày hiện tại theo giờ Việt Nam: " + vn.ToString("dddd, dd/MM/yyyy", new CultureInfo("vi-VN")) + ".";
            }
            else
            {
                var name = await db.Set<UserAccount>().AsNoTracking().Where(x => x.UserId == authenticatedUserId)
                    .Select(x => x.Profile != null ? x.Profile.FullName : null).SingleOrDefaultAsync(ct);
                response = string.IsNullOrWhiteSpace(name) ? "Tài khoản chưa có tên hồ sơ được xác nhận." : $"Tên hồ sơ của bạn là {name}.";
            }
        }
        if (response == null && intent == "points")
        {
            var wallet = await db.Set<PointWallet>().AsNoTracking()
                .Where(x => x.OwnerUserId == authenticatedUserId)
                .Select(x => new { x.AvailablePoints, x.HeldPoints }).SingleOrDefaultAsync(ct);
            response = wallet == null ? "Chưa tìm thấy ví điểm của tài khoản; không thể xác nhận số dư." :
                $"Bạn có {wallet.AvailablePoints} điểm khả dụng và {wallet.HeldPoints} điểm đang giữ.";
        }
        if (response == null && intent == "membership")
        {
            var packages = await db.Set<MemberPackage>().AsNoTracking()
                .Where(x => x.MemberId == authenticatedUserId).OrderByDescending(x => x.EndDate).Take(15)
                .Select(x => new { name = x.Package != null ? x.Package.Name : null, x.Status, x.StartDate, x.EndDate, x.ExpiresAtUtc })
                .ToListAsync(ct);
            var current = packages.Where(x => x.Status == MemberPackageStatus.Active && x.EndDate >= DateOnly.FromDateTime(clock.UtcNow.AddHours(7)) &&
                (!x.ExpiresAtUtc.HasValue || x.ExpiresAtUtc.Value >= clock.UtcNow)).ToList();
            response = current.Count == 0 ? "Không tìm thấy Gym membership đang còn hiệu lực trong hồ sơ gói tập của bạn. Bạn có thể chọn **Choose a Gym membership** ở Overview." :
                "Gói membership đang còn hiệu lực: " + string.Join("; ", current.Select(x => $"{x.name ?? "(chưa có tên)"} — đến {Date(x.EndDate)}")) + ".";
        }
        if (response == null && intent == "fitness")
        {
            var p = await db.Set<MemberTrainingProfile>().AsNoTracking().Where(x => x.MemberId == authenticatedUserId)
                .Select(x => new { x.HeightCm, x.WeightKg, x.Goal, x.GoalType, x.TrainingDaysPerWeek }).SingleOrDefaultAsync(ct);
            if (p == null) response = "Bạn chưa thiết lập Fitness profile. Mở Training → Fitness profile để cập nhật.";
            else
            {
                decimal? bmi = p.HeightCm is > 0 && p.WeightKg is > 0 ?
                    Math.Round(p.WeightKg.Value / ((p.HeightCm.Value / 100m) * (p.HeightCm.Value / 100m)), 1, MidpointRounding.AwayFromZero) : null;
                response = $"Fitness profile: BMI {(bmi.HasValue ? bmi.Value.ToString("0.0", CultureInfo.InvariantCulture) : "chưa đủ dữ liệu")}; " +
                    $"mục tiêu {p.GoalType?.ToString() ?? p.Goal ?? "chưa xác định"}; " +
                    $"số ngày tập/tuần {(p.TrainingDaysPerWeek.HasValue ? p.TrainingDaysPerWeek.Value.ToString() : "chưa thiết lập")}. " +
                    "BMI dựa trên thông số tự khai, không phải chẩn đoán. Chọn **Update your measurements** để thay đổi.";
            }
        }
        if (response == null && intent == "training")
        {
            // UI TrainingSummaryCard uses PRESENT class sessions + COMPLETED court rentals during local month.
            var vnNow = new DateTimeOffset(clock.UtcNow, TimeSpan.Zero).ToOffset(VietnamOffset);
            var startVn = new DateTimeOffset(vnNow.Year, vnNow.Month, 1, 0, 0, 0, VietnamOffset);
            var startUtc = startVn.UtcDateTime;
            var endUtc = startVn.AddMonths(1).UtcDateTime;
            var enrollments = db.Set<Enrollment>().AsNoTracking()
                .Where(x => x.MemberId == authenticatedUserId).Select(x => x.EnrollmentId);
            var attended = await db.Set<Attendance>().AsNoTracking()
                .CountAsync(x => enrollments.Contains(x.EnrollmentId) &&
                    x.Session != null && x.Session.StartAtUtc >= startUtc && x.Session.StartAtUtc < endUtc &&
                    x.Status == AttendanceStatus.Present, ct);
            var rentals = await db.Set<CourtRental>().AsNoTracking()
                .CountAsync(x => x.MemberId == authenticatedUserId && x.StartAtUtc >= startUtc &&
                    x.StartAtUtc < endUtc && x.Status == CourtRentalStatus.Completed, ct);
            var weekly = await db.Set<MemberTrainingProfile>().AsNoTracking()
                .Where(x => x.MemberId == authenticatedUserId).Select(x => x.TrainingDaysPerWeek).SingleOrDefaultAsync(ct);
            var done = attended + rentals;
            if (!weekly.HasValue || weekly.Value <= 0)
                response = $"Tháng {vnNow:MM/yyyy}: {attended} buổi lớp có mặt, {rentals} lượt thuê sân hoàn thành, tổng {done}. Chưa có mục tiêu tháng vì Training days/week chưa được thiết lập.";
            else
            {
                var target = weekly.Value * 4;
                var percent = target > 0 ? Math.Min(100, (int)Math.Round((double)done / target * 100, MidpointRounding.AwayFromZero)) : 0;
                response = $"Training summary tháng {vnNow:MM/yyyy}: {attended} buổi lớp có mặt + {rentals} lượt thuê sân hoàn thành = {done} buổi. " +
                    $"Mục tiêu {target} buổi (= {weekly.Value} ngày/tuần × 4 tuần). Tiến độ {percent}%. " +
                    $"Còn thiếu {Math.Max(0, target - done)} buổi để đạt mục tiêu. Gym check-ins không được cộng vào chỉ số này của giao diện.";
            }
        }
        if (response == null && intent == "courses")
        {
            // Prefer existing v13 Catalog/Gemini for ambiguous/complex recommendations.
            if (Has(q, "phu hop", "nen chon", "vi sao", "danh gia", "tu van")) return null;
            var qClasses = db.Set<Class>().AsNoTracking().Where(x => x.EnrollmentOpen &&
                (x.Status == ClassStatus.Published || x.Status == ClassStatus.InProgress));
            var cls = await qClasses.OrderBy(x => x.StartDate).Take(70)
                .Select(x => new { x.Name, x.Code, x.Price, x.StartDate, x.Capacity, x.ReservedCount,
                    sport = x.Sport != null ? x.Sport.Name : null })
                .ToListAsync(ct);
            var available = cls.Where(x => x.Capacity > x.ReservedCount).ToList();
            if (available.Count == 0) response = "Không tìm thấy lớp đang mở ghi danh và còn chỗ trong phạm vi danh mục đã truy vấn.";
            else
            {
                var named = available.Where(x => N(x.Name).Contains("badminton") && Has(q, "badminton") ||
                    N(x.Name).Contains("basketball") && Has(q, "basketball") ||
                    N(x.Code).Contains("badminton") && Has(q, "badminton") ||
                    N(x.Code).Contains("basketball") && Has(q, "basketball")).ToList();
                var comparisonRequested = Has(q, "chenh lech", "re hon", "dat hon", "so sanh", "gia trung binh", "tong cho", "con nhieu cho");
                if (comparisonRequested && named.Count != 2)
                {
                    response = "Để so sánh chính xác, vui lòng nêu tên hai lớp cụ thể. Tôi không tự chọn hai lớp đầu trong danh mục vì chúng có thể không phải hai lớp Recommended for you đang hiển thị.";
                }
                else
                {
                var items = named.Count > 0 ? named : available.Take(10).ToList();
                var lines = items.Select(x => $"{x.Name} ({x.Code}): {Vnd(x.Price)}, bắt đầu {Date(x.StartDate)}, còn {Math.Max(0, x.Capacity - x.ReservedCount)} chỗ").ToList();
                response = "Dữ liệu lớp đang mở theo backend:\n" + string.Join("\n", lines);
                if (items.Count == 2 && comparisonRequested)
                {
                    var a = items[0]; var b = items[1];
                    response += $"\nSo sánh hai lớp đầu: chênh lệch học phí {Vnd(Math.Abs(a.Price-b.Price))}; " +
                        $"tổng chỗ trống {Math.Max(0,a.Capacity-a.ReservedCount)+Math.Max(0,b.Capacity-b.ReservedCount)}; " +
                        $"giá trung bình {Vnd((a.Price+b.Price)/2m)}.";
                }
                response += "\nLưu ý: danh sách này là các lớp đang mở, không nhất thiết trùng 2 thẻ Recommended for you của UI (UI còn ưu tiên môn yêu thích và lọc theo thời điểm). Giá/chỗ trống có thể thay đổi.";
                }
            }
        }
        if (response == null) return null;
        watch.Stop();
        // No database mutations. This handler intentionally does not log health/financial outputs.
        return new AiChatResponse(Guid.Empty, "member-overview-v15", question, response,
            "member-overview-verified", "backend-read-only", "member-overview-v15",
            (int)Math.Min(int.MaxValue, watch.ElapsedMilliseconds), clock.UtcNow);
    }
}
