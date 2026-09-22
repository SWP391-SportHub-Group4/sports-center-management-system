using System.ComponentModel.DataAnnotations;

namespace SportHub.Scheduling.Application.Commands;

public sealed class MarkAttendanceRequest
{
    /// <summary>
    /// BR-53 — chỉ Present hoặc Absent. NoShow do AttendanceFinalizerJob tự sinh (BR-20),
    /// không nhận từ client.
    /// </summary>
    [Required]
    public string Status { get; set; } = string.Empty;
}
