namespace SportHub.Membership.Application.DTOs;

public sealed record MembershipPackageResponse(
    int PackageId,
    string Name,
    decimal Price,
    int DurationDays,
    int? SessionLimit,
    string? Description,
    bool IsActive);
