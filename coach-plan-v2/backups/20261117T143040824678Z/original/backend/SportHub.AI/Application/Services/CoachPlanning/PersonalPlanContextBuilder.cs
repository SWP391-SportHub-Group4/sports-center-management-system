namespace SportHub.AI.Application.Services.CoachPlanning;

public static class PersonalPlanContextBuilder
{
    public static string Build(CoachPlanSnapshot data, string goal, string originalGoal, string level)
    {
        var profile = data.Profiles.SingleOrDefault();
        // Selected student only; no other member's goals, identities or raw scores.
        for (int historyCount = data.PersonalAssessments.Count; historyCount >= 0; historyCount--)
        {
            for (int maxPlans = data.Plans.Count; maxPlans >= 0; maxPlans--)
            {
                var value = new
                {
                    scope = "personal", data.Sport, goal, originalGoal, level, data.TargetSession, data.TotalSessions,
                    student = new { profileAvailable = profile is not null,
                        savedGoal = profile is null ? null : PlanContextBudget.Clean(profile.Goal),
                        savedExperience = profile?.Experience, savedGoalType = profile?.GoalType,
                        selfReportedAgeYears = profile?.AgeYears, adultGymBodyMetrics = profile?.Body,
                        selfReportedNote = profile is null ? null : PlanContextBudget.Clean(profile.Notes),
                        activityLevel = profile?.Activity, trainingDaysPerWeek = profile?.TrainingDays,
                        attendance = data.Attendance },
                    data.CompletedSessions, currentClassProgress = data.CurrentProgress, previousSameCoachClassProgress = data.PriorProgress,
                    recentSessions = data.RecentSessions,
                    recentAssessments = data.PersonalAssessments.Take(historyCount),
                    omittedAssessmentCount = data.PersonalAssessments.Count - historyCount,
                    savedPlans = LessonHistoryAggregator.SummarizePlans(data.Plans.Take(maxPlans)),
                    omittedPlanCount = data.Plans.Count - maxPlans,
                    evidencePolicy = "Selected student's self-reported profile and scored assessments only. Assessment excerpts can be incomplete, and missing information is not medical clearance. Prior records are same-sport, same-coach only. Scores are overall 1–5, not per-skill ratings. Adult Gym body metrics are self-reported, not a diagnosis or permission to exercise. Attendance reflects recorded events. Coach must verify restrictions and any missing history before applying."
                };
                try { return PlanContextBudget.Bound(value); }
                catch (SportHub.BuildingBlocks.SharedKernel.Errors.BadRequestException) when (historyCount > 0 || maxPlans > 0) { }
            }
        }
        throw new InvalidOperationException("Unreachable context budget state.");
    }
}
