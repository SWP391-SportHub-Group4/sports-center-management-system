namespace SportHub.AI.Application.DTOs.Manager;

public sealed class ManagerScheduleRuleInput
{
    public int DayOfWeek { get; set; }

    public string StartTimeLocal { get; set; } =
        string.Empty;
}

public sealed class ManagerScheduleSuggestionRequest
{
    public int Capacity { get; init; }

    public int SportId { get; init; }

    public Guid? CoachId { get; init; }

    public int DefaultRoomId { get; init; }

    public DateOnly StartDate { get; init; }

    public int NumSessions { get; init; }

    public List<ManagerScheduleRuleInput> ScheduleRules
    {
        get;
        init;
    } = [];

    public string Operation { get; init; } = "CREATE";

    public int? ClassId { get; init; }

    public int? Version { get; init; }
}

public sealed record ManagerScheduleRuleSuggestion(
    int DayOfWeek,
    string StartTimeLocal);

public sealed class ManagerSchedulePythonRequest
{
    public int Capacity { get; set; }

    public int SportId { get; set; }

    public Guid? CoachId { get; set; }

    public int DefaultRoomId { get; set; }

    public DateOnly StartDate { get; set; }

    public int NumSessions { get; set; }

    public List<ManagerScheduleRuleInput>
        ScheduleRules { get; set; } = [];

    public object Context { get; set; } =
        new { };
}

public sealed record PythonManagerScheduleResponse(
    DateOnly StartDate,
    int NumSessions,
    IReadOnlyList<ManagerScheduleRuleSuggestion>
        ScheduleRules,
    string Rationale);

public sealed record ManagerScheduleValidationSession(
    int SessionNo,
    DateTime StartAtUtc,
    DateTime EndAtUtc,
    bool Available,
    IReadOnlyList<string> Reasons);

public sealed record ManagerScheduleValidationResult(
    bool AllAvailable,
    IReadOnlyList<ManagerScheduleValidationSession>
        Sessions);

public sealed record ManagerScheduleSuggestionResponse(
    DateOnly StartDate,
    int NumSessions,
    IReadOnlyList<ManagerScheduleRuleSuggestion>
        ScheduleRules,
    string Rationale,
    ManagerScheduleValidationResult Validation,
    Guid LogId,
    string Provider,
    string Model,
    int ResponseTimeMs,
    DateTime GeneratedAt);