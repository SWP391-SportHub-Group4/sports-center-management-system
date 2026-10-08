namespace SportHub.Training.Application.DTOs;

/// <param name="BookableReason">Null khi đặt được; ngược lại là mã ổn định: pt_entitlement_not_active, pt_quota_exhausted, pt_relationship_required, pt_no_room_configured.</param>
public sealed record PtAvailabilityResponse(
    Guid EntitlementId,
    Guid CoachId,
    string CoachName,
    int SessionMinutes,
    int RemainingQuota,
    string? BookableReason,
    PtBookingPolicy Policy,
    IReadOnlyList<PtAvailabilitySlot> Slots);

public sealed record PtBookingPolicy(int MinLeadHours, int AdvanceDays, int StepMinutes, int ChangeDeadlineHours);

public sealed record PtAvailabilitySlot(DateTime StartAtUtc, DateTime EndAtUtc, IReadOnlyList<PtAvailabilityRoom> Rooms);

public sealed record PtAvailabilityRoom(int RoomId, string Name);
