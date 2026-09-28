using SportHub.Scheduling.Domain.Enums;
using SportHub.Scheduling.Domain.Rules;

namespace SportHub.Scheduling.Tests.Unit;

public sealed class SessionRulesCancellationTests
{
    private static readonly DateTime SessionStart =
        new(2026, 9, 29, 12, 0, 0, DateTimeKind.Utc);

    [Fact]
    public void Cancellation_deadline_is_always_thirty_minutes_before_start()
    {
        var deadline = SessionRules.CancellationDeadline(SessionStart);

        Assert.Equal(SessionStart.AddMinutes(-30), deadline);
        Assert.Equal(30, SessionRules.CancellationDeadlineMinutes);
    }

    [Fact]
    public void Cancellation_one_tick_before_deadline_is_on_time()
    {
        var cancelledAt = SessionRules.CancellationDeadline(SessionStart).AddTicks(-1);

        var result = SessionRules.ClassifyCancellation(cancelledAt, SessionStart);

        Assert.Equal(EnrollmentStatus.CancelledOnTime, result);
    }

    [Fact]
    public void Cancellation_exactly_at_deadline_is_on_time()
    {
        var cancelledAt = SessionRules.CancellationDeadline(SessionStart);

        var result = SessionRules.ClassifyCancellation(cancelledAt, SessionStart);

        Assert.Equal(EnrollmentStatus.CancelledOnTime, result);
    }

    [Fact]
    public void Cancellation_one_tick_after_deadline_is_late()
    {
        var cancelledAt = SessionRules.CancellationDeadline(SessionStart).AddTicks(1);

        var result = SessionRules.ClassifyCancellation(cancelledAt, SessionStart);

        Assert.Equal(EnrollmentStatus.CancelledLate, result);
    }
}
