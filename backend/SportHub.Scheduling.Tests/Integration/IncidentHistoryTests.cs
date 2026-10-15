using System.Net;
using System.Net.Http.Json;
using SportHub.BuildingBlocks.SharedKernel.Pagination;
using SportHub.Identity.Domain.Enums;
using SportHub.Scheduling.Rental.Application;
using SportHub.Scheduling.Rental.Domain;

namespace SportHub.Scheduling.Tests.Integration;

[Collection(nameof(SchedulingApiCollection))]
public sealed class IncidentHistoryTests(SchedulingApiFactory factory)
{
    [Fact]
    public async Task Managers_can_browse_other_managers_incidents_with_paging_and_read_details()
    {
        var creator = await factory.SeedUserAsync(UserRole.CenterManager);
        var viewer = await factory.SeedUserAsync(UserRole.CenterManager);
        var incidents = Enumerable.Range(0, 3).Select(index => new IncidentNotice
        {
            IncidentId = Guid.NewGuid(), Scope = IncidentScope.Center,
            Reason = "History test " + index, ResolutionSummary = "Rooms blocked",
            CreatedByUserId = creator.UserId,
            CreatedAtUtc = new DateTime(2100, 1, 1, 0, 0, 0, DateTimeKind.Utc).AddDays(index),
            StartAtUtc = new DateTime(2100, 2, 1, 0, 0, 0, DateTimeKind.Utc),
            EndAtUtc = new DateTime(2100, 2, 1, 3, 0, 0, DateTimeKind.Utc)
        }).ToArray();
        await factory.QueryAsync(async db =>
        {
            db.Set<IncidentNotice>().AddRange(incidents);
            await db.SaveChangesAsync();
            return 0;
        });
        using var client = factory.CreateApiClient(viewer.UserId, UserRole.CenterManager);
        var first = await client.GetFromJsonAsync<PagedResult<IncidentDetailsResponse>>("/api/manager/incidents?page=1&pageSize=2");
        Assert.NotNull(first);
        Assert.True(first.TotalCount >= 3);
        Assert.Equal(new[] { incidents[2].IncidentId, incidents[1].IncidentId }, first.Items.Select(x => x.IncidentId));
        var second = await client.GetFromJsonAsync<PagedResult<IncidentDetailsResponse>>("/api/manager/incidents?page=2&pageSize=2");
        Assert.Contains(second!.Items, x => x.IncidentId == incidents[0].IncidentId);
        var detail = await client.GetFromJsonAsync<IncidentDetailsResponse>($"/api/manager/incidents/{incidents[2].IncidentId}");
        Assert.Equal(incidents[2].Reason, detail!.Reason);
        Assert.Equal("Center", detail.Scope);
        Assert.Contains("\"scope\":\"CENTER\"", await client.GetStringAsync($"/api/manager/incidents/{incidents[2].IncidentId}"));
        Assert.Null(detail.RoomName);
        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync($"/api/manager/incidents/{Guid.NewGuid()}" )).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await factory.CreateApiClient().GetAsync("/api/manager/incidents")).StatusCode);
        foreach (var role in new[] { UserRole.Member, UserRole.Coach, UserRole.Receptionist, UserRole.SystemAdministrator })
        {
            var user = await factory.SeedUserAsync(role);
            using var forbidden = factory.CreateApiClient(user.UserId, role);
            Assert.Equal(HttpStatusCode.Forbidden, (await forbidden.GetAsync("/api/manager/incidents")).StatusCode);
            Assert.Equal(HttpStatusCode.Forbidden, (await forbidden.GetAsync($"/api/manager/incidents/{incidents[2].IncidentId}")).StatusCode);
        }
    }
}
