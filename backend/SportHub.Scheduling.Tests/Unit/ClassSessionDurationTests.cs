using SportHub.BuildingBlocks.Abstractions.Configuration;
using SportHub.BuildingBlocks.SharedKernel.Errors;
using SportHub.Scheduling.Domain.Rules;

namespace SportHub.Scheduling.Tests.Unit;

public sealed class ClassSessionDurationTests
{
    [Theory]
    [InlineData(0)]
    [InlineData(-1)]
    [InlineData(721)]
    [InlineData(int.MaxValue)]
    public void Invalid_duration_is_rejected(int minutes)
        => Assert.Equal("invalid_session_minutes", Assert.Throws<BadRequestException>(
            () => CourseRules.ValidateSessionMinutes(minutes)).ErrorCode);

    [Theory]
    [InlineData(1)]
    [InlineData(60)]
    [InlineData(120)]
    [InlineData(720)]
    public void Every_generated_session_uses_the_class_duration(int minutes)
    {
        CourseRules.ValidateSessionMinutes(minutes);
        var sessions = CourseRules.GenerateSessions(new(2032, 3, 1), 4, [(1, new(8, 0))], minutes);
        Assert.All(sessions, s => Assert.Equal(TimeSpan.FromMinutes(minutes), s.EndAtUtc - s.StartAtUtc));
    }

    [Theory]
    [InlineData(8, 0, 1, true)]
    [InlineData(7, 59, 1, false)]
    [InlineData(18, 0, 120, true)]
    [InlineData(18, 1, 120, false)]
    [InlineData(19, 0, 60, true)]
    [InlineData(19, 0, 61, false)]
    [InlineData(20, 0, 1, false)]
    [InlineData(8, 0, 720, true)]
    [InlineData(23, 0, 120, false)]
    public void Full_session_must_fit_configured_center_hours(int hour, int minute, int duration, bool valid)
    {
        var center = new CenterOperatingHours(480, 1200);
        if (valid) center.EnsureSession(new(hour, minute), duration);
        else Assert.Equal("outside_center_hours", Assert.Throws<BadRequestException>(
            () => center.EnsureSession(new(hour, minute), duration)).ErrorCode);
    }
}
