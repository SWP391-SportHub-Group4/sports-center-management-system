using Microsoft.EntityFrameworkCore;
using SportHub.Identity.Domain.Enums;
using SportHub.Notification.Domain.Enums;
using SportHub.Scheduling.Catalog.Domain;
using SportHub.Scheduling.Occupancy.Domain;
using SportHub.Scheduling.Rental.Application;
using SportHub.Scheduling.Rental.Domain;

namespace SportHub.Scheduling.Tests.Integration;

[Collection(nameof(SchedulingApiCollection))]
public sealed class IncidentCancellationTests(SchedulingApiFactory factory)
{
    [Theory]
    [InlineData(-2, -1, false)]
    [InlineData(-2, 0, false)]
    [InlineData(-2, 1, true)]
    [InlineData(1, 2, true)]
    public async Task Only_ongoing_and_future_incidents_can_be_cancelled(int startHours, int endHours, bool allowed)
    {
        var manager = await factory.SeedUserAsync(UserRole.CenterManager);
        var now = DateTime.UtcNow;
        var id = Guid.NewGuid();
        await factory.QueryAsync(async db => {
            db.Set<IncidentNotice>().Add(new IncidentNotice { IncidentId = id, Scope = IncidentScope.Center,
                StartAtUtc = now.AddHours(startHours), EndAtUtc = now.AddHours(endHours),
                CreatedByUserId = manager.UserId, CreatedAtUtc = now.AddDays(-1), Reason = "Maintenance" });
            await db.SaveChangesAsync();
            return 0;
        });
        using var scope = Microsoft.Extensions.DependencyInjection.ServiceProviderServiceExtensions.CreateScope(factory.Services);
        var service = Microsoft.Extensions.DependencyInjection.ActivatorUtilities.CreateInstance<IncidentService>(scope.ServiceProvider, new TestClock(now));
        if (allowed) await service.CancelAsync(id, manager.UserId);
        else
        {
            var error = await Assert.ThrowsAsync<SportHub.BuildingBlocks.SharedKernel.Errors.ConflictException>(
                () => service.CancelAsync(id, manager.UserId));
            Assert.Equal("incident_already_ended", error.ErrorCode);
        }
        Assert.Equal(allowed, (await Run(s => s.GetAsync(id))).CancelledAtUtc is not null);
        if (!allowed) Assert.False(await factory.QueryAsync(db => db.Notifications.AnyAsync(n => n.SourceEntityId == id)));
    }

    [Theory]
    [InlineData("ROOM")]
    [InlineData("CENTER")]
    public async Task Cancellation_releases_blocks_keeps_history_and_announces_once_to_original_recipients(string scope)
    {
        var manager = await factory.SeedUserAsync(UserRole.CenterManager);
        var member = await factory.SeedUserAsync(UserRole.Member);
        var roomId = await CourseTestData.RoomAsync(factory);
        var start = DateTime.UtcNow.Date.AddYears(8).AddDays(scope == "ROOM" ? 1 : 4).AddHours(2);
        var request = new IncidentRequest(scope, scope == "ROOM" ? roomId : null, start, start.AddHours(2), "Maintenance",
            OperationId: Guid.NewGuid());
        var preview = await Run(s => s.ReviewAsync(request, manager.UserId));
        var id = await Run(s => s.ResolveAsync(request with { PreviewToken = preview.PreviewToken }, manager.UserId));
        var blocks = await factory.QueryAsync(db => db.Set<RoomBlock>().Where(b => b.IncidentId == id).Select(b => b.BlockId).ToListAsync());
        Assert.NotEmpty(blocks);
        var later = await factory.SeedUserAsync(UserRole.Member);
        var rentalId = Guid.NewGuid();
        var cancelledAt = DateTime.UtcNow.AddMinutes(-1);
        await factory.QueryAsync(async db => {
            db.Set<CourtRental>().Add(new CourtRental { CourtRentalId = rentalId, MemberId = member.UserId,
                SportId = 3, RoomId = roomId, StartAtUtc = start, EndAtUtc = start.AddHours(1),
                Status = CourtRentalStatus.Cancelled, CancellationIncidentId = id, CancelledAtUtc = cancelledAt,
                CancelReason = "Incident", CreatedAtUtc = cancelledAt });
            await db.SaveChangesAsync();
            return 0;
        });
        using var memberClient = factory.CreateApiClient(member.UserId, UserRole.Member);
        Assert.Equal(System.Net.HttpStatusCode.Forbidden,
            (await memberClient.PostAsync($"/api/manager/incidents/{id}/cancel", null)).StatusCode);
        using var managerClient = factory.CreateApiClient(manager.UserId, UserRole.CenterManager);
        Assert.Equal(System.Net.HttpStatusCode.NoContent,
            (await managerClient.PostAsync($"/api/manager/incidents/{id}/cancel", null)).StatusCode);

        await Cancel(id, manager.UserId);

        var details = await Run(s => s.GetAsync(id));
        Assert.NotNull(details.CancelledAtUtc);
        Assert.Equal(request.Reason, details.Reason);
        var rental = await factory.QueryAsync(db => db.Set<CourtRental>().SingleAsync(r => r.CourtRentalId == rentalId));
        Assert.Equal(CourtRentalStatus.Cancelled, rental.Status);
        Assert.Equal(id, rental.CancellationIncidentId);
        Assert.Equal("Incident", rental.CancelReason);
        Assert.False(await factory.QueryAsync(db => db.Set<RoomBlock>().AnyAsync(b => b.IncidentId == id)));
        Assert.False(await factory.QueryAsync(db => db.RoomOccupancies.AnyAsync(o => blocks.Contains(o.SourceId) && o.IsActive)));
        var notices = await factory.QueryAsync(db => db.Notifications.Where(n => n.SourceEntityId == id
            && n.SourceEventType == NotificationSourceEventType.IncidentCancelled).ToListAsync());
        var originalRecipients = await factory.QueryAsync(db => db.Notifications.Where(n => n.SourceEntityId == id
            && n.SourceEventType == NotificationSourceEventType.IncidentCreated).Select(n => n.UserId).Distinct().CountAsync());
        Assert.Equal(originalRecipients * 2, notices.Count);
        Assert.Contains(notices, n => n.UserId == member.UserId && n.Channel == NotificationChannel.InApp);
        Assert.DoesNotContain(notices, n => n.UserId == later.UserId);
        Assert.All(notices.Where(n => n.Channel == NotificationChannel.InApp), n => {
            Assert.Contains(scope == "CENTER" ? "The center has reopened" : "has reopened", n.Message);
            Assert.Contains("Cancelled bookings will not be restored automatically.", n.Message);
            Assert.Contains("Please check the status of courts and rooms before your visit.", n.Message);
        });
        // A cancelled notice must no longer prevent reviewing the same window.
        await Run(s => s.ReviewAsync(request with { OperationId = Guid.NewGuid() }, manager.UserId));
    }

    [Fact]
    public async Task Cancelling_owner_of_a_shared_block_preserves_the_other_incident_window()
    {
        var manager = await factory.SeedUserAsync(UserRole.CenterManager);
        var roomId = await CourseTestData.RoomAsync(factory);
        var start = DateTime.UtcNow.Date.AddYears(9).AddHours(2);
        var first = Guid.NewGuid();
        var other = Guid.NewGuid();
        var blockId = Guid.NewGuid();
        await factory.QueryAsync(async db => {
            db.Set<IncidentNotice>().AddRange(
                new IncidentNotice { IncidentId = first, Scope = IncidentScope.Center, StartAtUtc = start, EndAtUtc = start.AddHours(3),
                    CreatedByUserId = manager.UserId, CreatedAtUtc = DateTime.UtcNow, Reason = "Center closure" },
                new IncidentNotice { IncidentId = other, Scope = IncidentScope.Room, RoomId = roomId, StartAtUtc = start.AddHours(1),
                    EndAtUtc = start.AddHours(2), CreatedByUserId = manager.UserId, CreatedAtUtc = DateTime.UtcNow, Reason = "Court repair" });
            db.Set<RoomBlock>().Add(new RoomBlock { BlockId = blockId, RoomId = roomId, StartAtUtc = start, EndAtUtc = start.AddHours(3),
                IncidentId = first, CreatedByUserId = manager.UserId, Reason = "Center closure" });
            db.RoomOccupancies.Add(new RoomOccupancy { OccupancyId = Guid.NewGuid(), RoomId = roomId, SourceType = OccupancySourceType.RoomBlock,
                SourceId = blockId, StartAtUtc = start, EndAtUtc = start.AddHours(3), IsActive = true });
            await db.SaveChangesAsync();
            return 0;
        });
        await Cancel(first, manager.UserId);
        var kept = Assert.Single(await factory.QueryAsync(db => db.Set<RoomBlock>().Where(b => b.IncidentId == other).ToListAsync()));
        Assert.Equal(start.AddHours(1), kept.StartAtUtc);
        Assert.Equal(start.AddHours(2), kept.EndAtUtc);
        Assert.True(await factory.QueryAsync(db => db.RoomOccupancies.AnyAsync(o => o.SourceId == kept.BlockId && o.IsActive)));
        await Cancel(other, manager.UserId);
        Assert.False(await factory.QueryAsync(db => db.Set<RoomBlock>().AnyAsync(b => b.IncidentId == other)));
    }

    private Task<T> Run<T>(Func<IncidentService, Task<T>> action) => CourseTestData.RunAsync<IncidentService, T>(factory, action);
    private Task<int> Cancel(Guid id, Guid managerId) => Run(async s => { await s.CancelAsync(id, managerId); return 0; });
}
