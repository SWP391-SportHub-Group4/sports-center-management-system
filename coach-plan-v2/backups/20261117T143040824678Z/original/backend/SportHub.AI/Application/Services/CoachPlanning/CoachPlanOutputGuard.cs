using System.Text.RegularExpressions;
using SportHub.AI.Api;

namespace SportHub.AI.Application.Services.CoachPlanning;

public static class CoachPlanOutputGuard
{
    private static readonly Regex Prescription = new(@"(?<![\w\d+-])(?<sets>[+-]?\d+)\s*(?:hiệp|hiep|sets?|set)\s*(?:[x×*]|by)\s*(?<reps>[+-]?\d+)\s*(?:lần|lan|reps?|rep)\b", RegexOptions.IgnoreCase | RegexOptions.CultureInvariant);
    public static bool Valid(string? plan, bool sessionScope)
    {
        if (plan is null || plan.Length > 8000 || !AiPlanGoalGuard.LooksLikeExercisePlan(plan, sessionScope)) return false;
        var rows = plan.Split('\n', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
        if (rows.Any(row => row.IndexOf('·') <= 0 || row.IndexOf('·') == row.Length - 1)) return false;
        // Preserve separate non-exercise adaptation/advice lines, but reject any zero/overflow prescription.
        // Internal review must verify that every actual exercise contains positive sets and reps.
        return Prescription.Matches(plan).Cast<Match>().All(m =>
            int.TryParse(m.Groups["sets"].Value, out var sets) && sets > 0 &&
            int.TryParse(m.Groups["reps"].Value, out var reps) && reps > 0);
    }
}
