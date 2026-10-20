using SportHub.BuildingBlocks.Abstractions.Email;
using SportHub.Notification.Infrastructure;
using SportHub.Scheduling.Application.Services;

namespace SportHub.Scheduling.Tests.Unit;

public sealed class EmailPresentationTests
{
    [Fact]
    public void Coach_change_shows_full_session_and_only_the_changed_field()
    {
        var start = new DateTime(2026, 11, 2, 2, 0, 0, DateTimeKind.Utc);
        var html = SessionScheduleEmail.Render("Basketball fundamentals", 1,
            start, start.AddHours(2), "Basketball Class KC1", "Basketball Coach",
            start, start.AddHours(2), "Basketball Class KC1", "Replacement Coach", "Cover this session");
        Assert.Contains("02/11/2026, 09:00", html);
        Assert.Contains("11:00", html);
        Assert.Contains("Basketball Class KC1", html);
        Assert.Contains("Previously:</strong> Basketball Coach", html);
        Assert.Contains("Now:</strong> Replacement Coach", html);
        Assert.DoesNotContain("Previously:</strong> Basketball Class KC1", html);
        Assert.DoesNotContain("Previously:</strong> 02/11/2026", html);
    }

    [Fact]
    public void Free_text_is_escaped_and_reason_line_breaks_are_preserved()
    {
        var start = new DateTime(2026, 11, 2, 2, 0, 0, DateTimeKind.Utc);
        var html = SessionScheduleEmail.Render("Class <script>bad()</script>", 1,
            start, start.AddHours(1), "Court A", "Coach A", start, start.AddHours(1),
            "Court B", "Coach B", "First line\r\n<img src=x onerror=bad()>");
        Assert.DoesNotContain("<script>", html);
        Assert.DoesNotContain("<img", html);
        Assert.Contains("First line<br>&lt;img", html);
        var rendered = EmailTemplateRenderer.Render(new("SportHub - <script>title</script>", html));
        Assert.DoesNotContain("<script>", rendered);
        Assert.Contains("&lt;script&gt;title&lt;/script&gt;", rendered);
    }

    [Theory]
    [InlineData("<!doctype html><html><body>Existing receipt</body></html>")]
    [InlineData("<html><body>Existing activation email</body></html>")]
    public void Existing_full_documents_are_preserved(string document)
        => Assert.Equal(document, EmailTemplateRenderer.Render(new("Existing", document)));

    [Fact]
    public void Distinct_coaches_with_the_same_display_name_still_show_the_assignment_change()
    {
        var start = new DateTime(2026, 11, 2, 2, 0, 0, DateTimeKind.Utc);
        var html = SessionScheduleEmail.Render("Class", 1, start, start.AddHours(1), "Court", "Coach Nguyen",
            start, start.AddHours(1), "Court", "Coach Nguyen", "Substitute assignment", coachChanged: true);
        Assert.Contains("Previously:</strong> Coach Nguyen", html);
        Assert.Contains("Now:</strong> Coach Nguyen", html);
    }

    [Fact]
    public void Overnight_session_includes_both_vietnam_dates()
    {
        var start = new DateTime(2026, 11, 2, 16, 0, 0, DateTimeKind.Utc);
        var html = SessionScheduleEmail.Render("Class", 2, start, start.AddHours(2), "A", "Coach",
            start, start.AddHours(2), "B", "Coach", "Change room");
        Assert.Contains("02/11/2026, 23:00", html);
        Assert.Contains("03/11/2026, 01:00", html);
    }
}
