namespace SportHub.Scheduling.Domain.Entities;

/// <summary>Durable reminder identity includes the timetable, so moving a lesson schedules fresh reminders.</summary>
public sealed class ClassSessionReminder
{
    public Guid ReminderId { get; set; }
    public Guid SessionId { get; set; }
    public Guid MemberId { get; set; }
    public DateTime StartAtUtc { get; set; }
    public int HoursBefore { get; set; }
    public DateTime QueuedAtUtc { get; set; }
}
