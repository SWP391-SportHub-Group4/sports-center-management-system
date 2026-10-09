namespace SportHub.Scheduling.Application.DTOs;

/// <summary>Buổi học sắp tới của một Member (qua các ghi danh Confirmed), kèm điểm danh nếu đã có.</summary>
public sealed record MemberSessionResponse(
    Guid SessionId,
    int ClassId,
    string ClassName,
    string SportName,
    int SessionNo,
    string RoomName,
    DateTime StartAtUtc,
    DateTime EndAtUtc,
    [property: SportHub.BuildingBlocks.Api.WireEnum] string Status,
    bool IsMakeup,
    [property: SportHub.BuildingBlocks.Api.WireEnum] string? AttendanceStatus,
    string? CoachName,
    int NumSessions = 0);
