using System.Text.RegularExpressions;
using SportHub.AI.Api;
namespace SportHub.AI.Application.Services.CoachPlanning;
public static class CoachPlanOutputGuard
{
    private static readonly Regex Prescription = new(@"(?<![\w\d+.,-])(?<sets>[+-]?\d+)\s*(?:hiệp|hiep|sets?)\s*(?:[x×*]|by)\s*(?<reps>[+-]?\d+)\s*(?:lần|lan|reps?)\b", RegexOptions.IgnoreCase | RegexOptions.CultureInvariant);
    public static bool Valid(string? plan, bool sessionScope = true)
    {
        if (plan is null || plan.Length > 8000 || !AiPlanGoalGuard.LooksLikeExercisePlan(plan, true)) return false;
        var rows = plan.Split('\n', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
        return rows.Length is >= 4 and <= 10 && rows.All(row => row.IndexOf('·') > 0 && row.IndexOf('·') < row.Length - 1 &&
            Prescription.Matches(row).Count > 0 && Prescription.Matches(row).Cast<Match>().All(m =>
                int.TryParse(m.Groups["sets"].Value, out var sets) && sets > 0 &&
                int.TryParse(m.Groups["reps"].Value, out var reps) && reps > 0));
    }
}
