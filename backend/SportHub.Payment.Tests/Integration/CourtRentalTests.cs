using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SportHub.API.Persistence;
using SportHub.BuildingBlocks.Abstractions.Scheduling;
using SportHub.BuildingBlocks.SharedKernel.Errors;
using SportHub.BuildingBlocks.SharedKernel.Time;
using SportHub.Identity.Domain.Entities;
using SportHub.Identity.Domain.Enums;
using SportHub.Payment.Application.Services;
using SportHub.Scheduling.Catalog.Domain;
using SportHub.Scheduling.Domain.Entities;
using SportHub.Scheduling.Rental.Application;
using SportHub.Scheduling.Rental.Domain;

namespace SportHub.Payment.Tests.Integration;

[Collection(nameof(PaymentApiCollection))]
public sealed class CourtRentalTests(PaymentApiFactory factory)
{
    [Fact]
    public async Task Paid_rental_is_private_and_center_cancellation_credits_points_once()
    {
        var request = await SetupAsync();
        var manager = await factory.SeedUserAsync(UserRole.CenterManager);
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SportHubDbContext>();
        await using (var tx = await db.Database.BeginTransactionAsync())
        {
            await scope.ServiceProvider.GetRequiredService<SportHub.BuildingBlocks.Abstractions.Wallet.IPointWalletService>()
                .EarnAsync(new(request.ExternalCoachId, 100, "TestCredit", Guid.NewGuid()));
            await tx.CommitAsync();
        }
        var checkouts = scope.ServiceProvider.GetRequiredService<CheckoutService>();
        var checkout = await checkouts.CreateCourtRentalAsync(request, Guid.NewGuid().ToString(), request.ExternalCoachId, default);
        await scope.ServiceProvider.GetRequiredService<SportHub.Payment.Wallet.Application.PointConfirmationService>()
            .SelectSelfAsync(checkout.InvoiceId, 100, request.ExternalCoachId, default);
        await checkouts.StartPaymentAsync(checkout.InvoiceId, request.ExternalCoachId, false, "127.0.0.1", default);
        var operations = scope.ServiceProvider.GetRequiredService<CourtRentalOperationsService>();
        await Assert.ThrowsAsync<ForbiddenException>(() => operations.CancelByOwnerAsync(checkout.ResourceHoldId!.Value, manager.UserId));
        Assert.Empty(await operations.MineAsync(manager.UserId, request.StartUtc.UtcDateTime, request.EndUtc.UtcDateTime));
        await operations.CancelByCenterAsync(checkout.ResourceHoldId!.Value, manager.UserId, "Center court repair");
        await Assert.ThrowsAsync<ConflictException>(() => operations.CancelByCenterAsync(checkout.ResourceHoldId.Value, manager.UserId, "Center court repair"));
        await factory.QueryAsync(async state =>
        {
            var rental = await state.Set<CourtRental>().SingleAsync(x => x.CourtRentalId == checkout.ResourceHoldId);
            Assert.Equal(CourtRentalStatus.Cancelled, rental.Status);
            Assert.Equal(100, await state.PointWallets.Where(x => x.OwnerUserId == request.ExternalCoachId).Select(x => x.AvailablePoints).SingleAsync());
            Assert.Equal(1, await state.PointLedgerEntries.CountAsync(x => x.InvoiceItemId == rental.InvoiceItemId
                && x.EntryType == SportHub.Payment.Wallet.Domain.PointEntryType.Earn));
            return 0;
        });
    }

    private async Task<CourtRentalRequest> SetupAsync(bool approved = true)
    {
        var coach = await factory.SeedUserAsync(UserRole.ExternalCoach);
        return await factory.QueryAsync(async db =>
        {
            db.ExternalCoachProfiles.Add(new ExternalCoachProfile { UserId = coach.UserId,
                ApprovalStatus = approved ? ExternalCoachApprovalStatus.Approved : ExternalCoachApprovalStatus.PendingApproval,
                CreatedAt = DateTime.UtcNow });
            db.UserSportSpecialties.Add(new UserSportSpecialty { UserId = coach.UserId, SportId = 3 });
            var room = new Room { Name = "Rental test " + Guid.NewGuid(), Capacity = 12, RoomTypeId = 3 };
            db.Rooms.Add(room);
            await db.SaveChangesAsync();
            db.RoomOpeningHours.AddRange(Enumerable.Range(0, 7).Select(day => new RoomOpeningHour
                { RoomId = room.RoomId, DayOfWeek = day, OpenTimeLocal = new(6, 0), CloseTimeLocal = new(22, 0) }));
            if (!await db.Set<CourtRate>().AnyAsync(x => x.RoomTypeId == 3))
                db.Set<CourtRate>().Add(new CourtRate { RoomTypeId = 3, SportId = 3,
                    DaysOfWeek = "MON,TUE,WED,THU,FRI,SAT,SUN", StartTimeLocal = new(6, 0),
                    EndTimeLocal = new(22, 0), PricePerHour = 100_000 });
            await db.SaveChangesAsync();
            var start = VietnamTime.StartOfDayUtc(DateOnly.FromDateTime(VietnamTime.ToLocal(DateTime.UtcNow)).AddDays(5)).AddHours(10);
            return new CourtRentalRequest(coach.UserId, 3, room.RoomId, start, start.AddHours(1), 4);
        });
    }

    [Fact]
    public async Task Pending_coach_cannot_checkout_and_no_invoice_is_created()
    {
        var request = await SetupAsync(false);
        using var scope = factory.Services.CreateScope();
        await Assert.ThrowsAsync<ForbiddenException>(() => scope.ServiceProvider.GetRequiredService<CheckoutService>()
            .CreateCourtRentalAsync(request, Guid.NewGuid().ToString(), request.ExternalCoachId, default));
        Assert.False(await factory.QueryAsync(db => db.Invoices.AnyAsync(x => x.MemberId == request.ExternalCoachId)));
    }

    [Fact]
    public async Task Concurrent_same_slot_has_one_winner_and_cancel_releases_occupancy()
    {
        var request = await SetupAsync();
        async Task<Guid?> Reserve()
        {
            using var scope = factory.Services.CreateScope();
            try
            {
                return (await scope.ServiceProvider.GetRequiredService<CheckoutService>()
                    .CreateCourtRentalAsync(request, Guid.NewGuid().ToString(), request.ExternalCoachId, default)).InvoiceId;
            }
            catch (OccupancyConflictException) { return null; }
        }
        var results = await Task.WhenAll(Reserve(), Reserve());
        var invoice = Assert.Single(results, x => x.HasValue)!.Value;
        using var scope = factory.Services.CreateScope();
        await scope.ServiceProvider.GetRequiredService<CheckoutService>().CancelAsync(invoice, request.ExternalCoachId, false, default);
        var retry = await scope.ServiceProvider.GetRequiredService<CheckoutService>()
            .CreateCourtRentalAsync(request, Guid.NewGuid().ToString(), request.ExternalCoachId, default);
        Assert.NotEqual(invoice, retry.InvoiceId);
    }

    [Fact]
    public async Task Incident_cancels_pending_checkout_and_blocks_future_reservation_atomically()
    {
        var request = await SetupAsync();
        var manager = await factory.SeedUserAsync(UserRole.CenterManager);
        using var scope = factory.Services.CreateScope();
        var checkout = await scope.ServiceProvider.GetRequiredService<CheckoutService>()
            .CreateCourtRentalAsync(request, Guid.NewGuid().ToString(), request.ExternalCoachId, default);
        var incidents = scope.ServiceProvider.GetRequiredService<IncidentService>();
        var incident = new IncidentRequest("Room", request.RoomId, request.StartUtc.UtcDateTime,
            request.EndUtc.UtcDateTime, "Court floor repair");
        Assert.True((await incidents.PreviewAsync(incident)).CanResolve);
        await incidents.ResolveAsync(incident, manager.UserId);
        var rental = await factory.QueryAsync(db => db.Set<CourtRental>().AsNoTracking()
            .SingleAsync(x => x.InvoiceId == checkout.InvoiceId));
        Assert.Equal(CourtRentalStatus.Cancelled, rental.Status);
        using var fresh = factory.Services.CreateScope();
        await Assert.ThrowsAsync<OccupancyConflictException>(() => fresh.ServiceProvider.GetRequiredService<CheckoutService>()
            .CreateCourtRentalAsync(request, Guid.NewGuid().ToString(), request.ExternalCoachId, default));
    }
}
