namespace SportHub.Membership.Application.DTOs;

public sealed record MemberTrainingProfileResponse(
    Guid MemberId,
    string Goal,
    [property: SportHub.BuildingBlocks.Api.WireEnum] string ExperienceLevel,
    string? Notes,
    DateTime UpdatedAt);
