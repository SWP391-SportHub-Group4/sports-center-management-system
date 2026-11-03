using System.Globalization;
using System.Text;
using System.Text.RegularExpressions;
using Microsoft.EntityFrameworkCore;
using SportHub.BuildingBlocks.Abstractions.Persistence;
using SportHub.Identity.Domain.Entities;
using SportHub.Membership.Domain.Entities;
using SportHub.Scheduling.Application.Services;
using SportHub.Scheduling.Domain.Entities;

namespace SportHub.AI.Application.Services;

/// <summary>
/// Coach-only, read-only answers for verified class facts and student fitness profiles.
/// Every lookup uses the authenticated Coach ID and live EF Core queries.
/// Never called for Member chat or by AI Plan generation.
/// </summary>
internal static class CoachClassStudentKnowledge
{
    private static string Norm(string? value)
    {
        var input = (value ?? "").Normalize(NormalizationForm.FormD);
        var sb = new StringBuilder(input.Length);
        foreach (char c in input)
        {
            if (CharUnicodeInfo.GetUnicodeCategory(c) != UnicodeCategory.NonSpacingMark)
                sb.Append(c is 'đ' or 'Đ' ? 'd' : char.ToLowerInvariant(c));
        }
        return Regex.Replace(sb.ToString().Normalize(NormalizationForm.FormC), "[^a-z0-9]+", " ").Trim();
    }

    private static bool Any(string text, params string[] terms) => terms.Any(text.Contains);
    private static bool Vietnamese(string input) =>
        Regex.IsMatch(input, "[À-ỹà-ỹđĐ]") || Any(Norm(input), "lop", "hoc vien", "si so", "giao trinh", "so buoi", "hoc phi", "thong bao", "cho trong", "suc khoe", "can nang", "chieu cao", "muc tieu", "ban than", "the luc");

    private sealed record AssignedClass(int Id, string Name, string Code, string Sport, string Room,
        string Status, int Capacity, int ReservedCount, int ConfirmedCount, int NumSessions,
        decimal Price, bool EnrollmentOpen, DateOnly StartDate);
    private sealed record MemberName(Guid MemberId, string Name);

    internal static async Task<string?> TryAnswerAsync(ISportHubDbContext db, Guid coachId,
        string question, CancellationToken ct)
    {
        var q = Norm(question);
        var vi = Vietnamese(question);
        var health = Any(q, "fitness", "health profile", "ho so suc khoe", "ho so the luc", "chi so co the", "bmi", "can nang", "chieu cao", "muc tieu tap", "training profile", "the trang", "di ung", "han che", "che do an", "tan suat tap");
        var notices = Any(q, "class notice", "class notices", "send notice", "thong bao lop", "gui thong bao", "thong bao cho lop", "notice o dau", "nhac nho lop");
        var classes = Any(q, "lop", "class", "course", "badminton", "basketball", "gym", "seat", "cho trong", "si so", "hoc phi", "registration", "ghi danh", "enrollment", "so buoi", "phong", "san", "room", "quy mo", "class size", "notices", "notice");
        var students = Any(q, "hoc vien", "student", "member", "nguoi hoc", "danh sach hoc vien", "ai dang hoc");
        var classDetails = classes && Any(q, "bao nhieu", "may", "so luong", "o dau", "nhu the nao", "gia", "phi", "cho", "seat", "capacity", "room", "san", "phong", "hoc phi", "registration", "ghi danh", "thong tin", "chi tiet", "siso", "si so", "quy mo", "class size", "dang mo", "mo dang ky", "start", "bat dau", "buoi", "notices", "notice", "status", "trang thai", "what", "where", "how many", "how much", "which", "is open");

        // Do not intercept the existing Coach schedule, roster, request, or lesson-plan handlers.
        if (health) return await FitnessAsync(db, coachId, q, vi, ct);
        if (!notices && !classDetails) return null;

        if (notices && Any(q, "o dau", "nut", "cach", "how", "where", "send", "gui", "tao", "them"))
        {
            return vi
                ? "Vào Classes → chọn lớp được phân công → tab Notices → Class notices → Send notice. Bạn có thể gửi thông báo cho cả lớp hoặc học viên cụ thể theo quyền của Coach. Wolf chỉ hướng dẫn, không gửi thay bạn."
                : "Open Classes → select your assigned class → Notices → Class notices → Send notice. Choose the whole class or an eligible student. Wolf cannot send notices on your behalf.";
        }
        if (!classDetails) return null;

        // Scope mirrors the authorized Coach Classes API; do not infer access from a class name alone.
        var authorized = await CoachDataScope.Classes(db, coachId)
            .OrderBy(c => c.Name).ThenBy(c => c.ClassId)
            .Select(c => new AssignedClass(c.ClassId, c.Name, c.Code,
                c.Sport != null ? c.Sport.Name : "Unknown",
                c.DefaultRoom != null ? c.DefaultRoom.Name : "Unknown",
                c.Status.ToString(), c.Capacity, c.ReservedCount, c.ConfirmedCount,
                c.NumSessions, c.Price, c.EnrollmentOpen, c.StartDate))
            .ToListAsync(ct);
        if (authorized.Count == 0)
            return vi ? "Không tìm thấy lớp đang được phân công trong phạm vi Coach hiện tại. Hãy kiểm tra Classes hoặc Schedule nếu bạn có buổi dạy thay."
                      : "No directly assigned active classes were found. Check Classes or Schedule for substitute sessions.";

        var exact = authorized.Where(c => q.Contains(Norm(c.Name), StringComparison.Ordinal)
                || q.Contains(Norm(c.Code), StringComparison.Ordinal)).ToList();
        AssignedClass? selected = exact.Count == 1 ? exact[0] : null;
        if (selected is null && exact.Count > 1)
            return vi ? "Tôi tìm thấy nhiều lớp khớp mô tả. Vui lòng ghi rõ mã lớp: " + string.Join(", ", exact.Take(8).Select(c => c.Code))
                      : "Several authorized classes match. Specify the class code: " + string.Join(", ", exact.Take(8).Select(c => c.Code));
        if (selected is null && authorized.Count == 1 && !Any(q, "lop ", "class ", "course ", "badminton", "basketball"))
            selected = authorized[0];
        if (selected is null)
            return vi
                ? "Bạn muốn hỏi lớp nào? Hãy nêu tên hoặc mã lớp trong Classes. Các lớp được phân công gồm: " + string.Join(", ", authorized.Take(12).Select(c => $"{c.Name} ({c.Code})"))
                : "Which assigned class do you mean? Provide the name or code: " + string.Join(", ", authorized.Take(12).Select(c => $"{c.Name} ({c.Code})"));

        int available = Math.Max(0, selected.Capacity - selected.ReservedCount);
        if (notices)
            return vi ? $"Để xem thông báo của {selected.Name}: Classes → {selected.Name} → Notices. Chọn Send notice để gửi. Không có số lượng notice đã gửi trong dữ liệu lớp đang truy vấn; Wolf không tự suy đoán số lượng."
                      : $"For {selected.Name}, open Classes → class → Notices. Use Send notice to notify recipients. The class record does not establish how many notices have been sent.";
        if (Any(q, "seat", "cho trong", "con bao nhieu cho", "available", "capacity", "suc chua", "si so", "so cho"))
            return vi ? $"Lớp {selected.Name} ({selected.Code}): sức chứa {selected.Capacity}, đã xác nhận {selected.ConfirmedCount}, còn {available} chỗ có thể đặt (đã tính cả chỗ đang giữ)."
                      : $"{selected.Name} ({selected.Code}): capacity {selected.Capacity}, confirmed students {selected.ConfirmedCount}, available seats {available} (including active seat holds).";
        if (Any(q, "hoc phi", "course fee", "bao nhieu tien", "gia khoa", "price", "cost"))
            return vi ? $"Học phí của {selected.Name} là {selected.Price:N0} VND cho cả khóa." : $"The course fee for {selected.Name} is {selected.Price:N0} VND.";
        if (Any(q, "registration", "enrollment", "ghi danh", "dang ky", "mo dang ky"))
            return vi ? $"Đăng ký lớp {selected.Name}: {(selected.EnrollmentOpen ? "Open" : "Closed")}. Coach có thể xem trạng thái tại Classes → lớp → Enrollment & course fee; không tự mở/đóng đăng ký thay Manager."
                      : $"Registration for {selected.Name} is {(selected.EnrollmentOpen ? "Open" : "Closed")}. View it in Classes → class → Enrollment & course fee.";
        if (Any(q, "san", "room", "phong", "court", "o dau hoc", "dia diem"))
            return vi ? $"Lớp {selected.Name} học tại phòng/sân mặc định: {selected.Room}." : $"The default court/room for {selected.Name} is {selected.Room}.";
        if (Any(q, "so buoi", "sessions", "bao nhieu buoi"))
            return vi ? $"Lớp {selected.Name} có {selected.NumSessions} buổi theo cấu hình lớp." : $"{selected.Name} has {selected.NumSessions} configured sessions.";
        return vi
            ? $"{selected.Name} ({selected.Code}) — môn {selected.Sport}; trạng thái {selected.Status}; sân/phòng {selected.Room}; bắt đầu {selected.StartDate:dd/MM/yyyy}; {selected.NumSessions} buổi; sức chứa {selected.Capacity}; {selected.ConfirmedCount} học viên xác nhận; còn {available} chỗ; học phí {selected.Price:N0} VND; ghi danh {(selected.EnrollmentOpen ? "Open" : "Closed")}. Xem Classes → lớp → Students / Plans / Notices để biết thêm."
            : $"{selected.Name} ({selected.Code}) — {selected.Sport}; {selected.Status}; room {selected.Room}; starts {selected.StartDate:dd/MM/yyyy}; {selected.NumSessions} sessions; capacity {selected.Capacity}; confirmed {selected.ConfirmedCount}; available {available}; course fee {selected.Price:N0} VND; registration {(selected.EnrollmentOpen ? "Open" : "Closed")}.";
    }

    private static async Task<string> FitnessAsync(ISportHubDbContext db, Guid coachId,
        string q, bool vi, CancellationToken ct)
    {
        // Query the authorized roster FIRST, using the same scope as GET /api/coaches/me/students.
        // Do not expose a class-wide health dump. Require a uniquely named current student.
        var authorizedEnrollments = CoachDataScope.Enrollments(db, coachId);
        var roster = await db.Set<UserAccount>().AsNoTracking()
            .Where(u => authorizedEnrollments.Any(e => e.MemberId == u.UserId))
            .Select(u => new MemberName(u.UserId, u.Profile != null ? u.Profile.FullName : u.Email))
            .ToListAsync(ct);
        if (roster.Count == 0)
            return vi ? "Không có học viên với enrollment Confirmed còn hiệu lực trong phạm vi lớp Coach đang được phân công."
                      : "No current confirmed students were found in assigned classes.";
        var matched = roster.Where(x => !string.IsNullOrWhiteSpace(x.Name) && q.Contains(Norm(x.Name), StringComparison.Ordinal)).ToList();
        if (matched.Count != 1)
        {
            var choices = roster.OrderBy(x => x.Name).Take(12).Select(x => x.Name);
            return vi
                ? "Bạn muốn xem fitness profile của học viên nào? Hãy nêu đúng tên học viên đang được phân công (không trả hàng loạt thông tin sức khỏe): " + string.Join(", ", choices)
                : "Which assigned student’s fitness profile do you need? Specify one student by name: " + string.Join(", ", choices);
        }
        var member = matched[0];
        // Double-check authorization even if the roster has just been retrieved.
        if (!await CoachDataScope.CanReadMemberAsync(db, coachId, member.MemberId, ct))
            return vi ? "Bạn hiện không có quyền xem hồ sơ học viên này." : "You are not authorized to view this student's profile.";
        var profile = await db.Set<MemberTrainingProfile>().AsNoTracking()
            .SingleOrDefaultAsync(p => p.MemberId == member.MemberId, ct);
        if (profile is null)
            return vi ? $"Học viên {member.Name} chưa khai báo Fitness profile trong hệ thống." : $"{member.Name} does not have a fitness profile on record.";

        decimal? bmi = profile.HeightCm is > 0 && profile.WeightKg is > 0
            ? Math.Round(profile.WeightKg.Value / (profile.HeightCm.Value / 100m * (profile.HeightCm.Value / 100m)), 1)
            : null;
        var lines = new List<string> {
            vi ? $"Fitness profile của {member.Name} (hội viên tự khai, cập nhật {profile.UpdatedAt:dd/MM/yyyy} UTC):" :
                $"Self-reported fitness profile of {member.Name} (updated {profile.UpdatedAt:dd/MM/yyyy} UTC):",
            vi ? $"Mục tiêu: {profile.Goal}; trình độ: {profile.ExperienceLevel}." : $"Goal: {profile.Goal}; experience: {profile.ExperienceLevel}.",
            vi ? $"Chiều cao: {profile.HeightCm?.ToString() ?? "chưa có"} cm; cân nặng: {profile.WeightKg?.ToString() ?? "chưa có"} kg; BMI: {(bmi.HasValue ? bmi.Value.ToString("0.0", CultureInfo.InvariantCulture) : "chưa có")}." :
                $"Height: {profile.HeightCm?.ToString() ?? "unknown"} cm; weight: {profile.WeightKg?.ToString() ?? "unknown"} kg; BMI: {(bmi.HasValue ? bmi.Value.ToString("0.0", CultureInfo.InvariantCulture) : "unknown")}.",
            vi ? $"Mức vận động: {profile.ActivityLevel?.ToString() ?? "chưa có"}; tần suất: {profile.TrainingDaysPerWeek?.ToString() ?? "chưa có"} ngày/tuần; thể trạng: {profile.BodyBuild ?? "chưa có"}." :
                $"Activity: {profile.ActivityLevel?.ToString() ?? "unknown"}; frequency: {profile.TrainingDaysPerWeek?.ToString() ?? "unknown"} days/week; build: {profile.BodyBuild ?? "unknown"}."
        };
        if (Any(q, "ho so suc khoe", "health profile", "han che", "di ung", "allergy", "diet", "che do an", "suc khoe"))
        {
            lines.Add(vi
                ? $"Giới hạn sức khỏe (tự khai): {profile.Notes ?? "chưa khai"}; dị ứng thực phẩm: {profile.FoodAllergies ?? "chưa khai"}; chế độ ăn: {profile.DietaryPreference}."
                : $"Self-reported limitations: {profile.Notes ?? "not provided"}; food allergies: {profile.FoodAllergies ?? "not provided"}; diet: {profile.DietaryPreference}.");
        }
        lines.Add(vi ? "Để xem hồ sơ chi tiết theo quyền: Students → chọn học viên → Health profile. Các số liệu do hội viên tự khai, không phải chẩn đoán y tế."
                     : "For authorized details: Students → select the student → Health profile. Measurements are self-reported, not a medical diagnosis.");
        return string.Join("\n", lines);
    }
}
