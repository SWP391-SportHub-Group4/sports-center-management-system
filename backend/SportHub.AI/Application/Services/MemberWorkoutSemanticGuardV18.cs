using System.Globalization;
using System.Text;
using Microsoft.EntityFrameworkCore;
using SportHub.BuildingBlocks.Abstractions.Persistence;
using SportHub.BuildingBlocks.SharedKernel.Errors;
using SportHub.Membership.Domain.Entities;

namespace SportHub.AI.Application.Services;

/// <summary>
/// Member self-service ONLY. Conservative field-specific validation, before workout generation.
/// This is NOT a medical diagnosis, a guarantee of truthful disclosure, or a Coach AI Plan validator.
/// Unrecognized free text requires Member correction rather than being interpreted as safe.
/// </summary>
internal static class MemberWorkoutSemanticGuardV18
{
    internal static async Task EnsureValidAsync(ISportHubDbContext db, Guid authenticatedMemberId, CancellationToken ct)
    {
        if (authenticatedMemberId == Guid.Empty)
            throw new UnauthorizedAccessException("Authenticated Member is required.");
        var p = await db.Set<MemberTrainingProfile>().AsNoTracking()
            .SingleOrDefaultAsync(x => x.MemberId == authenticatedMemberId, ct);
        if (p is null)
            Reject("Save your Fitness profile before generating workout suggestions.");

        // GoalType and required measurements are checked by v17; here we reject unclear free text.
        RequireGoal(p.Goal);
        RequireAllergies(p.FoodAllergies);
        RequireLimitations(p.Notes);
    }

    internal static void RequireGoal(string? raw)
    {
        var s = Normalize(raw);
        if (s.Length < 4 || HasNoise(s))
            Reject("Your goal description is unclear. Enter a realistic training goal, e.g. 'gain muscle' or 'improve endurance'.");
        if (!Has(s, "muscle", "strength", "hypertrophy", "bulk", "gain weight", "lose weight", "fat loss", "fitness", "endurance", "stamina", "flexibility", "mobility", "running", "train", "workout", "healthy", "exercise", "weight maintenance", "maintain weight", "build muscle", "tang co", "tang can", "giam can", "giam mo", "the luc", "suc ben", "de o", "linh hoat", "tap gym", "tap luyen", "giu dang", "suc khoe"))
            Reject("Your goal does not describe a recognizable fitness objective. Update Main goal and its description.");
    }

    internal static void RequireAllergies(string? raw)
    {
        var s = Normalize(raw);
        if (s.Length == 0 || IsNone(s)) return;
        if (HasNoise(s))
            Reject("Food allergies/intolerances contain unclear text. Correct them or leave the field empty when none.");
        // An allergy field must describe an allergen/intolerance, not an ordinary meal.
        // Recognize common allergens, but do not claim that the list is exhaustive.
        bool credible = Has(s, "allerg", "intoleran", "di ung", "khong dung nap", "celiac", "coeliac", "lactose", "gluten", "peanut", "groundnut", "tree nut", "almond", "walnut", "cashew", "hazelnut", "milk", "dairy", "egg", "soy", "soya", "wheat", "fish", "shellfish", "shrimp", "prawn", "crab", "sesame", "dau phong", "lac", "sua", "trung", "dau nanh", "lua mi", "ca", "tom", "cua", "me", "hat dieu");
        if (!credible)
            Reject("Food allergies/intolerances do not identify a recognizable allergen or intolerance. If describing your diet, use the diet field instead.");
    }

    internal static void RequireLimitations(string? raw)
    {
        var s = Normalize(raw);
        if (s.Length == 0 || IsNone(s)) return;
        if (HasNoise(s))
            Reject("Injuries/medical limitations contain unclear text. Correct the description, or leave it empty if none.");
        // Do not treat unknown text as a cleared health status. Require a clear, relevant description.
        bool credible = Has(s, "injur", "pain", "ache", "surgery", "operation", "fracture", "sprain", "strain", "asthma", "diabetes", "hypertension", "arthritis", "knee", "back", "shoulder", "ankle", "wrist", "neck", "hip", "elbow", "acl", "disc", "herni", "chronic", "condition", "limitation", "avoid", "cannot", "restricted", "physio", "medical", "dau", "chan thuong", "phau thuat", "gay", "bong gan", "hen", "tieu duong", "huyet ap", "khop", "goi", "lung", "vai", "co tay", "co chan", "cot song", "han che", "tranh", "khong the", "benh", "suc khoe");
        if (!credible)
            Reject("Injuries/medical limitations are not clear enough to use safely for a workout. Clarify them in Fitness profile.");
    }

    private static bool HasNoise(string s)
    {
        if (s.Length > 1500 || Has(s, "xam xi", "xam xi xam xi", "asdf", "qwerty", "sdfgh", "blah", "lorem", "random", "12345", "test test")) return true;
        var letters = new string(s.Where(char.IsLetter).ToArray());
        if (letters.Length >= 8 && !s.Contains(' ') && letters.Count(c => "aeiouy".Contains(c)) * 100 < letters.Length * 15) return true;
        if (letters.Length >= 6 && letters.Distinct().Count() <= 2) return true;
        var words = s.Split(' ', StringSplitOptions.RemoveEmptyEntries);
        if (words.Length >= 2 && words.Distinct().Count() == 1) return true;
        return false;
    }

    private static bool IsNone(string s) => s is "none" or "no" or "no allergies" or "no injuries" or "no limitations" or "khong" or "khong co" or "khong bi" or "khong co gi" or "n a" or "na";
    private static bool Has(string s, params string[] words) => words.Any(w => s.Contains(w, StringComparison.Ordinal));
    private static string Normalize(string? input)
    {
        var output = new StringBuilder();
        foreach (var c in (input ?? "").Normalize(NormalizationForm.FormD))
            if (CharUnicodeInfo.GetUnicodeCategory(c) != UnicodeCategory.NonSpacingMark)
                output.Append(c is 'đ' or 'Đ' ? 'd' : char.ToLowerInvariant(c));
        return string.Join(' ', output.ToString().Normalize(NormalizationForm.FormC).Split((char[]?)null, StringSplitOptions.RemoveEmptyEntries));
    }
    [System.Diagnostics.CodeAnalysis.DoesNotReturn]
    private static void Reject(string message) =>
        throw new ConflictException("member_workout_input_invalid", message);
}
