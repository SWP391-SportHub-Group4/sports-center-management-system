namespace SportHub.BuildingBlocks.Abstractions.Scheduling;

public sealed record CourtScheduleParticipant(Guid MemberId, string MemberName, Guid? EnrollmentId,
    [property: SportHub.BuildingBlocks.Api.WireEnum] string? AttendanceStatus, DateTime? RecordedAtUtc);

public sealed record CourtScheduleEntry([property: SportHub.BuildingBlocks.Api.WireEnum] string SourceType, Guid SourceId, int? RoomId,
    DateTime StartAtUtc, DateTime EndAtUtc, Guid? CoachId, string? CoachName,
    string Title, [property: SportHub.BuildingBlocks.Api.WireEnum] string Status, int? ClassId,
    IReadOnlyList<CourtScheduleParticipant> Participants,
    Guid? MemberId = null, string? MemberName = null)
{
    public Guid? IncidentId { get; init; }
    [SportHub.BuildingBlocks.Api.WireEnum]
    public string? IncidentScope { get; init; }
    public IReadOnlyList<int> AffectedRoomIds { get; init; } = [];
}
