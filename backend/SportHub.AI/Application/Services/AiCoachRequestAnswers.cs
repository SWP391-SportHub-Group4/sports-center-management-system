using System.Text.Json;

namespace SportHub.AI.Application.Services;

// Coach request knowledge is isolated from Member requests and Member conversation data.
internal static class AiCoachRequestAnswers
{
    internal static string? TryAnswer(string question, JsonElement context)
    {
        var q = question.ToLowerInvariant();
        if (q.Contains("trạng thái") || q.Contains("trang thai") || q.Contains("statuses"))
            return "Member support có 4 ô thống kê trên giao diện: Not started, In progress, Done và Overdue. Overdue là yêu cầu trễ hạn SLA, không phải trạng thái xử lý độc lập. Absence requests có quy trình và trạng thái riêng.";
        if (q.Contains("tạo") || q.Contains("tao") || q.Contains("ở đâu") || q.Contains("o dau") || q.Contains("create") || q.Contains("where"))
            return "Coach có thể gửi Absence request từ Schedule khi buổi học đủ điều kiện, sau đó theo dõi tại Request → Absence requests. Tab Request → Member support chỉ xử lý request được phân công; Coach không tạo Member support request tại đây.";
        if (!context.TryGetProperty("assignedSupportRequests", out var requests) || requests.ValueKind != JsonValueKind.Array)
            return "Chưa tải được dữ liệu Member support được phân công để xác minh. Kiểm tra Request → Member support.";
        var rows = requests.EnumerateArray().ToArray();
        var done = rows.Where(r => Status(r) is "DONE" or "CLOSED").ToArray();
        if (q.Contains("done") || q.Contains("hoàn thành") || q.Contains("hoan thanh") || q.Contains("đã xong") || q.Contains("da xong"))
            return done.Length == 0
                ? $"Trong {rows.Length} request gần đây được phân công đã truy xuất, chưa thấy request Done."
                : $"Trong {rows.Length} request được phân công đã truy xuất, có {done.Length} Done:\n" +
                    string.Join("\n", done.Take(10).Select(r => $"- {Subject(r)}" + (Name(r) is { } name ? $" — Hội viên: {name}" : "")));
        if (q.Contains("bao nhiêu") || q.Contains("bao nhieu") || q.Contains("how many"))
            return $"Đã truy xuất {rows.Length} request được phân công gần đây, trong đó {done.Length} Done. Đây không nhất thiết là toàn bộ lịch sử.";
        if (q.Contains("hội viên") || q.Contains("hoi vien") || q.Contains("member") || q.Contains("tên") || q.Contains("ten"))
        {
            var named = rows.Where(r => Name(r) is not null).Take(10).ToArray();
            if (named.Length == 0) return "Các request được phân công đã truy xuất chưa có tên hội viên để xác minh.";
            return "Hội viên trong các request được phân công gần đây:\n" +
                string.Join("\n", named.Select(r => $"- {Name(r)} — {Subject(r)}"));
        }
        return $"Đã truy xuất {rows.Length} request được phân công gần đây. Xem Request → Member support để lọc chi tiết.";
    }

    private static string Status(JsonElement r) => r.TryGetProperty("Status", out var v) ? v.ToString().ToUpperInvariant() : "";
    private static string Subject(JsonElement r) => r.TryGetProperty("Subject", out var v) ? v.ToString() : "(không có tiêu đề)";
    private static string? Name(JsonElement r) => r.TryGetProperty("memberName", out var v) && v.ValueKind == JsonValueKind.String && !string.IsNullOrWhiteSpace(v.GetString()) ? v.GetString() : null;
}
