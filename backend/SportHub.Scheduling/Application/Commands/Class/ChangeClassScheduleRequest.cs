using System.ComponentModel.DataAnnotations;

namespace SportHub.Scheduling.Application.Commands;

public sealed class ChangeClassScheduleRequest
{
    public int ExpectedVersion { get; set; }
    public DateOnly? FirstSessionDate { get; set; }
    [Required, MinLength(1), MaxLength(14)]
    public List<ScheduleRuleInput> ScheduleRules { get; set; } = [];
    public string? PreviewToken { get; set; }
}

public sealed record ClassScheduleChangePreview(int Version, string PreviewToken,
    IReadOnlyList<ClassScheduleChangeSlot> Sessions);
public sealed record ClassScheduleChangeSlot(Guid SessionId, int SessionNo,
    DateTime PreviousStartAtUtc, DateTime StartAtUtc, DateTime EndAtUtc);
