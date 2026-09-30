using SportHub.BuildingBlocks.SharedKernel.Errors;
using SportHub.Scheduling.Domain.Rules;

namespace SportHub.Scheduling.Tests.Unit;

public sealed class CourseScheduleRulesTests
{
    [Fact]
    public void Generates_exact_count_in_time_order_using_Vietnam_timezone_and_sport_duration()
    {
        var sessions = CourseRules.GenerateSessions(new(2032, 3, 1), 5,
            [(1, new(18, 0)), (1, new(8, 0)), (3, new(10, 0))], 120);
        Assert.Equal(5, sessions.Count);
        Assert.Equal(new DateTime(2032, 3, 1, 1, 0, 0, DateTimeKind.Utc), sessions[0].StartAtUtc);
        Assert.Equal(Enumerable.Range(1, 5), sessions.Select(s => s.SessionNo));
        Assert.Equal(sessions.OrderBy(s => s.StartAtUtc), sessions);
        Assert.All(sessions, s => Assert.Equal(TimeSpan.FromMinutes(120), s.EndAtUtc - s.StartAtUtc));
    }

    [Theory]
    [InlineData(0)] [InlineData(101)]
    public void Invalid_session_count_is_rejected(int count)
        => Assert.Throws<BadRequestException>(() => CourseRules.GenerateSessions(new(2032, 3, 1), count, [(1, new(9, 0))], 90));

    [Fact]
    public void Missing_invalid_duplicate_or_misaligned_rules_are_rejected()
    {
        Assert.Throws<BadRequestException>(() => CourseRules.GenerateSessions(new(2032, 3, 1), 3, [], 90));
        Assert.Throws<BadRequestException>(() => CourseRules.GenerateSessions(new(2032, 3, 1), 3, [(7, new(9, 0))], 90));
        Assert.Throws<BadRequestException>(() => CourseRules.GenerateSessions(new(2032, 3, 1), 3, [(2, new(9, 0))], 90));
        Assert.Throws<BadRequestException>(() => CourseRules.GenerateSessions(new(2032, 3, 1), 3, [(1, new(9, 0)), (1, new(9, 0))], 90));
    }

    [Fact]
    public void Capacity_price_and_threshold_use_course_rules()
    {
        Assert.Throws<BadRequestException>(() => CourseRules.ValidateCapacity(5, 12, 4));
        Assert.Throws<BadRequestException>(() => CourseRules.ValidateCapacity(13, 12, 20));
        Assert.Throws<BadRequestException>(() => CourseRules.ValidatePrice(100_001));
        Assert.Equal(3, CourseRules.BreakEvenThreshold(200_001, 100_000));
    }
}
