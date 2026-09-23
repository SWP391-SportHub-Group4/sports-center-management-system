namespace SportHub.Scheduling.Application.DTOs;

public sealed record ClassRecurrenceResponse(
    int RecurrenceId,
    string DaysOfWeek,
    TimeOnly StartTimeLocal,
    TimeOnly EndTimeLocal,
    string Timezone,
    DateOnly EffectiveFrom,
    DateOnly? EffectiveTo);
