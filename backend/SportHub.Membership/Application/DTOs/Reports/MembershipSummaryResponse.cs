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

public sealed record MembershipPeriodResponse(
    DateOnly FromDate, DateOnly ToDate, int NewMembers, int ActiveMembersAtPeriodEnd);
