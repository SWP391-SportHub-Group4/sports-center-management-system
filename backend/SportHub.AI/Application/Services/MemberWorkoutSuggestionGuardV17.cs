using System.Globalization;
using System.Text;
using Microsoft.EntityFrameworkCore;
using SportHub.BuildingBlocks.Abstractions.Persistence;
using SportHub.BuildingBlocks.SharedKernel.Errors;
using SportHub.Membership.Domain.Entities;
using SportHub.Membership.Domain.Enums;

namespace SportHub.AI.Application.Services;

/// <summary>
/// MEMBER SELF-SERVICE workout pre-generation guard. Not invoked by Coach workout
/// suggestion endpoint, Coach AI Plan, Coach Chatbox or Member Chatbox.
/// Rule-based validation cannot establish medical truth; unclear limitations
/// require correction before a workout suggestion is generated.
/// </summary>
internal static class MemberWorkoutSuggestionGuardV17
{
    internal static async Task EnsureValidAsync(ISportHubDbContext db, Guid memberId, CancellationToken ct)
    {
        var p = await db.Set<MemberTrainingProfile>().AsNoTracking()
            .SingleOrDefaultAsync(x => x.MemberId == memberId, ct);
        if (p is null || p.GoalType is null || p.DateOfBirth is null || p.Sex is null ||
            p.HeightCm is null || p.WeightKg is null || p.ActivityLevel is null ||
            p.TrainingDaysPerWeek is null)
            Reject("Complete and save your Fitness profile before generating a workout.");

        // Use valid structured inputs. Do not infer goal or level from arbitrary prose.
        if (p.HeightCm is < 100 or > 250 || p.WeightKg is < 30 or > 300 ||
            p.TrainingDaysPerWeek is < 1 or > 7 || p.SessionMinutes is < 15 or > 240)
            Reject("Your saved measurements or weekly schedule are invalid. Update Fitness profile.");
        if (p.DateOfBirth > DateOnly.FromDateTime(DateTime.UtcNow))
            Reject("Your saved date of birth is invalid. Update Fitness profile.");
        if (string.IsNullOrWhiteSpace(p.Goal) || LooksLikePlaceholder(p.Goal) || !GoalHasTrainingContext(p.Goal))
            Reject("Your goal description is not meaningful. Describe your training goal and save the profile.");
        if (GoalContradictsType(p.Goal, p.GoalType!.Value))
            Reject("Your goal description conflicts with your selected main goal. Update Fitness profile.");
        // Notes is the injuries / medical conditions / limitations field, NOT a free prompt to the AI.
        // Reject clearly synthetic or meaningless text; unfamiliar conditions cannot reliably be diagnosed here.
        if (!string.IsNullOrWhiteSpace(p.Notes) && LooksLikePlaceholder(p.Notes))
            Reject("Injuries or limitations contain unclear text. Describe a real limitation, or leave it empty if none.");
        if (!string.IsNullOrWhiteSpace(p.FoodAllergies) && LooksLikePlaceholder(p.FoodAllergies))
            Reject("Food allergies or intolerances contain unclear text. Correct or clear the field.");
    }

    internal static bool LooksLikePlaceholder(string? input)
    {
        if (string.IsNullOrWhiteSpace(input)) return false;
        var s = Normalize(input).Trim();
        if (s.Length > 2000) return true;
        var compact = new string(s.Where(char.IsLetter).ToArray());
        if (compact.Length == 0) return true;
        string[] knownPlaceholders = ["asdf", "asdasd", "qwerty", "qwertyuiop", "abc", "abcdef", "test",
            "testing", "random", "hello", "blah", "loremipsum", "123456", "sadsfghjkh", "sdfghjkl"];
        if (knownPlaceholders.Any(w => s.Replace(" ", "").Contains(w, StringComparison.Ordinal))) return true;
        if (compact.Length >= 8 && !s.Contains(' '))
        {
            var vowels = compact.Count(c => "aeiouy".Contains(c));
            if (vowels * 100 < compact.Length * 18) return true;
        }
        var distinct = compact.Distinct().Count();
        if (compact.Length >= 6 && distinct <= 2) return true;
        return false;
    }

    private static bool GoalHasTrainingContext(string goal)
    {
        var q = Normalize(goal);
        string[] vocabulary = ["muscle", "strength", "hypertrophy", "weight", "fitness", "fat", "endurance",
            "flexibility", "mobility", "stamina", "train", "workout", "sport", "running", "body",
            "health", "gain", "lose", "maintain", "build", "exercise", "fit", "kg",
            "tang co", "giam mo", "giam can", "the luc", "suc ben", "suc khoe",
            "tap luyen", "tap gym", "de o", "linh hoat", "giu dang", "tang can"];
        return vocabulary.Any(w => q.Contains(w, StringComparison.Ordinal));
    }

    private static bool GoalContradictsType(string goal, TrainingGoalType selected)
    {
        var q = Normalize(goal);
        // Reject only *clear* contradictions; do not claim full natural-language understanding.
        var explicitlyLose = Contains(q, "giam can", "giam mo", "lose weight", "weight loss", "fat loss");
        var explicitlyGain = Contains(q, "tang co", "xay co", "muscle gain", "build muscle", "hypertrophy");
        return selected switch
        {
            TrainingGoalType.MuscleGain => explicitlyLose && !explicitlyGain,
            TrainingGoalType.FatLoss => explicitlyGain && !explicitlyLose,
            _ => false
        };
    }

    private static bool Contains(string s, params string[] fragments) => fragments.Any(s.Contains);

    private static string Normalize(string input)
    {
        var b = new StringBuilder();
        foreach (var c in input.Normalize(NormalizationForm.FormD))
            if (CharUnicodeInfo.GetUnicodeCategory(c) != UnicodeCategory.NonSpacingMark)
                b.Append(c is 'đ' or 'Đ' ? 'd' : char.ToLowerInvariant(c));
        return b.ToString().Normalize(NormalizationForm.FormC);
    }

    [System.Diagnostics.CodeAnalysis.DoesNotReturn]
    private static void Reject(string message) =>
        throw new ConflictException("member_workout_input_invalid", message);
}
