namespace SportHub.Scheduling.Application.DTOs;

public sealed record ClassUtilizationGroupResponse(
    int ClassId,
    string ClassName,
    string Discipline,
    int SessionCount,
    int TotalCapacity,
    int TotalConfirmed,
    decimal UtilizationRate);

public sealed record DailyClassUtilizationResponse(
    DateOnly Date,
    int SessionCount,
    int TotalCapacity,
    int TotalConfirmed,
    decimal UtilizationRate);

public sealed record ClassUtilizationReportResponse(
    DateOnly FromDate,
    DateOnly ToDate,
    int TotalSessions,
    int ScheduledSessions,
    int CompletedSessions,
    int CancelledSessions,
    int RescheduledSessions,
    int TotalCapacity,
    int TotalConfirmed,
    decimal UtilizationRate,
    IReadOnlyList<ClassUtilizationGroupResponse> ByClass,
    IReadOnlyList<DailyClassUtilizationResponse> Daily);
