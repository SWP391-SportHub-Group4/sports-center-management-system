using System.Text.Json;

namespace SportHub.AI.Application.Services;

// Only the current Member's support requests, as ownership-scoped by SportHubAiContextBuilder.
internal static class AiMemberRequestAnswers
{
    internal static string? TryAnswer(string question, JsonElement context)
    {
        if (!context.TryGetProperty("mySupportRequests", out var records) || records.ValueKind != JsonValueKind.Array)
            return "Chưa truy xuất được dữ liệu yêu cầu hỗ trợ của tài khoản hiện tại.";
        var rows = records.EnumerateArray().ToArray();
        var q = question.ToLowerInvariant();
        if (q.Contains("done") || q.Contains("hoàn thành") || q.Contains("hoan thanh") || q.Contains("đã xong") || q.Contains("da xong"))
            rows = rows.Where(r => r.TryGetProperty("Status", out var s) && (s.ToString() is "DONE" or "CLOSED")).ToArray();
        if (rows.Length == 0) return "Không có yêu cầu phù hợp trong phạm vi các bản ghi hỗ trợ gần đây đã truy xuất.";
        return $"Có {rows.Length} yêu cầu hỗ trợ phù hợp trong dữ liệu gần đây:\n" +
            string.Join("\n", rows.Take(10).Select(r => $"- {(r.TryGetProperty("Subject", out var s) ? s.ToString() : "(không có tiêu đề)")} — {(r.TryGetProperty("Status", out var st) ? st.ToString() : "không rõ trạng thái")}"));
    }
}
