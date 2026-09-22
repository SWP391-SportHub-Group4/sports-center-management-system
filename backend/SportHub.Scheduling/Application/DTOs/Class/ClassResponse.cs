namespace SportHub.Scheduling.Application.DTOs;

public sealed record ClassResponse(
    int ClassId,
    string Name,
    string Discipline,
    int DefaultRoomId,
    string DefaultRoomName,
    int RoomCapacity,
    Guid? DefaultCoachId,
    string? DefaultCoachName,
    int Capacity,
    string Status,
    IReadOnlyList<ClassRecurrenceResponse> Recurrences);
