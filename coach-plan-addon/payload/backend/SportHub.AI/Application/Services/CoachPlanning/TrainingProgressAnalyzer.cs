namespace SportHub.AI.Application.Services.CoachPlanning;

public sealed record AttendanceSummary(int Present, int Absent)
{
    public int Recorded => Present + Absent;
    public double? Rate => Recorded == 0 ? null : Math.Round((double)Present / Recorded, 3);
}
public sealed record ScoreSummary(int Count, double? Average, int? Latest, string Trend);
public sealed record ScoreRecord(int? Score, DateTime SessionEndedAt, int SessionNo);

public static class TrainingProgressAnalyzer
{
    // Scores are the existing 1–5 overall assessment, not invented per-skill ratings.
    public static ScoreSummary Summarize(IEnumerable<ScoreRecord> records)
    {
        var scores = records.Where(x => x.Score is >= 1 and <= 5)
            .OrderByDescending(x => x.SessionEndedAt).ThenByDescending(x => x.SessionNo)
            .Select(x => x.Score!.Value).ToArray();
        if (scores.Length == 0) return new(0, null, null, "unknown");
        var trend = "insufficient_data";
        if (scores.Length >= 4)
        {
            int window = Math.Min(3, scores.Length / 2);
            var delta = scores.Take(window).Average() - scores.Skip(window).Take(window).Average();
            trend = delta >= 0.5 ? "improving" : delta <= -0.5 ? "declining" : "stable";
        }
        return new(scores.Length, Math.Round(scores.Average(), 2), scores[0], trend);
    }
}
