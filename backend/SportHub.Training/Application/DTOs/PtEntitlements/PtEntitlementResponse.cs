namespace SportHub.Training.Application.DTOs;

public sealed record PtEntitlementResponse(
    Guid EntitlementId,
    Guid MemberId,
    string MemberName,
    Guid CoachId,
    string CoachName,
    int FrequencyPerWeek,
    int TotalQuota,
    int ReservedSessions,
    int ConsumedSessions,
    int RemainingQuota,
    DateOnly ValidityStartDate,
    DateOnly ValidityEndDate,
    DateOnly CarryOverUntilDate,
    string Status);
