using System.Globalization;
using System.Text;
using System.Text.RegularExpressions;
using Microsoft.EntityFrameworkCore;
using SportHub.BuildingBlocks.Abstractions.Persistence;
using SportHub.Identity.Domain.Entities;
using SportHub.Scheduling.Application.Services;
using SportHub.Scheduling.Domain.Entities;
using SportHub.Scheduling.Domain.Enums;

namespace SportHub.AI.Application.Services;

// Coach-only read paths. Never call Member intent handlers or access unrelated student profiles.
internal static class AiCoachAnswerRouter
{
    private static string Normalize(string value)
    {
        var result = new StringBuilder();
        foreach (char c in (value ?? string.Empty).Normalize(NormalizationForm.FormD))
            if (CharUnicodeInfo.GetUnicodeCategory(c) != UnicodeCategory.NonSpacingMark)
                result.Append(c is 'đ' or 'Đ' ? 'd' : char.ToLowerInvariant(c));
        return Regex.Replace(result.ToString().Normalize(NormalizationForm.FormC), @"[^a-z0-9]+", " ").Trim();
    }

    private static bool Any(string q, params string[] items)
    {
        var padded = " " + q + " ";
        return items.Any(s => padded.Contains(" " + s + " ", StringComparison.Ordinal));
    }

    private static DateTime VietNam(DateTime utc)
    {
        var value = DateTime.SpecifyKind(utc, DateTimeKind.Utc);
        try { return TimeZoneInfo.ConvertTimeFromUtc(value, TimeZoneInfo.FindSystemTimeZoneById("Asia/Ho_Chi_Minh")); }
        catch (TimeZoneNotFoundException) { return TimeZoneInfo.ConvertTimeFromUtc(value, TimeZoneInfo.FindSystemTimeZoneById("SE Asia Standard Time")); }
    }

    internal static async Task<string?> TryAnswerAsync(ISportHubDbContext db, Guid coachId,
        string question, DateTime now, CancellationToken ct)
    {
        var q = Normalize(question);
        var navigation = Any(q, "o dau", "nut", "cach", "lam sao", "huong dan", "where", "how", "doi", "cap nhat", "them", "upload");
        bool avatar = Any(q, "avatar", "anh dai dien", "anh ca nhan");
        bool credentials = Any(q, "chung chi", "chung nhan", "bang cap", "award", "certificate", "certificates");
        if (navigation && (avatar || credentials))
        {
            var steps = new List<string>();
            if (avatar)
                steps.Add("Đổi ảnh đại diện: mở menu tài khoản → Account → Personal Information → Browse → chọn ảnh và lưu theo nút đang hiển thị.");
            if (credentials)
                steps.Add("Bổ sung chứng chỉ: Account → Certificates & awards → Add document → hoàn tất form và lưu.");
            return string.Join("\n", steps);
        }

        // Requests must be explicitly about requests: do not mistake 'member' or 'hoi vien' for request intent.
        if (Any(q, "request", "yeu cau", "ho tro", "bao vang") &&
            !Any(q, "lop day", "hoc vien trong lop", "lop hoc gan nhat"))
            return null; // Handled exclusively by the Coach Request engine, not by this class.

        bool roster = Any(q, "hoc vien", "member", "student", "students", "ai hoc", "nguoi hoc", "dang day cho ai", "bao nhieu nguoi")
            && Any(q, "lop", "day", "hoc", "member", "student", "students");
        bool sport = Any(q, "mon gi", "mon nao", "mon the thao", "which sport", "what sport", "dang day mon");
        bool schedule = Any(q, "lich day", "lop gan nhat", "lop hoc gan nhat", "lop day gan nhat", "buoi day", "next class", "next session", "teaching schedule", "khi nao day");
        bool classList = Any(q, "lop toi day", "lop dang day", "lop nao", "lop duoc phan cong", "assigned classes", "my classes");
        if (!roster && !sport && !schedule && !classList) return null;

        // Class default coach and substitute session coach are distinct. The user may teach a session
        // without being assigned as the default coach of the whole class.
        var assigned = await CoachDataScope.Classes(db, coachId)
            .OrderBy(c => c.Name)
            .Select(c => new { c.ClassId, c.Name, Sport = c.Sport != null ? c.Sport.Name : (string?)null })
            .Take(120).ToListAsync(ct);

        var future = await db.Set<ClassSession>().AsNoTracking()
            .Where(s => s.CoachId == coachId && s.StartAtUtc >= now && s.Status == ClassSessionStatus.Scheduled)
            .OrderBy(s => s.StartAtUtc)
            .Select(s => new { s.ClassId, s.StartAtUtc, s.EndAtUtc,
                ClassName = s.Class != null ? s.Class.Name : (string?)null,
                Sport = s.Class != null && s.Class.Sport != null ? s.Class.Sport.Name : (string?)null,
                Room = s.Room != null ? s.Room.Name : (string?)null })
            .Take(15).ToListAsync(ct);

        if (schedule && !roster)
        {
            var upcoming = future.FirstOrDefault();
            if (upcoming != null)
            {
                var local = VietNam(upcoming.StartAtUtc);
                return $"Buổi dạy sắp tới gần nhất: {upcoming.ClassName ?? "Lớp #" + upcoming.ClassId}, {local:dd/MM/yyyy HH:mm} (giờ Việt Nam)" +
                    (upcoming.Sport is null ? "" : $", môn {upcoming.Sport}") +
                    (upcoming.Room is null ? "" : $", phòng {upcoming.Room}") + ". Xem thêm ở Schedule.";
            }
            return assigned.Count > 0
                ? $"Bạn được phân công {assigned.Count} lớp đang Published/InProgress, nhưng hiện không tìm thấy buổi Scheduled sắp tới của tài khoản Coach. Đây không phải kết luận rằng bạn không có lớp; kiểm tra Schedule và trạng thái buổi học."
                : "Chưa tìm thấy lớp Published/InProgress được phân công hoặc buổi Scheduled sắp tới của Coach. Có thể có lớp ở trạng thái khác; xem Classes và Schedule.";
        }

        if (sport || classList)
        {
            var sports = assigned.Select(c => c.Sport).Where(s => !string.IsNullOrWhiteSpace(s)).Distinct().ToArray();
            var summary = assigned.Count == 0
                ? "Không tìm thấy lớp Published/InProgress do bạn phụ trách tại thời điểm truy vấn."
                : $"Bạn đang được phân công {assigned.Count} lớp: " + string.Join("; ", assigned.Take(15).Select(c => c.Name + (c.Sport == null ? "" : $" ({c.Sport})"))) + (assigned.Count > 15 ? "; …" : ".");
            if (sport) summary += sports.Length == 0 ? " Chưa xác minh được môn từ lớp được phân công." : " Môn: " + string.Join(", ", sports) + ".";
            return summary;
        }

        // Roster is only exposed for classes CoachDataScope authorizes. Do not infer a roster for
        // a substitute session of an unrelated class.
        var nearestClassId = future.FirstOrDefault()?.ClassId;
        var onlyNearest = Any(q, "gan nhat", "lop do", "buoi gan nhat", "next class");
        var classIds = onlyNearest && nearestClassId.HasValue && assigned.Any(c => c.ClassId == nearestClassId.Value)
            ? new[] { nearestClassId.Value }
            : assigned.Select(c => c.ClassId).ToArray();
        if (classIds.Length == 0)
            return "Không tìm thấy lớp đang được phân công cho Coach để xác minh danh sách học viên. Bạn có thể kiểm tra Classes → Students.";

        var rosterRows = await CoachDataScope.Enrollments(db, coachId)
            .Where(e => classIds.Contains(e.ClassId))
            .Join(db.Set<UserProfile>().AsNoTracking(), e => e.MemberId, p => p.UserId,
                (e, p) => new { e.ClassId, p.FullName })
            .OrderBy(x => x.ClassId).ThenBy(x => x.FullName)
            .Take(151).ToListAsync(ct);
        var classNames = assigned.ToDictionary(c => c.ClassId, c => c.Name);
        if (rosterRows.Count == 0)
            return "Chưa tìm thấy học viên có enrollment Confirmed và còn hiệu lực trong các lớp Coach được phân công. Kiểm tra Students để đối chiếu.";
        var lines = rosterRows.Take(150).GroupBy(x => x.ClassId)
            .Select(g => $"{classNames.GetValueOrDefault(g.Key, "Lớp #" + g.Key)}: {string.Join(", ", g.Select(x => x.FullName))}");
        return $"Có {rosterRows.Count}{(rosterRows.Count >= 151 ? "+" : "")} enrollment với hồ sơ tên trong phạm vi lớp Coach được phân công:\n" +
            string.Join("\n", lines) + (rosterRows.Count >= 151 ? "\nDanh sách đã giới hạn; xem Students để xem đầy đủ." : "");
    }
}
