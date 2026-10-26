using Microsoft.EntityFrameworkCore;
using System.Net;
using System.Net.Http.Json;
using Microsoft.Extensions.DependencyInjection;
using SportHub.API.Persistence;
using SportHub.BuildingBlocks.Abstractions.Scheduling;
using SportHub.BuildingBlocks.SharedKernel.Errors;
using SportHub.BuildingBlocks.SharedKernel.Time;
using SportHub.Identity.Domain.Entities;
using SportHub.Identity.Domain.Enums;
using SportHub.Payment.Application.Services;
using SportHub.Payment.Application.DTOs.Checkouts;
using SportHub.Scheduling.Catalog.Domain;
using SportHub.Scheduling.Domain.Entities;
using SportHub.Scheduling.Rental.Application;
using SportHub.Scheduling.Rental.Domain;

namespace SportHub.Payment.Tests.Integration;

[Collection(nameof(PaymentApiCollection))]
public sealed class CourtRentalTests(PaymentApiFactory factory)
{
    [Fact]
    public async Task Disabling_room_rental_preserves_existing_checkout_and_reserved_slot()
    {
        var request = await SetupAsync();
        var manager = await factory.SeedUserAsync(UserRole.CenterManager);
        using var scope = factory.Services.CreateScope();
        var checkout = await scope.ServiceProvider.GetRequiredService<CheckoutService>()
            .CreateCourtRentalAsync(request, Guid.NewGuid().ToString(), request.MemberId, default);
        var rentalId = checkout.ResourceHoldId!.Value;
        var statusBefore = await factory.QueryAsync(db => db.Set<CourtRental>().Where(r => r.CourtRentalId == rentalId).Select(r => r.Status).SingleAsync());
        using var client = factory.CreateApiClient(manager.UserId, UserRole.CenterManager);
        (await client.PutAsJsonAsync($"/api/rooms/{request.RoomId}/rental-access", new { allowRental = false })).EnsureSuccessStatusCode();
        await factory.QueryAsync(async db => {
            Assert.Equal(statusBefore, await db.Set<CourtRental>().Where(r => r.CourtRentalId == rentalId).Select(r => r.Status).SingleAsync());
            Assert.True(await db.RoomOccupancies.AnyAsync(o => o.SourceId == rentalId && o.IsActive));
            Assert.True(await db.Invoices.AnyAsync(i => i.InvoiceId == checkout.InvoiceId));
            return 0;
        });
        var rentals = scope.ServiceProvider.GetRequiredService<CourtRentalService>();
        Assert.Equal("rental_room_incompatible", (await Assert.ThrowsAsync<ConflictException>(() => rentals.QuoteAsync(request))).ErrorCode);
    }

    [Fact]
    public async Task Paid_rental_is_private_and_center_cancellation_only_notifies_until_member_chooses_points()
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
        // Cancelling only notifies: nothing is credited yet, but the detail quotes the 100% points offer.
        Assert.Equal(100, detail.RefundPoints);
        Assert.Equal("Center court repair", detail.CancelReason);
        Assert.Equal(checkout.InvoiceId, detail.Rental.InvoiceId);
        Assert.Single(detail.Blocks);
        await Assert.ThrowsAsync<ConflictException>(() => operations.CancelByCenterAsync(checkout.ResourceHoldId.Value, manager.UserId, "Center court repair"));
        await factory.QueryAsync(async state =>
        {
            var rental = await state.Set<CourtRental>().SingleAsync(x => x.CourtRentalId == checkout.ResourceHoldId);
            Assert.Equal(CourtRentalStatus.Cancelled, rental.Status);
            Assert.Equal(0, await state.PointWallets.Where(x => x.OwnerUserId == request.MemberId).Select(x => x.AvailablePoints).SingleAsync());
            Assert.Equal(0, await state.PointLedgerEntries.CountAsync(x => x.InvoiceItemId == rental.InvoiceItemId
                && x.ReferenceType == "SystemEvent" && x.EntryType == SportHub.Payment.Wallet.Domain.PointEntryType.Earn));
            return 0;
        });

        var refunds = scope.ServiceProvider.GetRequiredService<ICenterCancellationRefundService>();
        var offer = Assert.Single(await refunds.ListMineAsync(request.MemberId));
        Assert.Equal("Offer", offer.Status);
        Assert.Equal("CourtRental", offer.Kind);
        Assert.Equal(100, offer.RefundPoints);
        await Assert.ThrowsAsync<ForbiddenException>(() => refunds.ChoosePointsAsync(manager.UserId, offer.InvoiceItemId));

        // Choosing points credits automatically, once; choosing again returns the same credit.
        var chosen = await refunds.ChoosePointsAsync(request.MemberId, offer.InvoiceItemId);
        Assert.Equal(100, chosen.PointsCredited);
        Assert.False(chosen.AlreadyApplied);
        var again = await refunds.ChoosePointsAsync(request.MemberId, offer.InvoiceItemId);
        Assert.Equal(100, again.PointsCredited);
        Assert.True(again.AlreadyApplied);
        Assert.Equal("PointsCredited", Assert.Single(await refunds.ListMineAsync(request.MemberId)).Status);
        await factory.QueryAsync(async state =>
        {
            Assert.Equal(100, await state.PointWallets.Where(x => x.OwnerUserId == request.MemberId).Select(x => x.AvailablePoints).SingleAsync());
            Assert.Equal(1, await state.PointLedgerEntries.CountAsync(x => x.InvoiceItemId == offer.InvoiceItemId
                && x.ReferenceType == "SystemEvent" && x.EntryType == SportHub.Payment.Wallet.Domain.PointEntryType.Earn));
            return 0;
        });
    }

    [Fact]
    public async Task Center_cancelled_rental_is_refunded_as_points_automatically_two_days_after_the_notice()
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
        await operations.CancelByCenterAsync(checkout.ResourceHoldId!.Value, manager.UserId, "Center court repair");
        var refunds = scope.ServiceProvider.GetRequiredService<ICenterCancellationRefundService>();

        // Inside the 2 day choice window nothing is credited automatically.
        await refunds.AutoRefundDueAsync();
        Assert.Equal(0, await factory.QueryAsync(state => state.PointWallets
            .Where(x => x.OwnerUserId == request.MemberId).Select(x => x.AvailablePoints).SingleAsync()));

        await factory.QueryAsync(async state =>
        {
            var rental = await state.Set<CourtRental>().SingleAsync(x => x.CourtRentalId == checkout.ResourceHoldId);
            rental.CancelledAtUtc = DateTime.UtcNow.AddDays(-3);
            await state.SaveChangesAsync();
            return 0;
        });
        await refunds.AutoRefundDueAsync();
        await refunds.AutoRefundDueAsync();
        Assert.Equal(100, await factory.QueryAsync(state => state.PointWallets
            .Where(x => x.OwnerUserId == request.MemberId).Select(x => x.AvailablePoints).SingleAsync()));
    }

    [Fact]
    public async Task Incident_preview_quotes_the_refund_points_the_member_can_choose_after_resolve()
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

        var incidents = scope.ServiceProvider.GetRequiredService<IncidentService>();
        var incident = new IncidentRequest("Room", request.RoomId, request.StartUtc.UtcDateTime,
            request.EndUtc.UtcDateTime, "Court floor repair");

        var preview = await incidents.PreviewAsync(incident);
        var affected = Assert.Single(preview.Members);
        Assert.Equal(request.MemberId, affected.MemberId);
        Assert.Equal("CourtRental", affected.SourceType);
        Assert.Equal("RefundedAsPoints", affected.Outcome);
        Assert.Equal(100, affected.ExpectedRefundPoints);
        Assert.Equal(100, preview.ExpectedRefundPointsTotal);

        // Resolving only notifies; the offer equals the quote and the Member credits it by choosing points.
        await incidents.ResolveAsync(await IncidentTestRequests.ReviewAsync(incidents, incident), manager.UserId);
        Assert.Equal(0, await factory.QueryAsync(state => state.PointWallets
            .Where(x => x.OwnerUserId == request.MemberId).Select(x => x.AvailablePoints).SingleAsync()));
        var refunds = scope.ServiceProvider.GetRequiredService<ICenterCancellationRefundService>();
        var offer = Assert.Single(await refunds.ListMineAsync(request.MemberId));
        Assert.Equal(affected.ExpectedRefundPoints, offer.RefundPoints);
        // Resolving another overlapping incident must not bypass the Member's choice.
        var overlap = await Assert.ThrowsAsync<ConflictException>(async () =>
            await incidents.ResolveAsync(await IncidentTestRequests.ReviewAsync(incidents, incident), manager.UserId));
        Assert.Equal("incident_overlap", overlap.ErrorCode);
        Assert.Equal(0, await factory.QueryAsync(state => state.PointWallets
            .Where(x => x.OwnerUserId == request.MemberId).Select(x => x.AvailablePoints).SingleAsync()));
        await refunds.AutoRefundDueAsync();
        Assert.Equal(0, await factory.QueryAsync(state => state.PointWallets
            .Where(x => x.OwnerUserId == request.MemberId).Select(x => x.AvailablePoints).SingleAsync()));
        Assert.Equal(100, (await refunds.ChoosePointsAsync(request.MemberId, offer.InvoiceItemId)).PointsCredited);
        Assert.True((await refunds.ChoosePointsAsync(request.MemberId, offer.InvoiceItemId)).AlreadyApplied);
        Assert.Equal(100, await factory.QueryAsync(state => state.PointWallets
            .Where(x => x.OwnerUserId == request.MemberId).Select(x => x.AvailablePoints).SingleAsync()));
    }

    /// <summary>Member không có Membership Gym, chuyên môn hay hồ sơ nào: chỉ cần tài khoản hoạt động.</summary>
    private async Task<CourtRentalRequest> SetupAsync(bool active = true)
    {
        var member = await factory.SeedUserAsync(UserRole.Member, active ? UserStatus.Active : UserStatus.Deactivated);
        return await factory.QueryAsync(async db =>
        {
            // Sức chứa phòng không còn lọc lượt thuê: phòng 2 chỗ vẫn thuê được.
            var room = new Room { Name = "Rental test " + Guid.NewGuid(), Capacity = 2, RoomTypeId = 3, AllowRental = true };
            db.Rooms.Add(room);
            await db.SaveChangesAsync();
            db.RoomOpeningHours.AddRange(Enumerable.Range(0, 7).Select(day => new RoomOpeningHour
                { RoomId = room.RoomId, DayOfWeek = day, OpenTimeLocal = new(6, 0), CloseTimeLocal = new(22, 0) }));
            if (!await db.Set<CourtRate>().AnyAsync(x => x.RoomTypeId == 3))
                db.Set<CourtRate>().Add(new CourtRate { RoomTypeId = 3, SportId = 3,
                    DaysOfWeek = "MON,TUE,WED,THU,FRI,SAT,SUN", StartTimeLocal = new(6, 0),
                    EndTimeLocal = new(22, 0), PricePerHour = 100_000 });
            await db.SaveChangesAsync();
            // Cửa sổ thuê là hôm nay + 2 ngày tính từ mốc đổi ngày 06:00; ngày mai luôn nằm trong cửa sổ, kể cả khi test chạy trước 06:00.
            var start = VietnamTime.StartOfDayUtc(DateOnly.FromDateTime(VietnamTime.ToLocal(DateTime.UtcNow)).AddDays(1)).AddHours(10);
            return new CourtRentalRequest(member.UserId, 3, room.RoomId, start, start.AddHours(1));
        });
    }

    [Fact]
    public async Task Receptionist_can_book_a_court_for_the_selected_member_only()
    {
        var rental = await SetupAsync();
        var receptionist = await factory.SeedUserAsync(UserRole.Receptionist);
        var otherMember = await factory.SeedUserAsync(UserRole.Member);
        using var desk = factory.CreateApiClient(receptionist.UserId, UserRole.Receptionist);
        using var member = factory.CreateApiClient(otherMember.UserId, UserRole.Member);

        Assert.Equal(HttpStatusCode.OK, (await desk.GetAsync("/api/court-rentals/policy")).StatusCode);
        var localDate = DateOnly.FromDateTime(VietnamTime.ToLocal(rental.StartUtc.UtcDateTime));
        var calendar = await desk.GetAsync($"/api/court-rentals/calendar?sportId={rental.SportId}&date={localDate:yyyy-MM-dd}&targetMemberId={rental.MemberId}");
        Assert.Equal(HttpStatusCode.OK, calendar.StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await desk.GetAsync(
            $"/api/court-rentals/calendar?sportId={rental.SportId}&date={localDate:yyyy-MM-dd}")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await member.GetAsync(
            $"/api/court-rentals/calendar?sportId={rental.SportId}&date={localDate:yyyy-MM-dd}&targetMemberId={rental.MemberId}")).StatusCode);

        using var forged = new HttpRequestMessage(HttpMethod.Post, "/api/checkouts/court-rental")
        {
            Content = JsonContent.Create(new { rental.SportId, rental.RoomId, rental.StartUtc, rental.EndUtc,
                TargetMemberId = rental.MemberId })
        };
        forged.Headers.Add("Idempotency-Key", Guid.NewGuid().ToString("N"));
        Assert.Equal(HttpStatusCode.Forbidden, (await member.SendAsync(forged)).StatusCode);

        using var request = new HttpRequestMessage(HttpMethod.Post, "/api/checkouts/court-rental")
        {
            Content = JsonContent.Create(new { rental.SportId, rental.RoomId, rental.StartUtc, rental.EndUtc,
                TargetMemberId = rental.MemberId })
        };
        request.Headers.Add("Idempotency-Key", Guid.NewGuid().ToString("N"));
        var response = await desk.SendAsync(request);
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        var checkout = await response.Content.ReadFromJsonAsync<CheckoutResponse>();
        Assert.NotNull(checkout);
        Assert.Equal(rental.MemberId, checkout.BeneficiaryUserId);
        Assert.Equal(receptionist.UserId, checkout.InitiatorUserId);
        Assert.NotNull(checkout.ResourceHoldId);
        await factory.QueryAsync(async db =>
        {
            var saved = await db.Set<CourtRental>().SingleAsync(x => x.CourtRentalId == checkout.ResourceHoldId);
            Assert.Equal(rental.MemberId, saved.MemberId);
            return 0;
        });
    }

    private async Task<HttpResponseMessage> PostRentalAsync(HttpClient client, CourtRentalRequest rental, DateTimeOffset start, DateTimeOffset end,
        Guid? targetMemberId = null)
    {
        using var message = new HttpRequestMessage(HttpMethod.Post, "/api/checkouts/court-rental")
        {
            Content = JsonContent.Create(new { rental.SportId, rental.RoomId, StartUtc = start, EndUtc = end, TargetMemberId = targetMemberId })
        };
        message.Headers.Add("Idempotency-Key", Guid.NewGuid().ToString("N"));
        return await client.SendAsync(message);
    }

    [Fact]
    public async Task Rental_is_limited_to_06_00_22_00_for_both_member_and_receptionist()
    {
        var rental = await SetupAsync();
        var receptionist = await factory.SeedUserAsync(UserRole.Receptionist);
        using var member = factory.CreateApiClient(rental.MemberId, UserRole.Member);
        using var desk = factory.CreateApiClient(receptionist.UserId, UserRole.Receptionist);
        var day = VietnamTime.StartOfDayUtc(DateOnly.FromDateTime(VietnamTime.ToLocal(rental.StartUtc.UtcDateTime)));
        // 21:00-23:00 (kết thúc sau 22:00) và 05:00-06:00 (bắt đầu trước 06:00) đều bị từ chối.
        foreach (var (fromHour, toHour) in new[] { (21, 23), (5, 7) })
        {
            var start = new DateTimeOffset(day.AddHours(fromHour));
            var end = new DateTimeOffset(day.AddHours(toHour));
            var byMember = await PostRentalAsync(member, rental, start, end);
            Assert.Equal(HttpStatusCode.Conflict, byMember.StatusCode);
            Assert.Contains("court_outside_hours", await byMember.Content.ReadAsStringAsync());
            var byDesk = await PostRentalAsync(desk, rental, start, end, rental.MemberId);
            Assert.Equal(HttpStatusCode.Conflict, byDesk.StatusCode);
            Assert.Contains("court_outside_hours", await byDesk.Content.ReadAsStringAsync());
        }
        Assert.False(await factory.QueryAsync(db => db.Invoices.AnyAsync(x => x.MemberId == rental.MemberId)));
    }

    [Fact]
    public async Task Rental_beyond_today_plus_two_days_is_rejected_for_both_member_and_receptionist()
    {
        var rental = await SetupAsync();
        var receptionist = await factory.SeedUserAsync(UserRole.Receptionist);
        using var member = factory.CreateApiClient(rental.MemberId, UserRole.Member);
        using var desk = factory.CreateApiClient(receptionist.UserId, UserRole.Receptionist);
        var farDay = VietnamTime.StartOfDayUtc(DateOnly.FromDateTime(VietnamTime.ToLocal(DateTime.UtcNow)).AddDays(3));
        var start = new DateTimeOffset(farDay.AddHours(10));
        var end = start.AddHours(1);

        var byMember = await PostRentalAsync(member, rental, start, end);
        Assert.Equal(HttpStatusCode.Conflict, byMember.StatusCode);
        Assert.Contains("court_outside_window", await byMember.Content.ReadAsStringAsync());
        var byDesk = await PostRentalAsync(desk, rental, start, end, rental.MemberId);
        Assert.Equal(HttpStatusCode.Conflict, byDesk.StatusCode);
        Assert.Contains("court_outside_window", await byDesk.Content.ReadAsStringAsync());

        var policy = await member.GetFromJsonAsync<System.Text.Json.JsonElement>("/api/court-rentals/policy");
        Assert.Equal(2, policy.GetProperty("advanceDays").GetInt32());
        var calendar = await member.GetAsync($"/api/court-rentals/calendar?sportId={rental.SportId}&date={DateOnly.FromDateTime(VietnamTime.ToLocal(farDay.AddHours(10))):yyyy-MM-dd}");
        Assert.Equal(HttpStatusCode.BadRequest, calendar.StatusCode);
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
        var preview = await incidents.PreviewAsync(incident);
        Assert.True(preview.CanResolve);
        // The manager sees who is affected and what happens to them before confirming.
        var affected = Assert.Single(preview.Members);
        Assert.Equal(request.MemberId, affected.MemberId);
        Assert.Equal("CheckoutReleased", affected.Outcome);
        Assert.Null(affected.ExpectedRefundPoints);
        Assert.Equal(0, preview.ExpectedRefundPointsTotal);
        var incidentId = await incidents.ResolveAsync(await IncidentTestRequests.ReviewAsync(incidents, incident), manager.UserId);
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
