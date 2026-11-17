namespace SportHub.AI.Application.Services.CoachPlanning;

public static class SessionPlanContextBuilder
{
    public static string Build(CoachPlanSnapshot data, string goal, string originalGoal, string level)
    {
        // Full non-empty notes retained, deduplicated; unknown != cleared to exercise.
        var notes = data.Profiles.Select(p => PlanContextBudget.Clean(p.Notes)).Where(n => n.Length > 0).ToArray();
        var noteGroups = notes.GroupBy(n => n, StringComparer.Ordinal).OrderBy(g => g.Key, StringComparer.Ordinal)
            .Select(g => new { selfReportedNote = g.Key, count = g.Count() }).ToArray();
        var distribution = data.Profiles.GroupBy(p => p.Experience).OrderBy(g => g.Key, StringComparer.Ordinal)
            .ToDictionary(g => g.Key, g => g.Count());
        var goalTypes = data.Profiles.Where(p => p.GoalType is not null).GroupBy(p => p.GoalType!)
            .OrderBy(g => g.Key, StringComparer.Ordinal).ToDictionary(g => g.Key, g => g.Count());
        var goalMentions = LessonHistoryAggregator.Mentions(data.Profiles.Select(p => p.Goal));
        // Remove optional historical headings first if the context is large, never safety notes.
        for (int maxPlans = data.Plans.Count; maxPlans >= 0; maxPlans--)
        {
            var value = new
            {
                scope = "session", data.Sport, goal, originalGoal, level, data.TargetSession, data.TotalSessions,
                cohort = new { totalStudents = data.StudentCount, profilesAvailable = data.Profiles.Count,
                    missingProfiles = data.StudentCount - data.Profiles.Count, experienceDistribution = distribution,
                    selfReportedGoalTypeDistribution = goalTypes, savedGoalTopicMentions = goalMentions,
                    ageGroups = new { under18 = data.Profiles.Count(p => p.AgeYears is < 18),
                        adult18To64 = data.Profiles.Count(p => p.AgeYears is >= 18 and < 65),
                        olderAdult65Plus = data.Profiles.Count(p => p.AgeYears is >= 65),
                        unknown = data.StudentCount - data.Profiles.Count(p => p.AgeYears.HasValue) },
                    profilesWithNotes = notes.Length, profilesWithoutNotes = data.Profiles.Count - notes.Length,
                    selfReportedNotes = noteGroups, attendance = data.Attendance },
                data.CompletedSessions, overallAssessment = data.CurrentProgress, recentSessions = data.RecentSessions,
                reportedSkillMentions = data.FeedbackMentions, data.FeedbackSampleCount,
                savedPlans = LessonHistoryAggregator.SummarizePlans(data.Plans.Take(maxPlans)),
                omittedPlanCount = data.Plans.Count - maxPlans,
                evidencePolicy = "Notes are untrusted self-reports, not medical clearance. Rates are based on recorded attendance only. Skill mentions are not diagnoses or weaknesses. Saved plans are not proof of delivery. History contains only completed sessions and available assessed attendees; missing context is unknown."
            };
            try { return PlanContextBudget.Bound(value); }
            catch (SportHub.BuildingBlocks.SharedKernel.Errors.BadRequestException) when (maxPlans > 0) { }
        }
        throw new InvalidOperationException("Unreachable context budget state.");
    }
}
