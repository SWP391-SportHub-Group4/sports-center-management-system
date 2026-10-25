using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SportHub.API.Persistence;
using SportHub.BuildingBlocks.Abstractions.Scheduling;
using SportHub.BuildingBlocks.SharedKernel.Errors;
using SportHub.BuildingBlocks.SharedKernel.Time;
using SportHub.Identity.Domain.Enums;
using SportHub.Payment.Application.Services;
using SportHub.Scheduling.Catalog.Domain;
using SportHub.Scheduling.Domain.Entities;
using SportHub.Scheduling.Rental.Application;
using SportHub.Scheduling.Rental.Domain;

namespace SportHub.Payment.Tests.Integration;

/// <summary>
/// While a manager is working through an incident, nobody may book into the affected window; the hold survives an abandoned
/// session (it is stored, listable and extendable) and never blocks forever (it expires on its own).
/// </summary>
[Collection(nameof(PaymentApiCollection))]
public sealed class IncidentFenceTests(PaymentApiFactory factory)
{
    private async Task<CourtRentalRequest> SetupAsync()
    {
        var member = await factory.SeedUserAsync(UserRole.Member);
        return await factory.QueryAsync(async db =>
        {
            var room = new Room { Name = "Fence test " + Guid.NewGuid(), Capacity = 2, RoomTypeId = 3 };
            db.Rooms.Add(room);
            await db.SaveChangesAsync();
            db.RoomOpeningHours.AddRange(Enumerable.Range(0, 7).Select(day => new RoomOpeningHour
                { RoomId = room.RoomId, DayOfWeek = day, OpenTimeLocal = new(6, 0), CloseTimeLocal = new(22, 0) }));
            if (!await db.Set<CourtRate>().AnyAsync(x => x.RoomTypeId == 3))
                db.Set<CourtRate>().Add(new CourtRate { RoomTypeId = 3, SportId = 3,
                    DaysOfWeek = "MON,TUE,WED,THU,FRI,SAT,SUN", StartTimeLocal = new(6, 0),
                    EndTimeLocal = new(22, 0), PricePerHour = 100_000 });
            await db.SaveChangesAsync();
            var start = VietnamTime.StartOfDayUtc(DateOnly.FromDateTime(VietnamTime.ToLocal(DateTime.UtcNow)).AddDays(1)).AddHours(10);
            return new CourtRentalRequest(member.UserId, 3, room.RoomId, start, start.AddHours(1));
        });
    }

    private static IncidentRequest WindowAround(CourtRentalRequest rental)
        => new("Room", rental.RoomId, rental.StartUtc.UtcDateTime.AddMinutes(-30), rental.EndUtc.UtcDateTime.AddMinutes(30),
            "Court floor repair");

    private static CourtRentalRequest Shifted(CourtRentalRequest rental, TimeSpan by)
        => rental with { StartUtc = rental.StartUtc + by, EndUtc = rental.EndUtc + by };

    private async Task<Guid> BookAsync(CourtRentalRequest request)
    {
        using var scope = factory.Services.CreateScope();
        return (await scope.ServiceProvider.GetRequiredService<CheckoutService>()
            .CreateCourtRentalAsync(request, Guid.NewGuid().ToString(), request.MemberId, default)).InvoiceId;
    }

    [Fact]
    public async Task Open_fence_blocks_new_bookings_in_the_window_only_until_it_is_released()
    {
        var request = await SetupAsync();
        var manager = await factory.SeedUserAsync(UserRole.CenterManager);
        using var scope = factory.Services.CreateScope();
        var incidents = scope.ServiceProvider.GetRequiredService<IncidentService>();

        var fence = await incidents.OpenFenceAsync(WindowAround(request), manager.UserId);
        Assert.False(fence.IsExpired);
        Assert.Equal(0, fence.RemainingImpacts);

        var blocked = await Assert.ThrowsAsync<ConflictException>(() => BookAsync(request));
        Assert.Equal("room_under_incident_review", blocked.ErrorCode);

        // Outside the window is unaffected.
        await BookAsync(Shifted(request, TimeSpan.FromHours(3)));

        await incidents.ReleaseFenceAsync(fence.FenceId, manager.UserId);
        await BookAsync(request);
        Assert.DoesNotContain(await incidents.ListOpenFencesAsync(), f => f.FenceId == fence.FenceId);
    }

    [Fact]
    public async Task Opening_the_same_window_twice_reuses_one_fence()
    {
        var request = await SetupAsync();
        var manager = await factory.SeedUserAsync(UserRole.CenterManager);
        using var scope = factory.Services.CreateScope();
        var incidents = scope.ServiceProvider.GetRequiredService<IncidentService>();

        var first = await incidents.OpenFenceAsync(WindowAround(request), manager.UserId);
        var second = await incidents.OpenFenceAsync(WindowAround(request), manager.UserId);

        Assert.Equal(first.FenceId, second.FenceId);
        Assert.Equal(1, await factory.QueryAsync(db => db.Set<IncidentFence>()
            .CountAsync(f => f.RoomId == request.RoomId && f.Status == IncidentFenceStatus.Open)));
    }

    [Fact]
    public async Task Expired_fence_stops_blocking_and_extending_it_blocks_again()
    {
        var request = await SetupAsync();
        var manager = await factory.SeedUserAsync(UserRole.CenterManager);
        using var scope = factory.Services.CreateScope();
        var incidents = scope.ServiceProvider.GetRequiredService<IncidentService>();
        var fence = await incidents.OpenFenceAsync(WindowAround(request), manager.UserId);

        // The manager walked away and the hold lapsed.
        await factory.QueryAsync(async db =>
        {
            await db.Set<IncidentFence>().Where(f => f.FenceId == fence.FenceId)
                .ExecuteUpdateAsync(s => s.SetProperty(f => f.ExpiresAtUtc, DateTime.UtcNow.AddMinutes(-1)));
            return 0;
        });

        // Recoverable: it is still listed, flagged expired, so the manager can pick the work back up.
        var listed = Assert.Single(await incidents.ListOpenFencesAsync(), f => f.FenceId == fence.FenceId);
        Assert.True(listed.IsExpired);

        await BookAsync(request); // expired fence no longer blocks
        await incidents.ExtendFenceAsync(fence.FenceId, manager.UserId);
        Assert.False(Assert.Single(await incidents.ListOpenFencesAsync(), f => f.FenceId == fence.FenceId).IsExpired);
        var blocked = await Assert.ThrowsAsync<ConflictException>(() => BookAsync(request));
        Assert.Equal("room_under_incident_review", blocked.ErrorCode);
    }

    [Fact]
    public async Task Listing_shows_what_is_left_and_resolving_closes_the_fence()
    {
        var request = await SetupAsync();
        var manager = await factory.SeedUserAsync(UserRole.CenterManager);
        await BookAsync(request); // a pending checkout already sits in the window
        using var scope = factory.Services.CreateScope();
        var incidents = scope.ServiceProvider.GetRequiredService<IncidentService>();

        var fence = await incidents.OpenFenceAsync(WindowAround(request), manager.UserId);
        var listed = Assert.Single(await incidents.ListOpenFencesAsync(), f => f.FenceId == fence.FenceId);
        Assert.Equal(1, listed.RemainingImpacts);
        Assert.Equal(1, listed.AffectedMemberCount);
        Assert.True(listed.CanResolve);

        // Applying the incident (room blocks) is exempt from its own fence.
        var incidentId = await incidents.ResolveAsync(WindowAround(request), manager.UserId);

        Assert.DoesNotContain(await incidents.ListOpenFencesAsync(), f => f.FenceId == fence.FenceId);
        var closed = await factory.QueryAsync(db => db.Set<IncidentFence>().AsNoTracking().SingleAsync(f => f.FenceId == fence.FenceId));
        Assert.Equal(IncidentFenceStatus.Resolved, closed.Status);
        Assert.Equal(incidentId, closed.ResolvedIncidentId);

        await Assert.ThrowsAsync<ConflictException>(() => incidents.ReleaseFenceAsync(fence.FenceId, manager.UserId));
    }
}
