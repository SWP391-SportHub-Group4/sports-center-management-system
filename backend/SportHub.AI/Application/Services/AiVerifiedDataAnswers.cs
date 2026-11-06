using System.Text.Json;

namespace SportHub.AI.Application.Services;

/// <summary>
/// Answers narrowly scoped account-data questions from authorized DB snapshots.
/// Never makes its own SQL, never expands the caller's authorization, and never invents data.
/// </summary>
internal static class AiVerifiedDataAnswers
{
    internal static string? TryAnswer(string question, JsonElement context)
    {
        if (!context.TryGetProperty("role", out var roleValue) || roleValue.ValueKind != JsonValueKind.String)
            return null;
        var role = roleValue.GetString();
        var q = question.Trim().ToLowerInvariant();
        var asksNext = Has(q, "gần nhất", "sắp tới", "tiếp theo", "next class", "next session", "upcoming class", "next lesson");
        var asksSchedule = Has(q, "lịch dạy", "lịch học", "teaching schedule", "my schedule", "class schedule");
        var asksStudents = Has(q, "ai học", "học viên", "danh sách lớp", "students", "student roster", "who attends", "who is in", "who's in");
        if (role == "Coach" && asksStudents)
        {
            if (!context.TryGetProperty("nextSession", out var next) || next.ValueKind != JsonValueKind.Object)
                return "Tôi chưa có buổi dạy sắp tới trong phạm vi dữ liệu được truy vấn. Hãy kiểm tra lịch dạy hoặc nêu tên lớp cụ thể.";
            var classId = Get(next, "classId").GetInt32();
            var className = Value(next, "className");
            var start = FormatUtc(next, "startAtUtc");
            var owned = context.GetProperty("assignedClasses").EnumerateArray().Any(c => Get(c, "classId").GetInt32() == classId);
            if (!owned)
                return $"Buổi dạy gần nhất là {className}, lúc {start} (giờ Việt Nam). Đây có thể là buổi dạy thay; tôi không thể hiển thị danh sách học viên vì lớp không thuộc danh sách lớp được phân công của bạn.";
            var students = context.GetProperty("roster").EnumerateArray()
                .Where(s => Get(s, "classId").GetInt32() == classId)
                .Select(s => Value(s, "name")).Where(n => !string.IsNullOrWhiteSpace(n)).ToList();
            if (students.Count == 0)
                return $"Lớp {className} (buổi gần nhất {start} giờ Việt Nam): tôi chưa thấy học viên ghi danh hợp lệ trong phần dữ liệu được truy vấn (tối đa 500 dòng roster). Nếu vừa thay đổi ghi danh, hãy tải lại dữ liệu.";
            return $"Lớp {className} (buổi gần nhất {start} giờ Việt Nam) có ít nhất {students.Count} học viên trong kết quả truy vấn:\n" +
                   string.Join("\n", students.Select((name, i) => $"{i + 1}. {name}"));
        }
        if (role == "Coach" && (asksNext || asksSchedule))
        {
            if (!context.TryGetProperty("nextSession", out var next) || next.ValueKind != JsonValueKind.Object)
                return "Trong các buổi đã truy vấn, tôi chưa tìm thấy buổi dạy Scheduled nào sắp tới. Kết quả có giới hạn, nên chưa thể khẳng định bạn không còn lịch dạy.";
            return $"Buổi dạy sắp tới: {Value(next, "className")}, {FormatUtc(next, "startAtUtc")} (giờ Việt Nam), phòng {Value(next, "room")}, trạng thái {Value(next, "status")}.";
        }
        if (role == "Member" && (asksNext || asksSchedule))
        {
            if (!context.TryGetProperty("nextSession", out var next) || next.ValueKind != JsonValueKind.Object)
                return "Tôi chưa tìm thấy buổi học sắp tới trong 14 ngày được truy vấn. Điều này không có nghĩa bạn chưa ghi danh lớp nào.";
            return $"Buổi học sắp tới: {Value(next, "className")}, {FormatUtc(next, "startAtUtc")} (giờ Việt Nam), phòng {Value(next, "room")}.";
        }
        return null;
    }

    private static bool Has(string q, params string[] phrases) => phrases.Any(q.Contains);
    private static JsonElement Get(JsonElement e, string key)
    {
        foreach (var property in e.EnumerateObject())
            if (string.Equals(property.Name, key, StringComparison.OrdinalIgnoreCase))
                return property.Value;
        return default;
    }
    private static string Value(JsonElement e, string key) =>
        Get(e, key) is var value && value.ValueKind != JsonValueKind.Undefined ? value.ToString() : "Unknown";
    private static string FormatUtc(JsonElement e, string key) =>
        Get(e, key) is var value && value.ValueKind == JsonValueKind.String &&
        DateTimeOffset.TryParse(value.GetString(), out var timestamp)
            ? timestamp.ToOffset(TimeSpan.FromHours(7)).ToString("dd/MM/yyyy HH:mm")
            : "không xác định";
}
