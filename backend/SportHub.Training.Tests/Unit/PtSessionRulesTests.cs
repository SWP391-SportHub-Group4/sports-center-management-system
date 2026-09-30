using SportHub.Training.Domain.Enums;
using SportHub.Training.Domain.Rules;

namespace SportHub.Training.Tests.Unit;

public sealed class PtSessionRulesTests
{
    private static readonly DateTime SessionStart = new(2026, 10, 5, 12, 0, 0, DateTimeKind.Utc);

    [Fact]
    public void EndAtUtc_is_always_ninety_minutes_after_start()
    {
        Assert.Equal(SessionStart.AddMinutes(90), PtSessionRules.EndAtUtc(SessionStart));
    }

    [Fact]
    public void Change_deadline_is_twenty_four_hours_before_start()
    {
        Assert.Equal(SessionStart.AddHours(-24), PtSessionRules.ChangeDeadline(SessionStart));
    }

    [Fact]
    public void Request_one_tick_before_deadline_is_on_time()
    {
        var requestedAt = PtSessionRules.ChangeDeadline(SessionStart).AddTicks(-1);

        Assert.Equal(PtSessionTimingClassification.OnTime, PtSessionRules.ClassifyTiming(requestedAt, SessionStart));
    }

    [Fact]
    public void Request_exactly_at_deadline_is_on_time()
    {
        var requestedAt = PtSessionRules.ChangeDeadline(SessionStart);

        Assert.Equal(PtSessionTimingClassification.OnTime, PtSessionRules.ClassifyTiming(requestedAt, SessionStart));
    }

    [Fact]
    public void Request_one_tick_after_deadline_is_late()
    {
        var requestedAt = PtSessionRules.ChangeDeadline(SessionStart).AddTicks(1);

        Assert.Equal(PtSessionTimingClassification.Late, PtSessionRules.ClassifyTiming(requestedAt, SessionStart));
    }

    [Theory]
    [InlineData(9, 0, 10, 30, 10, 30, 12, 0, false)] // A ket thuc dung luc B bat dau -> khong giao
    [InlineData(9, 0, 10, 30, 10, 0, 11, 30, true)] // giao mot phan
    [InlineData(9, 0, 10, 30, 9, 0, 10, 30, true)] // trung het
    [InlineData(9, 0, 10, 30, 7, 0, 9, 0, false)] // B ket thuc dung luc A bat dau -> khong giao
    public void Overlaps_uses_half_open_interval(
        int aStartH, int aStartM, int aEndH, int aEndM,
        int bStartH, int bStartM, int bEndH, int bEndM,
        bool expected)
    {
        var day = new DateTime(2026, 10, 5, 0, 0, 0, DateTimeKind.Utc);
        var startA = day.AddHours(aStartH).AddMinutes(aStartM);
        var endA = day.AddHours(aEndH).AddMinutes(aEndM);
        var startB = day.AddHours(bStartH).AddMinutes(bStartM);
        var endB = day.AddHours(bEndH).AddMinutes(bEndM);

        Assert.Equal(expected, PtSessionRules.Overlaps(startA, endA, startB, endB));
    }
}
