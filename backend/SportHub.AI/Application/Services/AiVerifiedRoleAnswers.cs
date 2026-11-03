using System.Globalization;
using System.Text;
using System.Text.RegularExpressions;
using Microsoft.EntityFrameworkCore;
using SportHub.BuildingBlocks.Abstractions.Persistence;
using SportHub.Scheduling.Catalog.Domain;
using SportHub.Scheduling.Domain.Entities;
using SportHub.Scheduling.Domain.Enums;

namespace SportHub.AI.Application.Services;

// Deterministic, read-only answers for audited Member/Coach workflows.
// Do not use this class for arbitrary SQL or staff-only API access.
internal static class AiVerifiedRoleAnswers
{
    private static string Normalize(string value)
    {
        var buffer = new StringBuilder();
        foreach (var ch in (value ?? string.Empty).Normalize(NormalizationForm.FormD))
        {
            if (CharUnicodeInfo.GetUnicodeCategory(ch) == UnicodeCategory.NonSpacingMark) continue;
            buffer.Append(ch is 'đ' or 'Đ' ? 'd' : char.ToLowerInvariant(ch));
        }
        return Regex.Replace(buffer.ToString().Normalize(NormalizationForm.FormC), @"[^a-z0-9]+", " ").Trim();
    }

    private static bool Has(string q, string phrase) =>
        (" " + q + " ").Contains(" " + phrase + " ", StringComparison.Ordinal);
    private static bool Any(string q, params string[] phrases) => phrases.Any(p => Has(q, p));
    private static bool AboutNavigation(string q) => Any(q, "o dau", "nut", "cach", "lam sao", "huong dan", "where", "how", "button", "thuc hien", "vao dau", "cap nhat", "doi", "them", "upload");

    internal static async Task<string?> TryAnswerAsync(
        ISportHubDbContext db, Guid userId, string role, string question,
        DateTime nowUtc, CancellationToken cancellationToken)
    {
        if (role is not ("coach" or "member")) return null;
        var q = Normalize(question);

        // Verified UI source: frontend/src/app/account/page.tsx,
        // features/identity/avatar-editor.tsx,
        // components/coach-credentials/coach-credentials.tsx.
        var avatar = Any(q, "avatar", "anh dai dien", "anh ca nhan");
        var credential = Any(q, "chung chi", "bang cap", "chung nhan", "certificate", "certificates", "award", "giai thuong");
        if (AboutNavigation(q) && (avatar || credential))
        {
            var instructions = new List<string>();
            if (avatar)
                instructions.Add("Ảnh đại diện: mở menu tài khoản ở góc trên → Account (/account) → Personal Information → Browse → chọn và điều chỉnh ảnh → Save avatar.");
            if (credential && role == "coach")
                instructions.Add("Chứng chỉ/giải thưởng: Account (/account) → Certificates & awards → Add document. Điền thông tin và tải ảnh/PDF theo hướng dẫn trên form.");
            if (credential && role == "member")
                instructions.Add("Mục Certificates & awards của Coach không phải tính năng Member; không có căn cứ xác nhận Member có chức năng tải chứng chỉ tại đây.");
            return string.Join("\n", instructions);
        }

        // Verified Member UI: /member/services, /member/courses, member-course-detail.tsx.
        if (role == "member" && AboutNavigation(q) && Any(q, "dang ky lop", "ghi danh", "enroll", "register", "tham gia lop", "chon lop"))
            return "Để đăng ký lớp: mở Services → Explore packages → Class (hoặc danh sách Courses) → chọn lớp → mở chi tiết → Register for this course. Hoàn tất checkout theo điều kiện hiển thị. Wolf chỉ hướng dẫn, không tự ghi danh hoặc thanh toán.";
        if (role == "member" && AboutNavigation(q) && Any(q, "membership", "chon goi", "mua goi", "goi tap", "package"))
            return "Mở Services (/member/services) → Explore packages → chọn loại gói phù hợp → Select. Kiểm tra chi tiết, điều kiện áp dụng và thanh toán trong giao diện. Wolf không tự mua gói.";

        // Coach schedules must use real assigned sessions rather than a 14-day
        // snapshot; no future session is distinct from no assigned classes.
        if (role == "coach" && Any(q, "lich day", "buoi day", "lop day", "teaching schedule", "next session", "next class") &&
            Any(q, "gan nhat", "tiep theo", "sap toi", "khi nao", "next", "upcoming", "lich day"))
        {
            var session = await db.Set<ClassSession>().AsNoTracking()
                .Where(s => s.CoachId == userId && s.StartAtUtc >= nowUtc && s.Status == ClassSessionStatus.Scheduled)
                .OrderBy(s => s.StartAtUtc)
                .Select(s => new { s.ClassId, s.StartAtUtc, s.EndAtUtc,
                    ClassName = s.Class != null ? s.Class.Name : null,
                    RoomName = s.Room != null ? s.Room.Name : null })
                .FirstOrDefaultAsync(cancellationToken);
            if (session is not null)
            {
                var local = TimeZoneInfo.ConvertTimeFromUtc(DateTime.SpecifyKind(session.StartAtUtc, DateTimeKind.Utc), VietnamTimeZone());
                return $"Buổi dạy sắp tới gần nhất: {session.ClassName ?? "Lớp " + session.ClassId} — {local:dd/MM/yyyy HH:mm} (giờ Việt Nam)." +
                    (string.IsNullOrWhiteSpace(session.RoomName) ? "" : $" Phòng: {session.RoomName}.") +
                    " Bạn có thể đối chiếu tại Schedule (/coach/schedule).";
            }
            var hasAssignedClass = await db.Set<Class>().AsNoTracking()
                .AnyAsync(c => c.CoachId == userId &&
                    (c.Status == ClassStatus.Published || c.Status == ClassStatus.InProgress), cancellationToken);
            return hasAssignedClass
                ? "Bạn có lớp đang được phân công, nhưng hiện không tìm thấy buổi dạy Scheduled nào sau thời điểm truy vấn. Kiểm tra Schedule để xem buổi đã hoàn tất, bị hủy hoặc được đổi lịch."
                : "Không tìm thấy lớp Published/InProgress được phân công hoặc buổi Scheduled sắp tới trong phạm vi tài khoản Coach đang đăng nhập. Điều này không khẳng định tài khoản chưa từng dạy lớp.";
        }

        // Real catalog lookup. Published and EnrollmentOpen are observable
        // database flags; do not confuse with membership plans or sports count.
        if (role == "member" && Any(q, "bao nhieu lop", "so lop", "how many classes", "how many courses") &&
            Any(q, "dang mo", "mo dang ky", "enrollment", "open", "hien co", "trung tam"))
        {
            var count = await db.Set<Class>().AsNoTracking()
                .CountAsync(c => c.Status == ClassStatus.Published && c.EnrollmentOpen, cancellationToken);
            return $"Hiện có {count} lớp ở trạng thái Published và đang mở ghi danh (EnrollmentOpen=true) trong dữ liệu hệ thống. Đây là số lớp, không phải số môn thể thao hay gói membership. Xem Services → Class để kiểm tra điều kiện đăng ký và chỗ trống.";
        }
        if (role == "member" && Any(q, "mon the thao", "sports", "sport") &&
            Any(q, "bao nhieu", "so luong", "nhung mon", "co mon", "how many", "which", "danh sach"))
        {
            var names = await db.Set<Sport>().AsNoTracking().Where(s => s.IsActive)
                .OrderBy(s => s.SortOrder).ThenBy(s => s.Name).Select(s => s.Name)
                .Take(100).ToListAsync(cancellationToken);
            return $"Danh mục hiện có {names.Count} môn thể thao đang hoạt động" +
                (names.Count == 0 ? "." : ": " + string.Join(", ", names) + (names.Count == 100 ? ". (Đã giới hạn 100 mục.)" : "."));
        }
        return null;
    }

    private static TimeZoneInfo VietnamTimeZone()
    {
        try { return TimeZoneInfo.FindSystemTimeZoneById("Asia/Ho_Chi_Minh"); }
        catch (TimeZoneNotFoundException) { return TimeZoneInfo.FindSystemTimeZoneById("SE Asia Standard Time"); }
    }
}
