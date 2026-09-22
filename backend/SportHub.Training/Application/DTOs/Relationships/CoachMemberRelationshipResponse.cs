namespace SportHub.Training.Application.DTOs;

public sealed record CoachMemberRelationshipResponse(
    Guid RelationshipId,
    Guid CoachId,
    string CoachName,
    Guid MemberId,
    string MemberEmail,
    string MemberName,
    string SourceType,
    int? ClassId,
    string? ClassName,
    string Status,
    DateTime StartedAt,
    DateTime? EndedAt);
