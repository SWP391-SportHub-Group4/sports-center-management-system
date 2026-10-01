namespace SportHub.BuildingBlocks.Abstractions.Scheduling;

public sealed record CourtScheduleParticipant(Guid MemberId, string MemberName, Guid? EnrollmentId,
    [property: SportHub.BuildingBlocks.Api.WireEnum] string? AttendanceStatus, DateTime? RecordedAtUtc);

public sealed record CourtScheduleEntry([property: SportHub.BuildingBlocks.Api.WireEnum] string SourceType, Guid SourceId, int? RoomId,
    DateTime StartAtUtc, DateTime EndAtUtc, Guid? CoachId, string? CoachName,
    string Title, [property: SportHub.BuildingBlocks.Api.WireEnum] string Status, int? ClassId, int? ExpectedAttendees,
    IReadOnlyList<CourtScheduleParticipant> Participants);

/// <summary>Training supplies PT schedule data to authorized court-calendar orchestration.</summary>
public interface IPtCourtScheduleReader
{
    Task<IReadOnlyList<CourtScheduleEntry>> ReadAsync(DateTime fromUtc, DateTime toUtc,
        int? roomId, CancellationToken ct = default);
}
