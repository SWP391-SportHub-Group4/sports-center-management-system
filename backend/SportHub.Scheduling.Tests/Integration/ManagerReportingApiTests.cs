using System.Net;
using System.Net.Http.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SportHub.API.Persistence;
using SportHub.BuildingBlocks.SharedKernel.Time;
using SportHub.Identity.Domain.Enums;
using SportHub.Membership.Application.DTOs;
using SportHub.Membership.Domain.Entities;
using SportHub.Membership.Domain.Enums;
using SportHub.Scheduling.Application.DTOs;
using SportHub.Scheduling.Domain.Entities;
using SportHub.Scheduling.Domain.Enums;

namespace SportHub.Scheduling.Tests.Integration;

[Collection(nameof(SchedulingApiCollection))]
public sealed class ManagerReportingApiTests(SchedulingApiFactory factory)
{
    [Fact]
    public async Task Membership_summary_counts_distinct_active_members_and_package_statuses()
    {
        var manager = await factory.SeedUserAsync(UserRole.CenterManager);
        var client = factory.CreateApiClient(manager.UserId, UserRole.CenterManager);
        var asOfDate = new DateOnly(2030, 1, 15);
        var before = await GetMembershipSummaryAsync(client, asOfDate);

        var activeMember = await factory.SeedUserAsync(UserRole.Member);
        var memberWithoutActiveMembership = await factory.SeedUserAsync(UserRole.Member);

        await SeedPackagesAsync(
            activeMember.UserId,
            asOfDate,
            MemberPackageStatus.Active,
            MemberPackageStatus.Active,
            MemberPackageStatus.Expired,
            MemberPackageStatus.Cancelled,
            MemberPackageStatus.PendingPayment);

        // Status Active nhưng ngoài validity không được làm member thứ hai thành active.
        await SeedPackageAsync(
            memberWithoutActiveMembership.UserId,
            MemberPackageStatus.Active,
            asOfDate.AddYears(-1),
            asOfDate.AddDays(-1));

        var after = await GetMembershipSummaryAsync(client, asOfDate);

        Assert.Equal(before.TotalMembers + 2, after.TotalMembers);
        Assert.Equal(before.MembersWithActiveMembership + 1, after.MembersWithActiveMembership);
        Assert.Equal(before.MembersWithoutActiveMembership + 1, after.MembersWithoutActiveMembership);
        Assert.Equal(before.PackagesByStatus.Active + 3, after.PackagesByStatus.Active);
        Assert.Equal(before.PackagesByStatus.Expired + 1, after.PackagesByStatus.Expired);
        Assert.Equal(before.PackagesByStatus.Cancelled + 1, after.PackagesByStatus.Cancelled);
        Assert.Equal(before.PackagesByStatus.PendingPayment + 1, after.PackagesByStatus.PendingPayment);
    }

    [Fact]
    public async Task Membership_validity_is_inclusive_at_start_and_end_dates()
    {
        var manager = await factory.SeedUserAsync(UserRole.CenterManager);
        var firstDayMember = await factory.SeedUserAsync(UserRole.Member);
        var lastDayMember = await factory.SeedUserAsync(UserRole.Member);
        var asOfDate = new DateOnly(2032, 5, 20);

        await SeedPackageAsync(firstDayMember.UserId, MemberPackageStatus.Active, asOfDate, asOfDate.AddDays(10));
        await SeedPackageAsync(lastDayMember.UserId, MemberPackageStatus.Active, asOfDate.AddDays(-10), asOfDate);

        var client = factory.CreateApiClient(manager.UserId, UserRole.CenterManager);
        var response = await GetMembershipSummaryAsync(client, asOfDate);

        Assert.True(response.MembersWithActiveMembership >= 2);
    }

    [Theory]
    [InlineData(UserRole.SystemAdministrator)]
    [InlineData(UserRole.Coach)]
    [InlineData(UserRole.Receptionist)]
    [InlineData(UserRole.Member)]
    public async Task Reports_forbid_non_manager_roles(UserRole role)
    {
        var user = await factory.SeedUserAsync(role);
        var client = factory.CreateApiClient(user.UserId, role);

        Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync("api/reports/membership-summary")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync("api/reports/class-enrollment")).StatusCode);
    }

    [Fact]
    public async Task Reports_require_authentication()
    {
        var client = factory.CreateApiClient();

        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync("api/reports/membership-summary")).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync("api/reports/class-enrollment")).StatusCode);
    }

    private static async Task<MembershipSummaryResponse> GetMembershipSummaryAsync(
        HttpClient client,
        DateOnly asOfDate)
        => await client.GetFromJsonAsync<MembershipSummaryResponse>(
               $"api/reports/membership-summary?asOfDate={asOfDate:yyyy-MM-dd}")
           ?? throw new InvalidOperationException("Membership summary response was empty.");

    private async Task SeedPackagesAsync(
        Guid memberId,
        DateOnly asOfDate,
        params MemberPackageStatus[] statuses)
    {
        foreach (var status in statuses)
        {
            await SeedPackageAsync(memberId, status, asOfDate.AddDays(-1), asOfDate.AddDays(1));
        }
    }

    private async Task SeedPackageAsync(
        Guid memberId,
        MemberPackageStatus status,
        DateOnly startDate,
        DateOnly endDate)
    {
        await using var scope = factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<SportHubDbContext>();
        var catalog = new MembershipPackage
        {
            Name = $"Report package {Guid.NewGuid():N}",
            Price = 500_000m,
            DurationDays = 30,
            SessionLimit = 10
        };
        db.MembershipPackages.Add(catalog);
        await db.SaveChangesAsync();

        db.MemberPackages.Add(new MemberPackage
        {
            MemberPackageId = Guid.NewGuid(),
            MemberId = memberId,
            PackageId = catalog.PackageId,
            StartDate = startDate,
            EndDate = endDate,
            RemainingSessions = 10,
            Status = status
        });
        await db.SaveChangesAsync();
    }
}
