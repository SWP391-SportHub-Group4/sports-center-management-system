using SportHub.Scheduling.Application.Services;
using SportHub.Scheduling.Domain.Entities;
using SportHub.Scheduling.Domain.Enums;
using SportHub.Scheduling.Threshold.Domain;

namespace SportHub.Scheduling.Tests.Unit;

public sealed class ClassCancellationRulesTests
{
    private static readonly DateTime Now = new(2030, 10, 22, 7, 0, 0, DateTimeKind.Utc);

    [Theory]
    [InlineData(-1, true)]
    [InlineData(0, true)]
    [InlineData(1, false)]
    public void Unevaluated_class_becomes_eligible_at_its_configured_deadline(int secondsUntilDeadline, bool expected)
    {
        var course = new Class { Status = ClassStatus.Published, ThresholdStatus = ThresholdStatus.NotEvaluated,
            BreakEvenThreshold = 6, ThresholdDeadlineUtc = Now.AddSeconds(secondsUntilDeadline) };
        Assert.Equal(expected, ClassCancellationRules.IsBelowThresholdDecision(course, 4, Now));
    }

    [Theory]
    [InlineData(ThresholdStatus.AtRisk, 4, true)]
    [InlineData(ThresholdStatus.AtRisk, 6, false)]
    [InlineData(ThresholdStatus.AtRisk, 7, false)]
    [InlineData(ThresholdStatus.Met, 4, false)]
    [InlineData(ThresholdStatus.WaivedByManager, 4, false)]
    public void Current_enrollment_and_opening_approval_are_respected(ThresholdStatus status, int count, bool expected)
    {
        var course = new Class { Status = ClassStatus.Published, ThresholdStatus = status,
            BreakEvenThreshold = 6, ThresholdDeadlineUtc = Now.AddDays(-1) };
        Assert.Equal(expected, ClassCancellationRules.IsBelowThresholdDecision(course, count, Now));
    }

    [Theory]
    [InlineData(ClassStatus.Draft)]
    [InlineData(ClassStatus.InProgress)]
    [InlineData(ClassStatus.Completed)]
    [InlineData(ClassStatus.Cancelled)]
    public void Other_lifecycle_states_do_not_allow_threshold_cancellation(ClassStatus status)
    {
        var course = new Class { Status = status, ThresholdStatus = ThresholdStatus.AtRisk, BreakEvenThreshold = 6 };
        Assert.False(ClassCancellationRules.IsBelowThresholdDecision(course, 4, Now));
    }
}
