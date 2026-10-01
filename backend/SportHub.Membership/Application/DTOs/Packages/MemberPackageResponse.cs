namespace SportHub.Membership.Application.DTOs;

public sealed record MemberPackageResponse(
    Guid MemberPackageId,
    Guid MemberId,
    string MemberEmail,
    string MemberName,
    int PackageId,
    string PackageName,
    DateOnly StartDate,
    DateOnly EndDate,
    int? RemainingSessions,
    int? SessionLimit,
    [property: SportHub.BuildingBlocks.Api.WireEnum] string Status,
    bool IsUsable,
    bool StackingApproved,
    string? StackingApprovalReason);
