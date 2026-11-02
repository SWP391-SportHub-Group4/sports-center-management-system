using System.Net.Http.Json;
using SportHub.BuildingBlocks.SharedKernel.Pagination;
using SportHub.BuildingBlocks.SharedKernel.Time;
using SportHub.Identity.Domain.Enums;
using SportHub.Membership.Application.DTOs;
using SportHub.Membership.Domain.Entities;
using SportHub.Membership.Domain.Enums;

namespace SportHub.Payment.Tests.Integration;

[Collection(nameof(PaymentApiCollection))]
public sealed class CurrentPackageMembersTests(PaymentApiFactory factory)
{
    [Fact]
    public async Task Current_roster_excludes_history_and_future_purchases_and_pages_distinct_members()
    {
        var manager = await factory.SeedUserAsync(UserRole.CenterManager);
        var first = await factory.SeedUserAsync(UserRole.Member);
        var second = await factory.SeedUserAsync(UserRole.Member);
        var inactive = await factory.SeedUserAsync(UserRole.Member);
        var today = DateOnly.FromDateTime(VietnamTime.ToLocal(DateTime.UtcNow));
        var latestId = Guid.NewGuid();
        var packageId = await factory.QueryAsync(async db =>
        {
            var plan = new MembershipPackage
            {
                Name = $"Roster {Guid.NewGuid():N}", Price = 100000, DurationDays = 30, IsActive = true
            };
            var otherPlan = new MembershipPackage
            {
                Name = $"Other roster {Guid.NewGuid():N}", Price = 100000, DurationDays = 30, IsActive = true
            };
            db.Set<MembershipPackage>().AddRange(plan, otherPlan);
            await db.SaveChangesAsync();

            MemberPackage Purchase(Guid memberId, DateOnly start, DateOnly end,
                MemberPackageStatus status = MemberPackageStatus.Active) => new()
            {
                MemberPackageId = Guid.NewGuid(), MemberId = memberId, PackageId = plan.PackageId,
                StartDate = start, EndDate = end, Status = status,
                StackingApprovedByUserId = manager.UserId, StackingApprovalReason = "Roster test"
            };
            var latest = Purchase(first.UserId, today, today.AddDays(30));
            latest.MemberPackageId = latestId;
            var expiredPass = Purchase(inactive.UserId, today, today.AddDays(1));
            expiredPass.ExpiresAtUtc = DateTime.UtcNow.AddHours(-1);
            var other = Purchase(inactive.UserId, today, today.AddDays(30));
            other.PackageId = otherPlan.PackageId;
            db.Set<MemberPackage>().AddRange(
                latest,
                Purchase(first.UserId, today.AddDays(-5), today.AddDays(20)),
                Purchase(second.UserId, today, today),
                Purchase(inactive.UserId, today, today.AddDays(30), MemberPackageStatus.Cancelled),
                Purchase(inactive.UserId, today, today.AddDays(30), MemberPackageStatus.PendingPayment),
                Purchase(inactive.UserId, today.AddDays(-30), today.AddDays(-1), MemberPackageStatus.Expired),
                Purchase(inactive.UserId, today.AddDays(-30), today.AddDays(-1)),
                Purchase(inactive.UserId, today.AddDays(1), today.AddDays(30)),
                expiredPass, other);
            await db.SaveChangesAsync();
            return plan.PackageId;
        });

        using var client = factory.CreateApiClient(manager.UserId, UserRole.CenterManager);
        var url = $"/api/member-packages?packageId={packageId}&currentMembersOnly=true&pageSize=1";
        var page1 = (await client.GetFromJsonAsync<PagedResult<MemberPackageResponse>>(url))!;
        var page2 = (await client.GetFromJsonAsync<PagedResult<MemberPackageResponse>>(url + "&page=2"))!;
        Assert.Equal(2, page1.TotalCount);
        Assert.Equal(2, page2.TotalCount);
        var rows = page1.Items.Concat(page2.Items).ToArray();
        Assert.Single(page1.Items);
        Assert.Single(page2.Items);
        Assert.Equal(2, rows.Select(row => row.MemberId).Distinct().Count());
        Assert.Contains(rows, row => row.MemberPackageId == latestId);
        Assert.All(rows, row => Assert.True(row.IsUsable));

        var history = (await client.GetFromJsonAsync<PagedResult<MemberPackageResponse>>(
            $"/api/member-packages?packageId={packageId}"))!;
        Assert.Equal(9, history.TotalCount);
    }
}
