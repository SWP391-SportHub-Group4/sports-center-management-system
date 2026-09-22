namespace SportHub.Membership.Application.DTOs;

public sealed record MemberTrainingProfileResponse(
    Guid MemberId,
    string Goal,
    string ExperienceLevel,
    string? Notes,
    DateTime UpdatedAt);
