using System.Net;
using System.Net.Http.Json;
using SportHub.BuildingBlocks.SharedKernel.Pagination;
using SportHub.Identity.Domain.Enums;
using SportHub.Scheduling.Rental.Application;
using SportHub.Scheduling.Rental.Domain;
using SportHub.BuildingBlocks.Abstractions.Scheduling;
using SportHub.Scheduling.Catalog.Domain;
using SportHub.Scheduling.Domain.Entities;

namespace SportHub.Scheduling.Tests.Integration;

[Collection(nameof(SchedulingApiCollection))]
public sealed class IncidentHistoryTests(SchedulingApiFactory factory)
{
    [Fact]
    public async Task Schedule_keeps_room_blocks_and_exposes_the_shared_center_incident_even_with_room_filter()
    {
        var manager = await factory.SeedUserAsync(UserRole.CenterManager);
        var incidentId = Guid.NewGuid();
        var start = new DateTime(2099, 10, 22, 1, 0, 0, DateTimeKind.Utc);
        var end = start.AddHours(3);
        var roomIds = await factory.QueryAsync(async db =>
        {
            var rooms = new[] { new Room { Name = "Center incident A", Capacity = 10 },
                new Room { Name = "Center incident B", Capacity = 10 } };
            db.Set<Room>().AddRange(rooms);
            await db.SaveChangesAsync();
            db.Set<IncidentNotice>().Add(new IncidentNotice
            {
                IncidentId = incidentId, Scope = IncidentScope.Center, StartAtUtc = start, EndAtUtc = end,
                Reason = "Center closure", ResolutionSummary = "Rooms blocked",
                CreatedByUserId = manager.UserId, CreatedAtUtc = DateTime.UtcNow
            });
            db.Set<RoomBlock>().AddRange(rooms.Select(room => new RoomBlock
            {
                BlockId = Guid.NewGuid(), RoomId = room.RoomId, IncidentId = incidentId,
                StartAtUtc = start, EndAtUtc = end, Reason = "Center closure", CreatedByUserId = manager.UserId
            }));
            await db.SaveChangesAsync();
            return rooms.Select(room => room.RoomId).Order().ToArray();
        });
        using var client = factory.CreateApiClient(manager.UserId, UserRole.CenterManager);
        const string path = "/api/manager/court-schedule?fromDate=2099-10-22&toDate=2099-10-22";
        var all = await client.GetFromJsonAsync<List<CourtScheduleEntry>>(path);
        var blocks = all!.Where(x => x.IncidentId == incidentId).ToList();
        Assert.Equal(2, blocks.Count);
        Assert.All(blocks, block => Assert.Equal(roomIds, block.AffectedRoomIds));
        var filtered = await client.GetFromJsonAsync<List<CourtScheduleEntry>>($"{path}&roomId={roomIds[0]}");
        var selected = Assert.Single(filtered!, x => x.IncidentId == incidentId);
        Assert.Equal(roomIds, selected.AffectedRoomIds);
        Assert.Contains("\"incidentScope\":\"CENTER\"", await client.GetStringAsync(path));
    }

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
