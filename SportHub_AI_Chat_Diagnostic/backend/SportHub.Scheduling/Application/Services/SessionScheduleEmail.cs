using System.Globalization;
using SportHub.BuildingBlocks.Abstractions.Email;

namespace SportHub.Scheduling.Application.Services;

public static class SessionScheduleEmail
{
    public static string Render(string className, int sessionNo,
        DateTime oldStart, DateTime oldEnd, string oldRoom, string oldCoach,
        DateTime newStart, DateTime newEnd, string newRoom, string newCoach, string reason,
        bool makeup = false, bool coachChanged = false, bool roomChanged = false)
    {
        var before = Schedule(oldStart, oldEnd);
        var after = Schedule(newStart, newEnd);
        return EmailContent.Paragraph($"{className} · Session {sessionNo}")
            + EmailContent.Paragraph(makeup ? "This session was cancelled and a makeup session has been scheduled." : "The session schedule has been updated.")
            + "<h2 style=\"margin:24px 0 8px;font-size:18px;\">" + (makeup ? "Makeup session" : "Updated session") + "</h2>"
            + "<p style=\"margin:0 0 4px;color:#52645a;font-size:14px;\">Vietnam time (UTC+7)</p>"
            + EmailContent.Details(("Date & time", after), ("Room", newRoom), ("Coach", newCoach))
            + "<h2 style=\"margin:24px 0 12px;font-size:18px;\">What changed</h2>"
            + EmailContent.Changes(("Date & time", before, after))
            + (roomChanged || oldRoom != newRoom ? EmailContent.Change("Room", oldRoom, newRoom) : "")
            + (coachChanged || oldCoach != newCoach ? EmailContent.Change("Coach", oldCoach, newCoach) : "")
            + "<h2 style=\"margin:24px 0 8px;font-size:18px;\">Reason</h2>"
            + EmailContent.Paragraph(reason);
    }

    private static string Schedule(DateTime start, DateTime end)
    {
        var localStart = start.AddHours(7);
        var localEnd = end.AddHours(7);
        return localStart.ToString("dd/MM/yyyy, HH:mm", CultureInfo.InvariantCulture) + " – "
            + localEnd.ToString(localStart.Date == localEnd.Date ? "HH:mm" : "dd/MM/yyyy, HH:mm", CultureInfo.InvariantCulture);
    }
}
