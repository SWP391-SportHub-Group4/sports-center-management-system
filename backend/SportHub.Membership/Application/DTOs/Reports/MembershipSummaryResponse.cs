namespace SportHub.Membership.Application.DTOs;

public sealed record MemberPackageStatusCountsResponse(
    int PendingPayment,
    int Active,
    int Expired,
    int Cancelled);

public sealed record MembershipSummaryResponse(
    DateOnly AsOfDate,
    int TotalMembers,
    int MembersWithActiveMembership,
    int MembersWithoutActiveMembership,
    MemberPackageStatusCountsResponse PackagesByStatus);
