namespace SportHub.Scheduling.Application.DTOs;

public sealed record ClassSessionResponse(
    Guid SessionId,
    int ClassId,
    string ClassName,
    string Discipline,
    int RoomId,
    string RoomName,
    Guid CoachId,
    string CoachName,
    DateTime StartAtUtc,
    DateTime EndAtUtc,
    int Capacity,
    int BaselineCapacity,
    int ConfirmedCount,
    string Status,
    Guid? RescheduledFromSessionId,
    bool IsFull);
