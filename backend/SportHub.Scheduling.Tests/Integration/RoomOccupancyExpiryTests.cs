using Microsoft.EntityFrameworkCore;
using SportHub.BuildingBlocks.SharedKernel.Time;
using SportHub.Identity.Domain.Enums;
using SportHub.Scheduling.Catalog.Domain;
using SportHub.Scheduling.Domain.Entities;
using SportHub.Scheduling.Occupancy.Domain;
using SportHub.Scheduling.Occupancy.Application;
using SportHub.Scheduling.Rental.Domain;

namespace SportHub.Scheduling.Tests.Integration;

[Collection(nameof(SchedulingApiCollection))]
public sealed class RoomOccupancyExpiryTests(SchedulingApiFactory factory)
{
    // Future relative to the real clock so the hosted job cannot race this controlled-clock test.
    private static readonly DateTime Now = new(2040, 11, 12, 10, 0, 0, DateTimeKind.Utc);
    private sealed class FixedClock : IClock { public DateTime UtcNow => Now; }

    [Theory]
    [InlineData(-10, -10, true, OccupancySourceType.RoomBlock, true, true)]
    [InlineData(0, 0, true, OccupancySourceType.RoomBlock, true, true)]
    [InlineData(1, 1, true, OccupancySourceType.RoomBlock, true, false)]
    [InlineData(10, -1, true, OccupancySourceType.RoomBlock, true, true)]
    [InlineData(-1, 10, true, OccupancySourceType.RoomBlock, true, false)]
    [InlineData(-10, -10, false, OccupancySourceType.RoomBlock, true, true)]
    [InlineData(-10, -10, true, OccupancySourceType.RoomBlock, false, false)]
    [InlineData(-10, -10, false, OccupancySourceType.CourtRental, true, true)]
    [InlineData(-10, -10, false, OccupancySourceType.ClassSession, true, true)]
    [InlineData(1, 1, false, OccupancySourceType.CourtRental, true, false)]
    [InlineData(1, 1, false, OccupancySourceType.ClassSession, true, false)]
    public async Task Expiry_releases_elapsed_intervals_from_all_sources_and_preserves_history(
        int incidentEndMinutes, int blockEndMinutes, bool fromIncident,
        OccupancySourceType sourceType, bool active, bool shouldRelease)
    {
        var manager = await factory.SeedUserAsync(UserRole.CenterManager);
        var occupancyId = Guid.NewGuid();
        var futureOccupancyId = Guid.NewGuid();
        var blockId = Guid.NewGuid();
        var incidentId = Guid.NewGuid();
        await factory.QueryAsync(async db =>
        {
            var room = new Room { Name = $"Incident expiry {Guid.NewGuid():N}", Capacity = 10 };
            db.Rooms.Add(room);
            await db.SaveChangesAsync();
            if (fromIncident)
                db.Set<IncidentNotice>().Add(new IncidentNotice
                {
                    IncidentId = incidentId, Scope = IncidentScope.Room, RoomId = room.RoomId,
                    StartAtUtc = Now.AddDays(-1), EndAtUtc = Now.AddMinutes(incidentEndMinutes),
                    Reason = "Elapsed incident regression", CreatedByUserId = manager.UserId,
                    CreatedAtUtc = Now.AddDays(-2)
                });
            db.Set<RoomBlock>().Add(new RoomBlock
            {
                BlockId = blockId, RoomId = room.RoomId, IncidentId = fromIncident ? incidentId : null,
                StartAtUtc = Now.AddHours(-1), EndAtUtc = Now.AddMinutes(blockEndMinutes),
                Reason = "Elapsed block regression", CreatedByUserId = manager.UserId
            });
            db.Set<RoomOccupancy>().Add(new RoomOccupancy
            {
                OccupancyId = occupancyId, RoomId = room.RoomId, SourceType = sourceType,
                SourceId = blockId, StartAtUtc = Now.AddHours(-1),
                EndAtUtc = Now.AddMinutes(blockEndMinutes), IsActive = active
            });
            db.Set<RoomOccupancy>().Add(new RoomOccupancy
            {
                OccupancyId = futureOccupancyId, RoomId = room.RoomId, SourceType = sourceType,
                SourceId = Guid.NewGuid(), StartAtUtc = Now.AddDays(1),
                EndAtUtc = Now.AddDays(1).AddHours(1), IsActive = true
            });
            await db.SaveChangesAsync();
            return 0;
        });

        await factory.QueryAsync(async db =>
        {
            var service = new RoomOccupancyExpiryService(db, new FixedClock());
            await service.ExpireAsync();
            var row = await db.Set<RoomOccupancy>().AsNoTracking().SingleAsync(o => o.OccupancyId == occupancyId);
            Assert.Equal(active && !shouldRelease, row.IsActive);
            Assert.Equal(blockId, row.SourceId);
            Assert.True(await db.Set<RoomOccupancy>().AsNoTracking()
                .Where(o => o.OccupancyId == futureOccupancyId).Select(o => o.IsActive).SingleAsync());
            Assert.True(await db.Set<RoomBlock>().AnyAsync(b => b.BlockId == blockId));
            if (fromIncident) Assert.True(await db.Set<IncidentNotice>().AnyAsync(i => i.IncidentId == incidentId));
            Assert.Equal(0, await service.ExpireAsync());
            return 0;
        });
    }
}
