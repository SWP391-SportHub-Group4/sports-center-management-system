using System.Text;
using System.Text.Json;
using SportHub.AI.Application.Services.CoachPlanning;
using SportHub.BuildingBlocks.SharedKernel.Errors;

namespace SportHub.Scheduling.Tests.Unit;

public sealed class CoachPlanContextTests
{
    private static CoachPlanSnapshot Fixture(params PlanProfile[] profiles) => new(
        "Badminton", 12, new PlanSession(4, 60), profiles.Length + 1, profiles, new AttendanceSummary(8, 2), 3,
        new ScoreSummary(4, 3.5, 5, "improving"), new ScoreSummary(2, 2.5, 3, "insufficient_data"),
        [new HistoricalSession(3, 4, 3.5)], [new PlanHistoryRow(3, "Footwork", "Grip · 2 sets × 10 reps\nFootwork · 3 sets × 10 reps")],
        [new SkillMention("smash", 2)], 4, [new AssessmentExcerpt(3, 5, "Selected student's feedback", false)]);

    [Fact]
    public void Session_aggregates_and_never_serializes_individual_profile_goals_or_assessments()
    {
        var data = Fixture(new("Private goal: smash more consistently", "Beginner", "No jumping", "LightlyActive", 2, 17),
            new("Private goal: footwork", "Advanced", "No jumping", "Active", 4, 68),
            new("Private goal: serve", "Beginner", "Contact example@example.invalid", null, null));
        var json = SessionPlanContextBuilder.Build(data, "Improve smash", "Improve smash", "Beginner");
        var value = PlanContextBudget.Element(json);
        var cohort = value.GetProperty("cohort");
        Assert.Equal(4, cohort.GetProperty("totalStudents").GetInt32());
        Assert.Equal(1, cohort.GetProperty("missingProfiles").GetInt32());
        Assert.Equal(2, cohort.GetProperty("experienceDistribution").GetProperty("Beginner").GetInt32());
        Assert.Equal(1, cohort.GetProperty("ageGroups").GetProperty("under18").GetInt32());
        Assert.Equal(2, cohort.GetProperty("ageGroups").GetProperty("unknown").GetInt32());
        Assert.Contains(cohort.GetProperty("selfReportedNotes").EnumerateArray(), n =>
            n.GetProperty("selfReportedNote").GetString() == "No jumping" && n.GetProperty("count").GetInt32() == 2);
        Assert.DoesNotContain("Private goal:", json);
        Assert.DoesNotContain("Selected student's feedback", json);
        Assert.DoesNotContain("example@example.invalid", json);
        Assert.False(value.TryGetProperty("authorizedMemberIds", out _));
        Assert.Equal(60, value.GetProperty("targetSession").GetProperty("durationMinutes").GetInt32());
        Assert.True(Encoding.UTF8.GetByteCount(json) <= PlanContextBudget.ContextBytes);
    }

    [Fact]
    public void Personal_uses_only_the_selected_student_and_explicit_session_or_course_scope()
    {
        var data = Fixture(new("Improve footwork", "Intermediate", "Avoid overhead motions", "LightlyActive", 3, 25)) with { StudentCount = 1 };
        var json = PersonalPlanContextBuilder.Build(data, "Improve footwork", "Improve footwork", "Beginner");
        var value = PlanContextBudget.Element(json);
        Assert.False(value.TryGetProperty("cohort", out _));
        Assert.Equal("Beginner", value.GetProperty("level").GetString());
        Assert.Equal("Intermediate", value.GetProperty("student").GetProperty("savedExperience").GetString());
        Assert.Equal("Avoid overhead motions", value.GetProperty("student").GetProperty("selfReportedNote").GetString());
        Assert.Equal(4, value.GetProperty("targetSession").GetProperty("sessionNo").GetInt32());
        Assert.Equal(1, value.GetProperty("recentAssessments").GetArrayLength());
        Assert.Equal(2, value.GetProperty("previousSameCoachClassProgress").GetProperty("count").GetInt32());
        var course = PlanContextBudget.Element(PersonalPlanContextBuilder.Build(data with { TargetSession = null }, "Improve footwork", "Improve footwork", "Beginner"));
        Assert.Equal(JsonValueKind.Null, course.GetProperty("targetSession").ValueKind);
    }

    [Fact]
    public void Missing_information_is_not_fabricated()
    {
        var data = Fixture() with { StudentCount = 1, Attendance = new(0, 0), CurrentProgress = TrainingProgressAnalyzer.Summarize([]) };
        var value = PlanContextBudget.Element(PersonalPlanContextBuilder.Build(data, "Improve footwork", "Improve footwork", "Beginner"));
        Assert.False(value.GetProperty("student").GetProperty("profileAvailable").GetBoolean());
        Assert.Equal(JsonValueKind.Null, value.GetProperty("student").GetProperty("savedExperience").ValueKind);
        Assert.Equal(JsonValueKind.Null, value.GetProperty("student").GetProperty("attendance").GetProperty("rate").ValueKind);
        Assert.Equal(JsonValueKind.Null, value.GetProperty("currentClassProgress").GetProperty("average").ValueKind);
    }

    [Fact]
    public void Budget_omits_optional_history_but_retains_full_safety_notes()
    {
        var note = "No overhead movements. " + new string('a', 900);
        var plans = Enumerable.Range(1, 100).Select(i => new PlanHistoryRow(i, new string('x', 100),
            string.Join("\n", Enumerable.Repeat(new string('y', 90), 5)))).ToArray();
        var data = Fixture(new("Improve footwork", "Beginner", note, null, null)) with { Plans = plans };
        var json = SessionPlanContextBuilder.Build(data, "Improve footwork", "Improve footwork", "Beginner");
        Assert.Contains(note, json);
        Assert.True(PlanContextBudget.Element(json).GetProperty("omittedPlanCount").GetInt32() > 0);
        Assert.True(Encoding.UTF8.GetByteCount(json) <= PlanContextBudget.ContextBytes);
        var huge = Fixture(new("Improve footwork", "Beginner", new string('x', 13000), null, null));
        var ex = Assert.Throws<BadRequestException>(() => SessionPlanContextBuilder.Build(huge, "Improve footwork", "Improve footwork", "Beginner"));
        Assert.Equal("ai_plan_context_too_large", ex.ErrorCode);
        Assert.Throws<BadRequestException>(() => PersonalPlanContextBuilder.Build(huge, "Improve footwork", "Improve footwork", "Beginner"));
    }

    [Fact]
    public void Score_trend_uses_chronological_1_to_5_observed_scores_and_no_imputed_zero()
    {
        var now = new DateTime(2026, 1, 1, 0, 0, 0, DateTimeKind.Utc);
        var scores = new[] { new ScoreRecord(5, now.AddDays(4), 4), new ScoreRecord(1, now, 1),
            new ScoreRecord(null, now.AddDays(5), 5), new ScoreRecord(2, now.AddDays(1), 2), new ScoreRecord(4, now.AddDays(2), 3) };
        var result = TrainingProgressAnalyzer.Summarize(scores);
        Assert.Equal(4, result.Count);
        Assert.Equal(3d, result.Average);
        Assert.Equal(5, result.Latest);
        Assert.Equal("improving", result.Trend);
        Assert.Equal("insufficient_data", TrainingProgressAnalyzer.Summarize(scores.Take(1)).Trend);
        Assert.Equal("unknown", TrainingProgressAnalyzer.Summarize([]).Trend);
    }

    [Fact]
    public void Mentions_are_per_assessment_not_word_frequency_and_do_not_invent_weakness()
    {
        var mentions = LessonHistoryAggregator.Mentions(["Smash smash is strong", "Đập cầu còn yếu", "Footwork is good"]);
        Assert.Equal(2, mentions.Single(x => x.Topic == "smash").AssessmentCount);
        Assert.Equal(1, mentions.Single(x => x.Topic == "footwork").AssessmentCount);
    }

    [Fact]
    public void Aggregated_class_context_is_smaller_than_raw_class_history_on_synthetic_data()
    {
        var profiles = Enumerable.Range(1, 12).Select(i => new PlanProfile("Smash training " + new string('g', 300) + i,
            "Beginner", "No jumping", "LightlyActive", 2)).ToArray();
        var raw = PlanContextBudget.Serialize(new { students = profiles, history = Enumerable.Range(1, 120)
            .Select(i => new { score = 3, content = new string('f', 400) + i }) });
        var compact = SessionPlanContextBuilder.Build(Fixture(profiles), "Improve smash", "Improve smash", "Beginner");
        Assert.True(Encoding.UTF8.GetByteCount(compact) < Encoding.UTF8.GetByteCount(raw) / 4);
    }

    [Theory]
    [InlineData("2", "10", true)]
    [InlineData("0", "10", false)]
    [InlineData("-1", "10", false)]
    [InlineData("2", "0", false)]
    [InlineData("2", "-3", false)]
    public void Output_guard_rejects_nonpositive_prescriptions(string sets, string reps, bool valid)
    {
        var plan = $"Warm-up · {sets} sets × {reps} reps of light mobility.\nFootwork · 3 sets × 10 reps of lateral stepping.\nGrip · 3 sets × 10 reps of controlled swing.\nCool-down · 1 set × 5 reps of gentle stretch.";
        Assert.Equal(valid, CoachPlanOutputGuard.Valid(plan, true));
    }
}
