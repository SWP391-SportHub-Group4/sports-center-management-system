using System.Text.RegularExpressions;

namespace SportHub.AI.Application.Services.CoachPlanning;

public sealed record PlanHistoryRow(int SessionNo, string Title, string Content);
public sealed record AssessmentExcerpt(int SessionNo, int? Score, string Feedback, bool FromPreviousClass);
public sealed record SkillMention(string Topic, int AssessmentCount);

public static class LessonHistoryAggregator
{
    // Fixed vocabulary identifies mentions only, not whether a skill is a weakness or strength.
    private static readonly (string Topic, string Pattern)[] Topics =
    [
        ("footwork", @"\bfootwork\b|di chuyển|bộ pháp|buoc chan|bước chân"),
        ("smash", @"\bsmash\b|đập cầu|dap cau"),
        ("serve", @"\bserv(?:e|ice)\b|phát cầu|giao cầu|phat cau"),
        ("clear", @"\bclear\b|phông cầu|phong cau"),
        ("grip", @"\bgrip\b|cầm vợt|cam vot"),
        ("recovery", @"\brecovery\b|hồi vị|trở về vị trí"),
        ("shooting", @"\bshoot(?:ing)?\b|ném rổ|nem ro"),
        ("dribbling", @"\bdribbl\w*\b|dẫn bóng|dan bong"),
        ("passing", @"\bpass(?:ing)?\b|chuyền bóng|chuyen bong"),
        ("balance", @"\bbalance\b|thăng bằng|thang bang"),
        ("strength", @"\bstrength\b|sức mạnh|suc manh"),
        ("endurance", @"\bendurance\b|sức bền|suc ben"),
        ("mobility", @"\bmobility\b|linh hoạt|linh hoat"),
        ("technique", @"\btechnique\b|kỹ thuật|ky thuat")
    ];

    public static SkillMention[] Mentions(IEnumerable<string> feedback)
    {
        var rows = feedback.ToArray();
        return Topics.Select(t => new SkillMention(t.Topic,
            rows.Count(x => Regex.IsMatch(x, t.Pattern, RegexOptions.IgnoreCase | RegexOptions.CultureInvariant))))
            .Where(x => x.AssessmentCount > 0).OrderByDescending(x => x.AssessmentCount)
            .ThenBy(x => x.Topic, StringComparer.Ordinal).Take(6).ToArray();
    }

    // Saved plan headings are evidence of planned content, not proof that it was delivered.
    public static object[] SummarizePlans(IEnumerable<PlanHistoryRow> plans) => plans.Select(p => new
    {
        p.SessionNo,
        title = PlanContextBudget.Excerpt(p.Title, 100),
        plannedTopics = p.Content.Split('\n', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .Take(5).Select(line => PlanContextBudget.Excerpt(line.Split('·')[0], 90)).ToArray()
    }).Cast<object>().ToArray();
}
