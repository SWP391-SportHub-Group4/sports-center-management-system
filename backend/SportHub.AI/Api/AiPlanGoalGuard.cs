using System.Text.RegularExpressions;
using System.Globalization;
using System.Text;

namespace SportHub.AI.Api;

/// <summary>
/// Deterministic guardrails for training goals. Semantic validation remains mandatory.
/// Only the AI Plan endpoint uses this class; it has no dependency on either chatbox.
/// </summary>
public static class AiPlanGoalGuard
{
    public const int MaximumLength = 1000;

    private static readonly RegexOptions Flags = RegexOptions.IgnoreCase | RegexOptions.CultureInvariant | RegexOptions.Compiled;

    private static readonly Regex ExcessiveRepeats = new(@"(.)\1{5,}|\b([a-z]{2,7})\2{2,}\b", Flags);
    private static readonly Regex RepeatedChunks = new(@"(.{2,6})\1{2,}", Flags);
    private static readonly Regex DeliberateInsults = new(@"\b(ngu|xàm|nhảm|đần|dốt|óc chó|stupid|idiotic|dumb|nonsense)\b", Flags);
    private static readonly Regex NoImprovement = new(
        @"\b(?:không|khong|ko|chẳng|chả|đừng|dont|don't|do not|never)\s+(?:(?:muốn|muon|cần|can|thích|thich|mong|định|dinh|want|need|intend|wish|plan|expect|để|de)\s+)?(?:tiến bộ|tien bo|cải thiện|cai thien|phát triển|phat trien|nâng cao|nang cao|giỏi lên|gioi len|giỏi hơn|gioi hon|thăng tiến|thang tien|tiến triển|tien trien|tốt hơn|tot hon|improve|progress|get better|develop|learn|học|hoc|luyện|luyen)\b", Flags);
    private static readonly Regex RegressObjective = new(
        @"\b(?:muốn|muon|cố tình|co tinh|tập để|tap de|luyện để|luyen de|aim to|want to|train to|practice to)\s+(?:tập |tap |luyện |luyen )?(?:sai kỹ thuật|sai ky thuat|yếu đi|yeu di|kém đi|kem di|tệ hơn|te hon|chấn thương|chan thuong|làm đau|lam dau|hurt|injure|worsen|regress|become worse|unlearn)\b", Flags);
    private static readonly Regex IntentionalStagnation = new(
        @"\b(?:tập|tap|luyện|luyen|train|practice)\b.{0,90}\b(?:để|de|so that|in order to)\s+(?:không|khong|ko|never|not)\s+(?:tiến bộ|tien bo|cải thiện|cai thien|giỏi|gioi|improve|progress|learn)\b", Flags);
    // Directional intent is different from describing a current weakness.
    // "đập cầu còn yếu" describes a baseline; "tập đập cầu cho yếu" requests regression.
    // Fold Vietnamese diacritics for robust matching of colloquial and unaccented input.
    private static readonly Regex RegressionByPurpose = new(
        @"\b(?:cho|de|nham|nham den|voi muc dich|lam|khien|tro nen|de co the|so that|in order to|to|make|become|turn|aim to|want to)\s+(?:(?:minh|toi|em|ban than|ky thuat|cu danh|cu dap|danh cau|dap cau|the luc|hieu suat|ban than minh|my|me|myself)\s+)?(?:(?:cang|ngay cang|them|more)\s+)?(?:yeu|kem|te|do|cham|sai|thua|that bai|worse|weaker|bad|poor|slow|incorrect|wrong|get worse|get weaker|play worse|play badly|lose skill|lose skills)\b", Flags);
    private static readonly Regex RegressionOutcomes = new(
        @"\b(?:tap|luyen|hoc|train|practice|learn|muon|want|aim|co tinh)\b.{0,110}\b(?:giam|mat|huy|bo)\s+(?:ky nang|the luc|suc ben|phong do|hieu suat|kha nang|skill|strength|performance|progress)\b", Flags);
    private static readonly Regex ImprovementNegation = new(
        @"\b(?:khong|ko|chang|cha|dung|never|not|dont|do not|without)\s+(?:(?:muon|can|thich|dinh|bao gio|can phai|need|want|wish|ever)\s+)?(?:tien bo|tien trien|cai thien|phat trien|nang cao|gioi hon|gioi len|kha hon|tot hon|manh hon|khoe hon|hoc duoc|improve|progress|develop|learn|get better|get stronger)\b", Flags);
    private static readonly Regex ExplicitGoalToRegress = new(
        @"\b(?:de|cho|nham|so that|in order to|to)\s+(?:khong|ko|never|not)\s+(?:tien bo|tien trien|cai thien|phat trien|nang cao|gioi|manh|tot hon|kha hon|learn|improve|progress|develop|get better)\b", Flags);
    private static readonly Regex IntentionalDegradation = new(
        @"\b(?:muon|de|cho|co tinh|quyet tam|aim to|want to|deliberately|intentionally)\b.{0,90}\b(?:yeu di|yeu hon|kem di|kem hon|te di|te hon|sai ky thuat|mat ky nang|thua nhieu hon|thut lui|worsen|regress|be worse|get worse|lose skill|become weaker|get weaker|play worse|play badly)\b", Flags);
    private static readonly Regex ExplicitBadTechnique = new(@"\b(?:tập|tap|luyện|luyen|practice|train)\s+(?:để |de |cho |to )?(?:sai kỹ thuật|sai ky thuat|sai động tác|sai dong tac|wrong technique|bad technique)\b", Flags);
    private static readonly Regex Injection = new(
        @"(?:ignore (?:previous|all|the) instructions|bỏ qua (?:mọi |tất cả )?(?:quy tắc|hướng dẫn|kiểm tra)|bo qua (?:quy tac|huong dan|kiem tra)|(?:return|trả về|tra ve|output)\s+(?:json\s+)?(?:valid|pass)|system prompt|developer message)", Flags);
    private static readonly Regex OffTopic = new(
        @"\b(sql|python|javascript|coding|lập trình|lap trinh|code|bitcoin|chứng khoán|chung khoan|bầu cử|bau cu)\b", Flags);
    private static readonly Regex SportAction = new(
        @"\b(?:tập|tap|luyện|luyen|học|hoc|cải thiện|cai thien|nâng cao|nang cao|tăng|tang|giảm|giam|kỹ thuật|ky thuat|đập cầu|dap cau|sức bền|suc ben|thể lực|the luc|footwork|smash|drill|workout|exercise|fitness|train|training|practice|improve|strength|endurance|serve|stroke|badminton|basketball)\b", Flags);
    private static readonly Regex JustWeather = new(
        @"\b(?:trời|troi|thời tiết|thoi tiet|mưa|mua|nắng|nang|weather|raining|sunny)\b", Flags);

    public static string? RejectionReason(string? goal)
    {
        if (string.IsNullOrWhiteSpace(goal)) return "empty";
        var value = Regex.Replace(goal.Trim().Normalize(), @"\s+", " ");
        if (value.Length < 5 || value.Length > MaximumLength || !value.Any(char.IsLetter)) return "length_or_empty";
        if (ExcessiveRepeats.IsMatch(value) || RepeatedChunks.IsMatch(value)) return "gibberish";
        if (Regex.Replace(value, @"\s+", "").Length >= 16 && !value.Contains(' ')) return "uninterpretable";
        if (Injection.IsMatch(value)) return "prompt_injection";
        if (DeliberateInsults.IsMatch(value)) return "derogatory_or_meaningless";
        if (NoImprovement.IsMatch(value) || IntentionalStagnation.IsMatch(value)) return "explicitly_rejects_improvement";
        if (RejectsProgressOrRequestsRegression(value)) return "deliberately_requests_regression";
        if (RegressObjective.IsMatch(value) || HasDeliberateBadTechnique(value)) return "deliberately_wrong_or_harmful";
        if (OffTopic.IsMatch(value)) return "off_topic";
        if (JustWeather.IsMatch(value) && !SportAction.IsMatch(value)) return "weather_is_not_training_goal";
        return null; // Not approval: the independent semantic model MUST still pass.
    }

    private static string FoldForIntent(string value)
    {
        var decomposed = value.Replace('đ', 'd').Replace('Đ', 'D').Normalize(NormalizationForm.FormD);
        var builder = new StringBuilder(decomposed.Length);
        foreach (var character in decomposed)
        {
            if (CharUnicodeInfo.GetUnicodeCategory(character) != UnicodeCategory.NonSpacingMark)
                builder.Append(char.ToLowerInvariant(character));
        }
        return Regex.Replace(builder.ToString().Normalize(NormalizationForm.FormC), @"\s+", " ");
    }

    private static bool RejectsProgressOrRequestsRegression(string value)
    {
        var folded = FoldForIntent(value);
        // Do not reject ordinary descriptions of weaknesses, e.g. "đập cầu còn yếu".
        // A stated purpose of becoming weaker or worse is different from the baseline.
        return RegressionByPurpose.IsMatch(folded) || RegressionOutcomes.IsMatch(folded)
            || ImprovementNegation.IsMatch(folded) || ExplicitGoalToRegress.IsMatch(folded)
            || IntentionalDegradation.IsMatch(folded);
    }

    private static bool HasDeliberateBadTechnique(string value)
    {
        foreach (Match match in ExplicitBadTechnique.Matches(value))
        {
            // "không tập sai kỹ thuật" means avoid incorrect technique, not request it.
            var prefix = value[..match.Index];
            if (Regex.IsMatch(prefix, @"(?:không|khong|ko|đừng|dung|avoid|never)\s+(?:muốn\s+)?$", Flags))
                continue;
            return true;
        }
        return false;
    }

    public static bool IsValidNormalizedGoal(string original, string normalized)
    {
        if (string.IsNullOrWhiteSpace(normalized) || normalized.Length > 350) return false;
        return RejectionReason(original) is null && RejectionReason(normalized) is null;
    }

    public static bool LooksLikeExercisePlan(string? plan, bool sessionScope)
    {
        if (string.IsNullOrWhiteSpace(plan) || plan.Trim().Length < 75) return false;
        var rows = plan.Split('\n', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
        if (rows.Length < 4 || rows.Length > 24) return false;
        if (rows.Any(x => x.Length > 400)) return false;
        // The generator is explicitly required to include sets and reps, not just times.
        var prescriptions = Regex.Matches(plan,
            @"\b\d+\s*(?:hiệp|hiep|sets?|set)\s*(?:[x×*]|by)\s*\d+\s*(?:lần|lan|reps?|rep)\b", Flags).Count;
        return prescriptions >= (sessionScope ? 3 : 2);
    }
}
