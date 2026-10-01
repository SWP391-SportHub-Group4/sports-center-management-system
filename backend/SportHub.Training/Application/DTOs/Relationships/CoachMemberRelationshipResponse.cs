namespace SportHub.Training.Application.DTOs;

public sealed record CoachMemberRelationshipResponse(
    Guid RelationshipId,
    Guid CoachId,
    string CoachName,
    Guid MemberId,
    string MemberEmail,
    string MemberName,
    [property: SportHub.BuildingBlocks.Api.WireEnum] string SourceType,
    int? ClassId,
    string? ClassName,
    [property: SportHub.BuildingBlocks.Api.WireEnum] string Status,
    DateTime StartedAt,
    DateTime? EndedAt);
