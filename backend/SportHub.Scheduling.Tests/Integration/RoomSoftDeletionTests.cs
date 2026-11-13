using System.Net;
using System.Net.Http.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SportHub.BuildingBlocks.Abstractions.Scheduling;
using SportHub.BuildingBlocks.SharedKernel.Errors;
using SportHub.Identity.Domain.Enums;
using SportHub.Scheduling.Application.DTOs;
using SportHub.Scheduling.Catalog.Domain;
using SportHub.Scheduling.Domain.Enums;
using SportHub.Scheduling.Occupancy.Domain;
using SportHub.Scheduling.Rental.Domain;

namespace SportHub.Scheduling.Tests.Integration;

[Collection(nameof(SchedulingApiCollection))]
public sealed class RoomSoftDeletionTests(SchedulingApiFactory factory)
{
    [Fact]
    public async Task Delete_preserves_history_hides_room_prevents_reactivation_and_allows_name_reuse()
    {
        var course = await CourseTestData.CreateAsync(factory);
        var past = DateTime.UtcNow.AddDays(-10);
        var incidentId = Guid.NewGuid();
        var blockId = Guid.NewGuid();
        var rentalId = Guid.NewGuid();
        var oldName = await factory.QueryAsync(async db =>
        {
            await db.Classes.Where(c => c.ClassId == course.Id).ExecuteUpdateAsync(u => u.SetProperty(c => c.Status, ClassStatus.Cancelled));
            await db.ClassSessions.Where(s => s.ClassId == course.Id).ExecuteUpdateAsync(u => u.SetProperty(s => s.Status, ClassSessionStatus.Cancelled));
            await db.RoomOccupancies.Where(o => o.RoomId == course.RoomId).ExecuteUpdateAsync(u => u.SetProperty(o => o.IsActive, false));
            db.Set<IncidentNotice>().Add(new IncidentNotice {
                IncidentId = incidentId, Scope = IncidentScope.Room, RoomId = course.RoomId,
                StartAtUtc = past, EndAtUtc = past.AddHours(1), Reason = "Past incident",
                CreatedByUserId = course.ManagerId, CreatedAtUtc = past.AddDays(-1)
            });
            db.RoomBlocks.Add(new RoomBlock { BlockId = blockId, RoomId = course.RoomId,
                IncidentId = incidentId, StartAtUtc = past, EndAtUtc = past.AddHours(1),
                Reason = "Past incident", CreatedByUserId = course.ManagerId });
            // Even an expired active occupancy awaiting the next expiry tick is historical.
            db.RoomOccupancies.Add(new RoomOccupancy { OccupancyId = Guid.NewGuid(), RoomId = course.RoomId,
                SourceType = OccupancySourceType.RoomBlock, SourceId = blockId,
                StartAtUtc = past, EndAtUtc = past.AddHours(1), IsActive = true });
            db.CourtRentals.Add(new CourtRental { CourtRentalId = rentalId, MemberId = course.ManagerId,
                SportId = 3, RoomId = course.RoomId, StartAtUtc = past.AddHours(2), EndAtUtc = past.AddHours(3),
                Status = CourtRentalStatus.Completed, CreatedAtUtc = past.AddDays(-1) });
            await db.SaveChangesAsync();
            return await db.Rooms.Where(r => r.RoomId == course.RoomId).Select(r => r.Name).SingleAsync();
        });
        using var manager = factory.CreateApiClient(course.ManagerId, UserRole.CenterManager);
        (await manager.DeleteAsync($"api/rooms/{course.RoomId}")).EnsureSuccessStatusCode();
        (await manager.DeleteAsync($"api/rooms/{course.RoomId}")).EnsureSuccessStatusCode();
        Assert.DoesNotContain((await manager.GetFromJsonAsync<List<RoomResponse>>("api/rooms"))!, r => r.RoomId == course.RoomId);
        await factory.QueryAsync(async db =>
        {
            var room = await db.Rooms.AsNoTracking().SingleAsync(r => r.RoomId == course.RoomId);
            Assert.NotNull(room.DeletedAtUtc);
            Assert.False(room.IsActive);
            Assert.False(room.AllowRental);
            Assert.Equal(oldName, room.Name);
            Assert.Equal(oldName, await db.Classes.Where(c => c.ClassId == course.Id).Select(c => c.DefaultRoom!.Name).SingleAsync());
            Assert.Equal(3, await db.ClassSessions.CountAsync(s => s.ClassId == course.Id));
            Assert.True(await db.RoomOpeningHours.AnyAsync(h => h.RoomId == course.RoomId));
            Assert.True(await db.RoomBlocks.AnyAsync(b => b.BlockId == blockId));
            Assert.True(await db.CourtRentals.AnyAsync(r => r.CourtRentalId == rentalId));
            Assert.True(await db.Set<IncidentNotice>().AnyAsync(i => i.IncidentId == incidentId));
            Assert.Equal(1, await db.AuditLogs.CountAsync(a => a.Action == "DELETE_ROOM" && a.TargetId == course.RoomId.ToString()));
            return 0;
        });
        Assert.Equal(HttpStatusCode.NotFound, (await manager.PutAsJsonAsync($"api/rooms/{course.RoomId}", new { name = oldName, capacity = 12, isActive = true })).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await manager.PutAsJsonAsync($"api/rooms/{course.RoomId}/rental-access", new { allowRental = true })).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await manager.PostAsJsonAsync("api/manager/room-blocks", new {
            roomId = course.RoomId, startAtUtc = DateTime.UtcNow.AddDays(1), endAtUtc = DateTime.UtcNow.AddDays(1).AddHours(1), reason = "New block"
        })).StatusCode);
        using (var scope = factory.Services.CreateScope())
        {
            Assert.Null(await scope.ServiceProvider.GetRequiredService<ISportCatalogReader>().GetRoomAsync(course.RoomId));
            var occupancy = scope.ServiceProvider.GetRequiredService<IOccupancyService>();
            await Assert.ThrowsAsync<NotFoundException>(() => occupancy.ReserveAsync(new OccupancyRequest(
                OccupancySources.RoomBlock, Guid.NewGuid(), course.RoomId, null, DateTimeOffset.UtcNow.AddDays(1), DateTimeOffset.UtcNow.AddDays(1).AddHours(1))));
        }
        var recreated = await manager.PostAsJsonAsync("api/rooms", new { name = oldName, capacity = 12 });
        recreated.EnsureSuccessStatusCode();
        Assert.NotEqual(course.RoomId, (await recreated.Content.ReadFromJsonAsync<RoomResponse>())!.RoomId);
    }

    [Theory]
    [InlineData("draft")]
    [InlineData("published")]
    [InlineData("in-progress")]
    [InlineData("session")]
    [InlineData("occupancy")]
    [InlineData("block")]
    [InlineData("incident")]
    [InlineData("fence")]
    [InlineData("pending-rental")]
    [InlineData("confirmed-rental")]
    [InlineData("in-use-rental")]
    public async Task Delete_rejects_live_commitments_even_without_occupancy(string source)
    {
        var course = await CourseTestData.CreateAsync(factory, publish: false);
        var start = DateTime.UtcNow.AddDays(1);
        await factory.QueryAsync(async db =>
        {
            var current = await db.Classes.SingleAsync(c => c.ClassId == course.Id);
            current.Status = source switch { "draft" => ClassStatus.Draft, "published" => ClassStatus.Published,
                "in-progress" => ClassStatus.InProgress, _ => ClassStatus.Cancelled };
            if (source == "session")
                db.ClassSessions.Add(new SportHub.Scheduling.Domain.Entities.ClassSession { SessionId = Guid.NewGuid(),
                    ClassId = course.Id, SessionNo = 1, RoomId = course.RoomId, CoachId = course.CoachId,
                    StartAtUtc = start, EndAtUtc = start.AddHours(1), Status = ClassSessionStatus.Scheduled });
            if (source == "occupancy")
                db.RoomOccupancies.Add(new RoomOccupancy { OccupancyId = Guid.NewGuid(), SourceType = OccupancySourceType.RoomBlock,
                    SourceId = Guid.NewGuid(), RoomId = course.RoomId, StartAtUtc = start, EndAtUtc = start.AddHours(1), IsActive = true });
            if (source == "block")
                db.RoomBlocks.Add(new RoomBlock { BlockId = Guid.NewGuid(), RoomId = course.RoomId,
                    StartAtUtc = start, EndAtUtc = start.AddHours(1), Reason = "Upcoming block", CreatedByUserId = course.ManagerId });
            if (source == "incident")
                db.Set<IncidentNotice>().Add(new IncidentNotice { IncidentId = Guid.NewGuid(), Scope = IncidentScope.Room,
                    RoomId = course.RoomId, StartAtUtc = start, EndAtUtc = start.AddHours(1), Reason = "Upcoming incident",
                    CreatedByUserId = course.ManagerId, CreatedAtUtc = DateTime.UtcNow });
            if (source == "fence")
                db.Set<IncidentFence>().Add(new IncidentFence { FenceId = Guid.NewGuid(), Scope = IncidentScope.Room,
                    RoomId = course.RoomId, StartAtUtc = start, EndAtUtc = start.AddHours(1), Reason = "Under review",
                    CreatedByUserId = course.ManagerId, CreatedAtUtc = DateTime.UtcNow, ExpiresAtUtc = start, Status = IncidentFenceStatus.Open });
            if (source.EndsWith("-rental"))
                db.CourtRentals.Add(new CourtRental { CourtRentalId = Guid.NewGuid(), MemberId = course.ManagerId,
                    SportId = 3, RoomId = course.RoomId, StartAtUtc = start, EndAtUtc = start.AddHours(1), CreatedAtUtc = DateTime.UtcNow,
                    Status = source switch { "pending-rental" => CourtRentalStatus.PendingPayment, "confirmed-rental" => CourtRentalStatus.Confirmed, _ => CourtRentalStatus.InUse } });
            await db.SaveChangesAsync();
            return 0;
        });
        using var manager = factory.CreateApiClient(course.ManagerId, UserRole.CenterManager);
        var response = await manager.DeleteAsync($"api/rooms/{course.RoomId}");
        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        Assert.Contains("room_in_use", await response.Content.ReadAsStringAsync());
        Assert.Null(await factory.QueryAsync(db => db.Rooms.Where(r => r.RoomId == course.RoomId).Select(r => r.DeletedAtUtc).SingleAsync()));
    }
}
