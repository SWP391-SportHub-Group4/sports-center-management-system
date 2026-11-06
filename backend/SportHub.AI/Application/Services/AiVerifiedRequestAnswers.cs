using System.Globalization;
using System.Text;
using System.Text.Json;

namespace SportHub.AI.Application.Services;

// Only answers from the already authenticated, ownership-scoped read-only snapshot.
// Does not create or update requests and does not consume raw database credentials.
internal static class AiVerifiedRequestAnswers
{
    private static string Normalize(string value)
    {
        var b = new StringBuilder();
        foreach (var ch in (value ?? "").Normalize(NormalizationForm.FormD))
            if (CharUnicodeInfo.GetUnicodeCategory(ch) != UnicodeCategory.NonSpacingMark)
                b.Append(ch is 'đ' or 'Đ' ? 'd' : char.ToLowerInvariant(ch));
        return b.ToString().Normalize(NormalizationForm.FormC);
    }

    private static bool Any(string q, params string[] words) => words.Any(q.Contains);

    internal static string? TryAnswer(string question, string role, JsonElement context)
    {
        if (role is not ("coach" or "member")) return null;
        var q = Normalize(question).ToLowerInvariant();
        if (!Any(q, "request", "yeu cau", "ho tro", "bao vang", "hoi vien", "member")) return null;
        bool en = Any(q, "how many", "where", "status", "create", "done", "request", "submit") &&
                  !Any(q, "yeu cau", "bao vang", "o dau", "co", "bao nhieu", "trang thai", "da", "gui");

        if (role == "coach")
        {
            if (Any(q, "o dau", "where", "tao", "create", "gui request", "submit"))
                return en
                    ? "Open Request. Absence requests are submitted from an eligible session in Schedule, then tracked under Request > Absence requests. Under Request > Member support, Coaches handle requests assigned to them; they cannot create new member-support requests from the inbox. This chatbot is read-only."
                    : "Vào Request. Với yêu cầu vắng, vào Schedule, chọn buổi dạy đủ điều kiện để gửi rồi theo dõi tại Request > Absence requests. Tab Member support chỉ để xử lý yêu cầu được phân công, không có chức năng tạo yêu cầu hỗ trợ mới. Wolf chỉ đọc dữ liệu, không tự tạo request.";
            if (Any(q, "may trang thai", "bao nhieu trang thai", "statuses", "states"))
                return "Member support hiển thị 4 ô thống kê: Not started, In progress, Done, Overdue. Overdue là dấu hiệu quá hạn SLA, không phải trạng thái xử lý độc lập. Yêu cầu vắng (Absence requests) có trạng thái riêng, không dùng bốn ô này.";
            if (context.TryGetProperty("assignedSupportRequests", out var requests) && requests.ValueKind == JsonValueKind.Array)
            {
                var rows = requests.EnumerateArray().ToArray();
                if (Any(q, "hoi vien", "member") && Any(q, "ten", "name", "who"))
                {
                    // A question referencing a member ID may only resolve to a request
                    // visible to this Coach. Never search arbitrary accounts by ID.
                    var matching = rows.Where(r =>
                        r.TryGetProperty("MemberId", out var id) &&
                        id.ValueKind == JsonValueKind.String &&
                        q.Contains(id.GetString()!.ToLowerInvariant())).ToArray();
                    if (matching.Length == 0 && rows.Length == 1) matching = rows;
                    if (matching.Length == 1)
                    {
                        var name = MemberName(matching[0]);
                        return name is null
                            ? "Yêu cầu này thuộc phạm vi bạn phụ trách, nhưng hồ sơ hiện không có tên hội viên để xác minh."
                            : $"Hội viên gửi yêu cầu '{Subject(matching[0])}' là {name}.";
                    }
                    return "Bạn hãy cho biết tiêu đề request hoặc chọn request cụ thể tại Request > Member support để xác định hội viên.";
                }
                var completed = rows.Where(r => Status(r) is "DONE" or "CLOSED").ToArray();
                var pending = rows.Where(r => Status(r) is "OPEN" or "ASSIGNED" or "IN_PROGRESS").ToArray();
                if (Any(q, "done", "hoan thanh", "da xong", "xu ly xong", "da xu ly"))
                    return Reply(completed, "Done", rows.Length);
                if (Any(q, "dang", "cho", "pending", "in progress", "not started"))
                    return Reply(pending, "Not started / In progress", rows.Length);
                if (Any(q, "bao nhieu", "how many", "tong", "count"))
                    return $"Trong {rows.Length} Member support requests gần đây được phân công cho bạn: {completed.Length} Done, {pending.Length} chưa hoàn tất. Vào Request > Member support để xem toàn bộ danh sách và bộ lọc.";
                return Reply(rows, "Member support", rows.Length);
            }
        }
        else if (context.TryGetProperty("mySupportRequests", out var requests) && requests.ValueKind == JsonValueKind.Array)
        {
            var rows = requests.EnumerateArray().ToArray();
            var match = Any(q, "done", "hoan thanh", "da xong") ? rows.Where(r => Status(r) is "DONE" or "CLOSED").ToArray() : rows;
            return Reply(match, "Yêu cầu hỗ trợ của bạn", rows.Length);
        }
        return null;
    }
    private static string Status(JsonElement e) => e.GetProperty("Status").GetString() ?? "";
    private static string Subject(JsonElement e) => e.TryGetProperty("Subject", out var v) ? v.GetString() ?? "(không có tiêu đề)" : "(không có tiêu đề)";
    private static string? MemberName(JsonElement e)
        => e.TryGetProperty("memberName", out var v) && v.ValueKind == JsonValueKind.String && !string.IsNullOrWhiteSpace(v.GetString())
            ? v.GetString() : null;
    private static string Reply(JsonElement[] rows, string caption, int total)
    {
        if (rows.Length == 0) return $"{caption}: không có yêu cầu phù hợp trong {total} bản ghi gần đây đã truy xuất. Kết quả chỉ phản ánh phạm vi dữ liệu này.";
        var lines = rows.Take(8).Select(r =>
            $"- {Subject(r)} — {Status(r)}" +
            (MemberName(r) is { } name ? $" — Hội viên: {name}" : ""));
        return $"{caption}: tìm thấy {rows.Length} yêu cầu trong {total} bản ghi gần đây đã truy xuất.\n"
               + string.Join("\n", lines)
               + (rows.Length > 8 ? "\nChỉ hiển thị 8 yêu cầu đầu tiên." : "");
    }
}
