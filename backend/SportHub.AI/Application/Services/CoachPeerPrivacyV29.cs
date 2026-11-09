using System.Globalization;
using System.Text;
using System.Text.RegularExpressions;

namespace SportHub.AI.Application.Services;

/// <summary>
/// Coach-specific privacy boundary. Runs before Coach DataHub, prompt lookup,
/// static navigation and Gemini. This is a guard, not an authorization grant.
/// </summary>
internal static class CoachPeerPrivacyV29
{
    private static string Normalize(string question)
    {
        var output = new StringBuilder();
        foreach (var c in (question ?? "").Normalize(NormalizationForm.FormD))
            if (CharUnicodeInfo.GetUnicodeCategory(c) != UnicodeCategory.NonSpacingMark)
                output.Append(c is 'đ' or 'Đ' ? 'd' : char.ToLowerInvariant(c));
        return Regex.Replace(output.ToString().Normalize(NormalizationForm.FormC), @"[^a-z0-9]+", " ").Trim();
    }

    internal static bool IsOtherCoachRequest(string question)
    {
        var q = Normalize(question);
        if (q.Length == 0) return false;

        var phrases = new[]
        {
            "coach khac", "cac coach khac", "huan luyen vien khac", "hlv khac",
            "coach dong nghiep", "dong nghiep coach", "dong nghiep cua toi",
            "other coach", "other coaches", "another coach", "fellow coach",
            "other trainer", "other trainers", "staff directory", "coach directory",
            "danh sach coach", "danh sach hlv", "danh sach huan luyen vien",
            "list of coaches", "all coaches", "who are the coaches", "co bao nhieu coach", "coach nao gioi", "so sanh coach", "compare coaches",
            "thong tin cua coach", "thong tin coach", "thong tin cac coach", "thong tin cua cac coach", "ho so cua coach",
            "ho so coach khac", "profile of coach", "profile of another coach",
            "lich day cua coach", "lich cua coach", "schedule of coach",
            "coach schedule of", "lien he coach", "email coach", "sdt coach",
            "so dien thoai coach", "contact of coach", "coach contact",
            "luong coach", "salary of coach", "coach salary",
            "coach nao day", "huan luyen vien nao day", "who is coaching", "cac coach tai trung tam",
            "ai la huan luyen vien", "ai la coach"
        };
        if (phrases.Any(p => (" " + q + " ").Contains(" " + p + " ", StringComparison.Ordinal)))
            return true;

        // A named third-party Coach is private, even when phrased without "other".
        // Do not block self-service questions such as "my coach schedule" or "Coach AI".
        var namedCoach = Regex.IsMatch(q,
            @"\b(?:thong tin|profile|ho so|lich day|lich lam viec|lien he|phone|email|schedule|about|tell me about)\s+(?:cua\s+|of\s+)?(?:coach|hlv|huan luyen vien)\s+(?!cua toi\b|my\b|me\b|toi\b|ai\b)(?:[a-z][a-z0-9]*\s*){1,5}\b",
            RegexOptions.CultureInvariant);
        return namedCoach;
    }

    internal static string? TryRefuse(string question)
    {
        if (!IsOtherCoachRequest(question)) return null;
        var q = Normalize(question);
        var english = Regex.IsMatch(q, @"\b(other|another|fellow|who|which|profile|schedule|coach directory|list of|about|contact)\b", RegexOptions.CultureInvariant)
            && !Regex.IsMatch(q, @"\b(cho toi|cua|huan luyen vien|thong tin|lich day|danh sach|khac|hoi|ai la)\b", RegexOptions.CultureInvariant);
        return english
            ? "I cannot disclose information about other Coaches, including their schedules, profiles or contact details. I can help with your own assigned classes and teaching schedule."
            : "Tôi không thể cung cấp thông tin về Coach khác, bao gồm lịch dạy, hồ sơ hoặc liên hệ. Tôi chỉ có thể hỗ trợ dữ liệu giảng dạy và các lớp được phân công cho tài khoản của bạn.";
    }
}
