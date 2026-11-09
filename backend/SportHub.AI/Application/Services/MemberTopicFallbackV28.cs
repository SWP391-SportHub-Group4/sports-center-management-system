using System.Globalization;
using System.Text;

namespace SportHub.AI.Application.Services;

/// <summary>Deterministic allowlist when the Gemini *planner* fails. No model-generated SQL or user ID.</summary>
internal static class MemberTopicFallbackV28
{
    internal static IReadOnlyList<string> Select(string question)
    {
        var s = (question ?? "").Normalize(NormalizationForm.FormD);
        var output = new StringBuilder(s.Length);
        foreach (var c in s)
            if (CharUnicodeInfo.GetUnicodeCategory(c) != UnicodeCategory.NonSpacingMark)
                output.Append(c is 'đ' or 'Đ' ? 'd' : char.ToLowerInvariant(c));
        var q = output.ToString();
        var topics = new List<string>();
        bool Contains(params string[] values) => values.Any(w => q.Contains(w, StringComparison.Ordinal));
        void Add(string topic) { if (!topics.Contains(topic, StringComparer.Ordinal)) topics.Add(topic); }
        if (Contains("diem danh", "attendance", "vang mat", "present", "absent")) { Add("attendance"); Add("classSchedule"); }
        if (Contains("lich", "schedule", "session", "buoi hoc", "calendar", "timetable")) Add("classSchedule");
        if (Contains("plan", "giao an", "bai tap", "workout", "kho tap", "exercise", "training")) Add("training");
        if (Contains("hoc phi", "gia lop", "goi nao", "packages", "bao nhieu tien", "mua lop")) Add("explorePackages");
        if (Contains("lop", "class", "khoa hoc", "enrolled", "ghi danh")) Add("myClasses");
        if (Contains("thue san", "court", "rental", "dat san")) Add("myCourtBookings");
        if (Contains("trong", "available", "slot", "room")) Add("courtRental");
        if (Contains("membership", "gym", "hoi vien", "gia han", "goi tap")) Add("membership");
        if (Contains("thanh toan", "hoa don", "invoice", "billing", "payment")) Add("billing");
        if (Contains("diem", "points", "wallet", "so du")) Add("points");
        if (Contains("can nang", "chieu cao", "fitness", "body", "weight", "bmi")) Add("fitness");
        if (Contains("sports", "mon the thao", "mon nao")) Add("sports");
        if (Contains("support", "ho tro", "khieu nai", "ticket")) Add("support");
        if (Contains("notification", "thong bao")) Add("notifications");
        if (Contains("profile", "account", "tai khoan", "email cua toi")) Add("account");
        if (Contains("my services", "dich vu", "da mua")) Add("myServices");
        if (topics.Count == 0) Add("overview");
        return topics.Take(4).ToArray();
    }
}
