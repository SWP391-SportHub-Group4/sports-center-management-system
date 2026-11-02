using System.Text.RegularExpressions;
namespace SportHub.AI.Application.Services;
internal static class SportHubTopicGuard
{
    private static readonly string[] Center = ["sporthub", "coach", "member", "class", "course", "session", "attendance", "plan", "workout", "exercise", "sport", "gym", "badminton", "basketball", "pickleball", "court", "rental", "training", "fitness", "schedule", "wallet", "point", "invoice", "payment", "refund", "support", "account", "login", "password", "button", "tab", "page", "click", "register", "notification", "manager", "receptionist", "student", "goal", "lesson", "lớp", "tập", "học", "giáo án", "điểm danh", "lịch", "huấn luyện", "môn", "sân", "gói", "thanh toán", "đăng nhập", "nút", "trang", "hội viên", "bài tập", "tài khoản", "hỗ trợ"];
    private static readonly string[] External = ["president", "prime minister", "election", "bitcoin price", "stock price", "weather", "capital of", "recipe for", "politics", "tổng thống", "thủ tướng", "bầu cử", "giá bitcoin", "chứng khoán", "thời tiết", "thủ đô", "nấu ăn"];
    internal static bool IsClearlyOffTopic(string question)
    {
        var q = question.ToLowerInvariant();
        var isRelated = Center.Any(x => q.Contains(x, StringComparison.OrdinalIgnoreCase));
        return !isRelated && External.Any(x => q.Contains(x, StringComparison.OrdinalIgnoreCase));
    }
}
