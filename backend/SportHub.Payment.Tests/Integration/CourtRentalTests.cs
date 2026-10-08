using Microsoft.EntityFrameworkCore;
using System.Net.Http.Json;
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
    public async Task Invoice_detail_resolves_names_and_times_for_legacy_rental_descriptions()
    {
        var request = await SetupAsync();
        using var scope = factory.Services.CreateScope();
        var checkout = await scope.ServiceProvider.GetRequiredService<CheckoutService>()
            .CreateCourtRentalAsync(request, Guid.NewGuid().ToString(), request.MemberId, default);
        var expectedRoom = await factory.QueryAsync(db => db.Rooms.AsNoTracking()
            .Where(r => r.RoomId == request.RoomId).Select(r => r.Name).SingleAsync());
        await factory.QueryAsync(async db =>
        {
            var item = await db.Set<SportHub.Payment.Domain.Entities.InvoiceItem>().SingleAsync(i => i.InvoiceId == checkout.InvoiceId);
            item.Description = $"Thuê sân #{request.RoomId}, môn #3, 1 giờ";
            await db.SaveChangesAsync();
            return 0;
        });
        var owner = factory.CreateApiClient(request.MemberId, UserRole.Member);
        var response = await owner.GetAsync($"/api/invoices/{checkout.InvoiceId}");
        Assert.True(response.IsSuccessStatusCode, await response.Content.ReadAsStringAsync());
        var detail = await response.Content.ReadFromJsonAsync<SportHub.Payment.Application.DTOs.InvoiceDetailResponse>();
        var rental = Assert.Single(detail!.Items);
        Assert.Equal(expectedRoom, rental.RoomName);
        Assert.False(string.IsNullOrWhiteSpace(rental.SportName));
        Assert.Contains(expectedRoom, rental.Description);
        Assert.DoesNotContain("môn #", rental.Description);
        Assert.Equal(request.StartUtc.UtcDateTime, rental.RentalStartAtUtc);
        Assert.Equal(request.EndUtc.UtcDateTime, rental.RentalEndAtUtc);
    }

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
                .EarnAsync(new(request.MemberId, 100, "TestCredit", Guid.NewGuid()));
            await tx.CommitAsync();
        }
        var checkouts = scope.ServiceProvider.GetRequiredService<CheckoutService>();
        var checkout = await checkouts.CreateCourtRentalAsync(request, Guid.NewGuid().ToString(), request.MemberId, default);
        await scope.ServiceProvider.GetRequiredService<SportHub.Payment.Wallet.Application.PointConfirmationService>()
            .SelectSelfAsync(checkout.InvoiceId, 100, request.MemberId, default);
        await checkouts.StartPaymentAsync(checkout.InvoiceId, request.MemberId, false, "127.0.0.1", default);
        var operations = scope.ServiceProvider.GetRequiredService<CourtRentalOperationsService>();
        await Assert.ThrowsAsync<ForbiddenException>(() => operations.CancelByOwnerAsync(checkout.ResourceHoldId!.Value, manager.UserId));
        Assert.Empty(await operations.MineAsync(manager.UserId, request.StartUtc.UtcDateTime, request.EndUtc.UtcDateTime));
        await operations.CancelByCenterAsync(checkout.ResourceHoldId!.Value, manager.UserId, "Center court repair");
        var detail = await operations.GetMineAsync(checkout.ResourceHoldId.Value, request.MemberId);
        Assert.Equal(100, detail.RefundPoints);
        Assert.Equal("Center court repair", detail.CancelReason);
        Assert.Equal(checkout.InvoiceId, detail.Rental.InvoiceId);
        Assert.Single(detail.Blocks);
        await Assert.ThrowsAsync<ConflictException>(() => operations.CancelByCenterAsync(checkout.ResourceHoldId.Value, manager.UserId, "Center court repair"));
        await factory.QueryAsync(async state =>
        {
            var rental = await state.Set<CourtRental>().SingleAsync(x => x.CourtRentalId == checkout.ResourceHoldId);
            Assert.Equal(CourtRentalStatus.Cancelled, rental.Status);
            Assert.Equal(100, await state.PointWallets.Where(x => x.OwnerUserId == request.MemberId).Select(x => x.AvailablePoints).SingleAsync());
            Assert.Equal(1, await state.PointLedgerEntries.CountAsync(x => x.InvoiceItemId == rental.InvoiceItemId
                && x.EntryType == SportHub.Payment.Wallet.Domain.PointEntryType.Earn));
            return 0;
        });
    }

    /// <summary>Member không có Membership Gym, chuyên môn hay hồ sơ nào: chỉ cần tài khoản hoạt động.</summary>
    private async Task<CourtRentalRequest> SetupAsync(bool active = true)
    {
        var member = await factory.SeedUserAsync(UserRole.Member, active ? UserStatus.Active : UserStatus.Banned);
        return await factory.QueryAsync(async db =>
        {
            // Sức chứa phòng không còn lọc lượt thuê: phòng 2 chỗ vẫn thuê được.
            var room = new Room { Name = "Rental test " + Guid.NewGuid(), Capacity = 2, RoomTypeId = 3 };
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
            return new CourtRentalRequest(member.UserId, 3, room.RoomId, start, start.AddHours(1));
        });
    }

    [Fact]
    public async Task Own_detail_and_invoice_listing_include_pending_checkout_and_enforce_ownership()
    {
        var request = await SetupAsync();
        var other = await factory.SeedUserAsync(UserRole.Member);
        using var scope = factory.Services.CreateScope();
        var checkout = await scope.ServiceProvider.GetRequiredService<CheckoutService>()
            .CreateCourtRentalAsync(request, Guid.NewGuid().ToString(), request.MemberId, default);
        using var owner = factory.CreateApiClient(request.MemberId, UserRole.Member);
        var detail = await owner.GetAsync($"/api/court-rentals/{checkout.ResourceHoldId}");
        Assert.True(detail.IsSuccessStatusCode, await detail.Content.ReadAsStringAsync());
        var parsed = await detail.Content.ReadFromJsonAsync<CourtRentalDetail>();
        Assert.Equal(checkout.InvoiceId, parsed!.Rental.InvoiceId);
        Assert.NotEmpty(parsed.RoomName); Assert.NotEmpty(parsed.SportName); Assert.Single(parsed.Blocks);
        var invoices = await owner.GetAsync("/api/members/me/rental-invoices?status=ISSUED");
        Assert.True(invoices.IsSuccessStatusCode, await invoices.Content.ReadAsStringAsync());
        Assert.Contains(checkout.InvoiceId.ToString(), await invoices.Content.ReadAsStringAsync());
        Assert.True((await owner.GetAsync("/api/court-rentals/policy")).IsSuccessStatusCode);
        using var stranger = factory.CreateApiClient(other.UserId, UserRole.Member);
        Assert.Equal(System.Net.HttpStatusCode.NotFound, (await stranger.GetAsync($"/api/court-rentals/{checkout.ResourceHoldId}")).StatusCode);
        Assert.DoesNotContain(checkout.InvoiceId.ToString(), await (await stranger.GetAsync("/api/members/me/rental-invoices")).Content.ReadAsStringAsync());
        await scope.ServiceProvider.GetRequiredService<CheckoutService>()
            .CancelAsync(checkout.InvoiceId, request.MemberId, false, default);
    }

    [Fact]
    public async Task Inactive_member_cannot_checkout_and_no_invoice_is_created()
    {
        var request = await SetupAsync(active: false);
        using var scope = factory.Services.CreateScope();
        await Assert.ThrowsAsync<ForbiddenException>(() => scope.ServiceProvider.GetRequiredService<CheckoutService>()
            .CreateCourtRentalAsync(request, Guid.NewGuid().ToString(), request.MemberId, default));
        Assert.False(await factory.QueryAsync(db => db.Invoices.AnyAsync(x => x.MemberId == request.MemberId)));
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
                    .CreateCourtRentalAsync(request, Guid.NewGuid().ToString(), request.MemberId, default)).InvoiceId;
            }
            catch (OccupancyConflictException) { return null; }
        }
        var results = await Task.WhenAll(Reserve(), Reserve());
        var invoice = Assert.Single(results, x => x.HasValue)!.Value;
        using var scope = factory.Services.CreateScope();
        await scope.ServiceProvider.GetRequiredService<CheckoutService>().CancelAsync(invoice, request.MemberId, false, default);
        var retry = await scope.ServiceProvider.GetRequiredService<CheckoutService>()
            .CreateCourtRentalAsync(request, Guid.NewGuid().ToString(), request.MemberId, default);
        Assert.NotEqual(invoice, retry.InvoiceId);
    }

    [Fact]
    public async Task Incident_cancels_pending_checkout_and_blocks_future_reservation_atomically()
    {
        var request = await SetupAsync();
        var manager = await factory.SeedUserAsync(UserRole.CenterManager);
        using var scope = factory.Services.CreateScope();
        var checkout = await scope.ServiceProvider.GetRequiredService<CheckoutService>()
            .CreateCourtRentalAsync(request, Guid.NewGuid().ToString(), request.MemberId, default);
        var incidents = scope.ServiceProvider.GetRequiredService<IncidentService>();
        var incident = new IncidentRequest("Room", request.RoomId, request.StartUtc.UtcDateTime,
            request.EndUtc.UtcDateTime, "Court floor repair");
        Assert.True((await incidents.PreviewAsync(incident)).CanResolve);
        var incidentId = await incidents.ResolveAsync(incident, manager.UserId);
        var delivery = await incidents.DeliveryAsync(incidentId);
        Assert.Equal(2, delivery.Total);
        Assert.Equal(2, delivery.Pending);
        var rental = await factory.QueryAsync(db => db.Set<CourtRental>().AsNoTracking()
            .SingleAsync(x => x.InvoiceId == checkout.InvoiceId));
        Assert.Equal(CourtRentalStatus.Cancelled, rental.Status);
        using var fresh = factory.Services.CreateScope();
        await Assert.ThrowsAsync<OccupancyConflictException>(() => fresh.ServiceProvider.GetRequiredService<CheckoutService>()
            .CreateCourtRentalAsync(request, Guid.NewGuid().ToString(), request.MemberId, default));
    }

    [Fact]
    public async Task Rental_holds_the_room_only_and_never_occupies_a_coach()
    {
        var request = await SetupAsync();
        using var scope = factory.Services.CreateScope();
        var checkout = await scope.ServiceProvider.GetRequiredService<CheckoutService>()
            .CreateCourtRentalAsync(request, Guid.NewGuid().ToString(), request.MemberId, default);
        await factory.QueryAsync(async db =>
        {
            var rows = await db.Set<SportHub.Scheduling.Occupancy.Domain.CoachOccupancy>().AsNoTracking()
                .Where(x => x.SourceId == checkout.ResourceHoldId).CountAsync();
            Assert.Equal(0, rows);
            var rooms = await db.Set<SportHub.Scheduling.Occupancy.Domain.RoomOccupancy>().AsNoTracking()
                .Where(x => x.SourceId == checkout.ResourceHoldId).CountAsync();
            Assert.Equal(1, rooms);
            return 0;
        });
    }

    [Fact]
    public async Task Disabled_court_rental_service_blocks_new_quotes_without_a_sport_name_whitelist()
    {
        var request = await SetupAsync();
        await factory.QueryAsync(async db =>
        {
            await db.Set<SportServiceOffering>().Where(x => x.SportId == 3 && x.ServiceType == SportServiceType.CourtRental)
                .ExecuteUpdateAsync(s => s.SetProperty(x => x.IsEnabled, false));
            return 0;
        });
        try
        {
            using var scope = factory.Services.CreateScope();
            await Assert.ThrowsAsync<BadRequestException>(() => scope.ServiceProvider.GetRequiredService<ICourtRentalFulfillment>()
                .QuoteAsync(request));
        }
        finally
        {
            await factory.QueryAsync(async db =>
            {
                await db.Set<SportServiceOffering>().Where(x => x.SportId == 3 && x.ServiceType == SportServiceType.CourtRental)
                    .ExecuteUpdateAsync(s => s.SetProperty(x => x.IsEnabled, true));
                return 0;
            });
        }
    }
}
