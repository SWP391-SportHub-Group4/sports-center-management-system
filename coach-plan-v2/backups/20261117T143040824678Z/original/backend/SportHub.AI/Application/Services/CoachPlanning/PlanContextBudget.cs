using System.Text;
using System.Text.Encodings.Web;
using System.Text.Json;
using System.Text.RegularExpressions;
using SportHub.BuildingBlocks.SharedKernel.Errors;

namespace SportHub.AI.Application.Services.CoachPlanning;

/// <summary>Bound UTF-8 bytes, not a claim about exact Gemini token counts. Never drop profile safety notes.</summary>
public static class PlanContextBudget
{
    public const int ContextBytes = 12_000;
    public const int StageBytes = 32_000;
    public const int HistorySessions = 3;
    public const int RecentPersonalResults = 5;
    public const int ClassAssessmentSample = 60;
    public const int HistoryExcerptCharacters = 700;
    private static readonly JsonSerializerOptions Options = new(JsonSerializerDefaults.Web)
    {
        Encoder = JavaScriptEncoder.UnsafeRelaxedJsonEscaping
    };
    // These are contact-pattern reductions, not a guarantee of anonymization of free text.
    private static readonly Regex Email = new(@"[\w.+-]+@[\w.-]+\.[\w-]+", RegexOptions.CultureInvariant);
    private static readonly Regex Phone = new(@"(?<!\w)(?:\+?\d[ .()-]?){9,15}(?!\w)", RegexOptions.CultureInvariant);

    public static string Clean(string? value) => Phone.Replace(Email.Replace(value?.Trim() ?? "", "[contact omitted]"), "[contact omitted]");
    public static string Excerpt(string? value, int max = HistoryExcerptCharacters)
    {
        var text = Clean(value);
        if (text.Length <= max) return text;
        // Avoid separating UTF-16 surrogate pairs.
        var end = char.IsHighSurrogate(text[max - 1]) ? max - 1 : max;
        return text[..end] + "… [excerpt]";
    }
    public static string Serialize(object value) => JsonSerializer.Serialize(value, Options);
    public static string Bound(object value, int limit = ContextBytes)
    {
        var json = Serialize(value);
        if (Encoding.UTF8.GetByteCount(json) > limit)
            throw new BadRequestException("ai_plan_context_too_large", "The lesson context is too large for a verified AI plan. Review the student notes or narrow the plan scope.");
        return json;
    }
    public static JsonElement Element(string json) => JsonSerializer.Deserialize<JsonElement>(json);
}
