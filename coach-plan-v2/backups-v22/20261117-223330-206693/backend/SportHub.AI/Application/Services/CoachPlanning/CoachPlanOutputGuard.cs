using System.Text.RegularExpressions;
namespace SportHub.AI.Application.Services.CoachPlanning;
public static class CoachPlanOutputGuard
{
    private static readonly Regex Prescription = new(
        @"(?<![\w\d+.,-])(?<sets>[+-]?\d+)\s*sets?\s*(?:[x×*]|by)\s*(?<amount>[+-]?\d+)\s*(?:reps?|seconds?|secs?|minutes?|mins?)\b",
        RegexOptions.IgnoreCase | RegexOptions.CultureInvariant);
    // Reject Vietnamese prescription units even if an English prescription also appears.
    private static readonly Regex VietnameseUnits = new(
        @"\b\d+\s*(?:hiệp|hiep|lần|lan|giây|giay|phút|phut)\b",
        RegexOptions.IgnoreCase | RegexOptions.CultureInvariant);
    public static bool Valid(string? plan, bool sessionScope = true)
    {
        if (string.IsNullOrWhiteSpace(plan) || plan.Trim().Length < 75 || plan.Length > 8000 || VietnameseUnits.IsMatch(plan)) return false;
        var rows = plan.Split('\n', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
        if (rows.Length is < 4 or > 10) return false;
        foreach (var row in rows)
        {
            if (row.Length > 400) return false;
            var separator = row.IndexOf('·');
            if (separator <= 0 || separator >= row.Length - 1 || string.IsNullOrWhiteSpace(row[..separator])) return false;
            var matches = Prescription.Matches(row[(separator + 1)..]);
            if (matches.Count == 0) return false;
            foreach (Match match in matches)
            {
                if (!int.TryParse(match.Groups["sets"].Value, out var sets) || sets <= 0 ||
                    !int.TryParse(match.Groups["amount"].Value, out var amount) || amount <= 0) return false;
            }
        }
        // Full natural-language English validation is delegated to the independent review.
        return true;
    }
}
