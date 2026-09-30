using System.Net;
using System.Net.Http.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SportHub.API.Persistence;
using SportHub.BuildingBlocks.Abstractions.Wallet;
using SportHub.Identity.Domain.Enums;
using SportHub.Membership.Domain.Entities;
using SportHub.Membership.Domain.Enums;
using SportHub.Identity.Domain.Entities;
using SportHub.Payment.Application.DTOs.Checkouts;
using SportHub.Payment.Domain.Enums;
using SportHub.Payment.Domain.Entities;
using SportHub.Payment.Application.Services;
using SportHub.Payment.VnPay;
using SportHub.Training.Application.DTOs.PtEntitlements;
using SportHub.Training.Domain.Entities;
using SportHub.Training.Domain.Enums;
using SportHub.Scheduling.Application.Commands;
using SportHub.Scheduling.Application.Interfaces;
using SportHub.Scheduling.Catalog.Domain;
using SportHub.Scheduling.Domain.Entities;
using SportHub.Scheduling.Domain.Enums;

namespace SportHub.Payment.Tests.Integration;

[Collection(nameof(PaymentApiCollection))]
public sealed class CheckoutFlowTests(PaymentApiFactory factory)
{
    private async Task<(Guid MemberId, Guid ReceptionistId, int PackageId)> SeedAsync()
    {
        var member = await factory.SeedUserAsync(UserRole.Member);
        var receptionist = await factory.SeedUserAsync(UserRole.Receptionist);
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SportHubDbContext>();
        var catalog = new MembershipPackage
        {
            Name = "Checkout " + Guid.NewGuid().ToString("N"), Price = 100_000m,
            DurationDays = 30, IsActive = true
        };
        db.MembershipPackages.Add(catalog);
        await db.SaveChangesAsync();
        await using var tx = await db.Database.BeginTransactionAsync();
        await scope.ServiceProvider.GetRequiredService<IPointWalletService>()
            .EarnAsync(new(member.UserId, 100, "TestCredit", Guid.NewGuid()));
        await tx.CommitAsync();
        return (member.UserId, receptionist.UserId, catalog.PackageId);
    }

    private async Task<CheckoutResponse> CreateAsync(HttpClient client, int packageId)
    {
        using var request = new HttpRequestMessage(HttpMethod.Post, "/api/checkouts/membership")
        {
            Content = JsonContent.Create(new { packageId })
        };
        request.Headers.Add("Idempotency-Key", Guid.NewGuid().ToString("N"));
        var response = await client.SendAsync(request);
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        return (await response.Content.ReadFromJsonAsync<CheckoutResponse>())!;
    }

    [Theory]
    [InlineData(0)]
    [InlineData(40)]
    [InlineData(100)]
    public async Task Payment_split_fulfills_once_with_mock_verified_pipeline(int points)
    {
        var context = await SeedAsync();
        using var member = factory.CreateApiClient(context.MemberId, UserRole.Member);
        using var receptionist = factory.CreateApiClient(context.ReceptionistId, UserRole.Receptionist);
        var checkout = await CreateAsync(member, context.PackageId);
        if (points > 0)
        {
            var select = await member.PostAsJsonAsync(
                $"/api/wallet/me/checkouts/{checkout.InvoiceId}/points", new { points });
            Assert.Equal(HttpStatusCode.OK, select.StatusCode);
        }
        var attemptResponse = await member.PostAsync($"/api/checkouts/{checkout.InvoiceId}/attempts", null);
        Assert.Equal(HttpStatusCode.OK, attemptResponse.StatusCode);
        var attempt = (await attemptResponse.Content.ReadFromJsonAsync<PaymentAttemptResponse>())!;
        if (points < 100)
        {
            Assert.Equal(100_000m - points * 1000m, attempt.CashAmount);
            Assert.NotEqual(Guid.Empty, attempt.PaymentAttemptId);
            var simulated = await receptionist.PostAsync(
                $"/api/dev/payments/{attempt.TransactionReference}/simulate", null);
            Assert.Equal(HttpStatusCode.OK, simulated.StatusCode);
        }
        else Assert.Equal(Guid.Empty, attempt.PaymentAttemptId);

        await factory.QueryAsync(async db =>
        {
            var invoice = await db.Invoices.SingleAsync(x => x.InvoiceId == checkout.InvoiceId);
            var package = await db.MemberPackages.SingleAsync(x => x.MemberPackageId == invoice.MemberPackageId);
            var wallet = await db.PointWallets.SingleAsync(x => x.OwnerUserId == context.MemberId);
            Assert.Equal(InvoiceStatus.Paid, invoice.Status);
            Assert.Equal(MemberPackageStatus.Active, package.Status);
            Assert.Equal(100 - points, wallet.AvailablePoints);
            Assert.Equal(0, wallet.HeldPoints);
            Assert.Equal(points < 100 ? 1 : 0, await db.Payments.CountAsync(x => x.InvoiceId == checkout.InvoiceId));
            Assert.Equal(points < 100 ? 1 : 0, await db.VerifiedGatewayEvents.CountAsync(x =>
                db.PaymentAttempts.Any(a => a.PaymentAttemptId == x.PaymentAttemptId
                    && a.InvoiceId == checkout.InvoiceId)));
            return 0;
        });
    }

    [Fact]
    public async Task New_checkout_cannot_be_marked_paid_by_legacy_manual_endpoint()
    {
        var context = await SeedAsync();
        using var member = factory.CreateApiClient(context.MemberId, UserRole.Member);
        using var receptionist = factory.CreateApiClient(context.ReceptionistId, UserRole.Receptionist);
        var checkout = await CreateAsync(member, context.PackageId);
        var response = await receptionist.PostAsJsonAsync($"/api/invoices/{checkout.InvoiceId}/payments",
            new { amount = 100_000m, method = "Cash" });
        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
    }

    [Fact]
    public async Task Duplicate_callback_is_idempotent_but_second_bank_capture_is_compensated()
    {
        var context = await SeedAsync();
        using var member = factory.CreateApiClient(context.MemberId, UserRole.Member);
        var checkout = await CreateAsync(member, context.PackageId);
        var started = await member.PostAsync($"/api/checkouts/{checkout.InvoiceId}/attempts", null);
        var attempt = (await started.Content.ReadFromJsonAsync<PaymentAttemptResponse>())!;
        var mock = Assert.IsType<MockPaymentGateway>(factory.Services.GetRequiredService<IPaymentGateway>());
        var first = mock.BuildCallback(attempt.TransactionReference, attempt.CashAmount, true);
        var reportDay = DateOnly.FromDateTime(SportHub.BuildingBlocks.SharedKernel.Time.VietnamTime.ToLocal(DateTime.UtcNow));
        using var reportScope = factory.Services.CreateScope();
        var reports = reportScope.ServiceProvider.GetRequiredService<SportHub.Payment.Application.Interfaces.IRevenueReportService>();
        var before = await reports.GetAsync(reportDay, reportDay);
        async Task Receive(IReadOnlyDictionary<string, string> callback)
        {
            using var scope = factory.Services.CreateScope();
            await scope.ServiceProvider.GetRequiredService<PaymentReconciliationService>()
                .ReceiveCallbackAsync(callback, default);
        }
        await Task.WhenAll(Receive(first), Receive(first));
        await Receive(first);
        await Receive(mock.BuildCallback(attempt.TransactionReference, attempt.CashAmount, true));
        var after = await reports.GetAsync(reportDay, reportDay);
        Assert.Equal(200_000m, after.TotalCollected - before.TotalCollected);
        Assert.Equal(100_000m, after.ReconciliationCashCollected - before.ReconciliationCashCollected);
        Assert.Equal(100, after.PointsIssued - before.PointsIssued);
        Assert.Equal(after.TotalCollected, after.BySource.Sum(x => x.CashCollected));
        Assert.Equal(after.TotalCollected, after.BySportAndSource.Sum(x => x.CashCollected));
        await factory.QueryAsync(async db =>
        {
            Assert.Equal(1, await db.Payments.CountAsync(x => x.InvoiceId == checkout.InvoiceId
                && x.Status == PaymentStatus.Success));
            Assert.Equal(2, await db.VerifiedGatewayEvents.CountAsync(x => db.PaymentAttempts
                .Any(a => a.PaymentAttemptId == x.PaymentAttemptId && a.InvoiceId == checkout.InvoiceId)));
            Assert.Equal(200, await db.PointWallets.Where(x => x.OwnerUserId == context.MemberId)
                .Select(x => x.AvailablePoints).SingleAsync());
            return 0;
        });
    }

    [Fact]
    public async Task Late_capture_after_points_release_compensates_cash_without_spending_released_points()
    {
        var context = await SeedAsync();
        using var member = factory.CreateApiClient(context.MemberId, UserRole.Member);
        var checkout = await CreateAsync(member, context.PackageId);
        Assert.Equal(HttpStatusCode.OK, (await member.PostAsJsonAsync(
            $"/api/wallet/me/checkouts/{checkout.InvoiceId}/points", new { points = 40 })).StatusCode);
        var started = await member.PostAsync($"/api/checkouts/{checkout.InvoiceId}/attempts", null);
        var attempt = (await started.Content.ReadFromJsonAsync<PaymentAttemptResponse>())!;
        await factory.QueryAsync(async db =>
        {
            await db.Invoices.Where(x => x.InvoiceId == checkout.InvoiceId)
                .ExecuteUpdateAsync(s => s.SetProperty(x => x.HoldExpiresAtUtc, DateTime.UtcNow.AddMinutes(-1)));
            await db.CheckoutSessions.Where(x => x.CheckoutSessionId == db.Invoices
                    .Where(i => i.InvoiceId == checkout.InvoiceId).Select(i => i.CheckoutCycleId).Single())
                .ExecuteUpdateAsync(s => s.SetProperty(x => x.ExpiresAtUtc, DateTime.UtcNow.AddMinutes(-1)));
            return 0;
        });
        using (var scope = factory.Services.CreateScope())
            Assert.True(await scope.ServiceProvider.GetRequiredService<CheckoutExpiryService>()
                .ExpireDueAsync(default) >= 1);
        var mock = Assert.IsType<MockPaymentGateway>(factory.Services.GetRequiredService<IPaymentGateway>());
        using (var scope = factory.Services.CreateScope())
            await scope.ServiceProvider.GetRequiredService<PaymentReconciliationService>()
                .ReceiveCallbackAsync(mock.BuildCallback(attempt.TransactionReference, attempt.CashAmount, true), default);
        await factory.QueryAsync(async db =>
        {
            var invoice = await db.Invoices.SingleAsync(x => x.InvoiceId == checkout.InvoiceId);
            Assert.Equal(InvoiceStatus.PaidAfterReconciliation, invoice.Status);
            Assert.Equal("VnPayCompensated", invoice.PaidVia);
            Assert.Equal(MemberPackageStatus.Cancelled, await db.MemberPackages
                .Where(x => x.MemberPackageId == invoice.MemberPackageId).Select(x => x.Status).SingleAsync());
            Assert.Equal(160, await db.PointWallets.Where(x => x.OwnerUserId == context.MemberId)
                .Select(x => x.AvailablePoints).SingleAsync());
            Assert.Equal(0, await db.PointWallets.Where(x => x.OwnerUserId == context.MemberId)
                .Select(x => x.HeldPoints).SingleAsync());
            Assert.Equal(0, await db.Payments.CountAsync(x => x.InvoiceId == checkout.InvoiceId));
            return 0;
        });
    }

    [Fact]
    public async Task Odd_verified_capture_releases_hold_and_requires_manual_compensation()
    {
        var context = await SeedAsync();
        using var member = factory.CreateApiClient(context.MemberId, UserRole.Member);
        var checkout = await CreateAsync(member, context.PackageId);
        Assert.Equal(HttpStatusCode.OK, (await member.PostAsJsonAsync(
            $"/api/wallet/me/checkouts/{checkout.InvoiceId}/points", new { points = 40 })).StatusCode);
        var started = await member.PostAsync($"/api/checkouts/{checkout.InvoiceId}/attempts", null);
        var attempt = (await started.Content.ReadFromJsonAsync<PaymentAttemptResponse>())!;
        // An independently verified QueryDR response can disagree with the original
        // attempt amount; IPN rejects that mismatch before writing the inbox.
        await factory.QueryAsync(async db =>
        {
            db.VerifiedGatewayEvents.Add(new VerifiedGatewayEvent
            {
                VerifiedGatewayEventId = Guid.NewGuid(), PaymentAttemptId = attempt.PaymentAttemptId,
                Provider = "VNPay", ProviderTransactionId = Guid.NewGuid().ToString("N"),
                TransactionReference = attempt.TransactionReference, Amount = 60_001m,
                ResponseCode = "00", TransactionStatus = "00",
                ProviderPaidAtUtc = DateTime.UtcNow, VerifiedAtUtc = DateTime.UtcNow,
                ProcessingStatus = "Pending"
            });
            await db.SaveChangesAsync();
            return 0;
        });
        var proofId = await factory.QueryAsync(db => db.VerifiedGatewayEvents
            .Where(x => x.TransactionReference == attempt.TransactionReference)
            .Select(x => x.VerifiedGatewayEventId).SingleAsync());
        using (var scope = factory.Services.CreateScope())
            await scope.ServiceProvider.GetRequiredService<PaymentReconciliationService>()
                .ProcessAsync(proofId, default);
        await factory.QueryAsync(async db =>
        {
            var invoice = await db.Invoices.SingleAsync(x => x.InvoiceId == checkout.InvoiceId);
            var proof = await db.VerifiedGatewayEvents.SingleAsync(x => x.TransactionReference == attempt.TransactionReference);
            var wallet = await db.PointWallets.SingleAsync(x => x.OwnerUserId == context.MemberId);
            Assert.Equal(InvoiceStatus.PaidAfterReconciliation, invoice.Status);
            Assert.True(invoice.ReconciliationRequired);
            Assert.Equal("VnPayManualCompensation", invoice.PaidVia);
            Assert.Equal("ManualCompensationRequired", proof.ProcessingStatus);
            Assert.Equal(100, wallet.AvailablePoints);
            Assert.Equal(0, wallet.HeldPoints);
            Assert.Equal(0, await db.Payments.CountAsync(x => x.InvoiceId == checkout.InvoiceId));
            return 0;
        });
    }

    [Fact]
    public async Task Pt_price_change_requires_new_quote_and_verified_payment_activates_entitlement()
    {
        var context = await SeedAsync();
        var coach = await factory.SeedUserAsync(UserRole.Coach);
        var manager = await factory.SeedUserAsync(UserRole.CenterManager);
        Guid membershipId;
        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<SportHubDbContext>();
            db.CoachProfiles.Add(new CoachProfile { UserId = coach.UserId });
            db.UserSportSpecialties.Add(new UserSportSpecialty { UserId = coach.UserId, SportId = 2 });
            var start = DateOnly.FromDateTime(DateTime.UtcNow).AddDays(-1);
            var membership = new MemberPackage
            {
                MemberPackageId = Guid.NewGuid(), MemberId = context.MemberId,
                PackageId = context.PackageId, StartDate = start,
                EndDate = start.AddMonths(1).AddDays(-1), Status = MemberPackageStatus.Active
            };
            db.MemberPackages.Add(membership);
            await db.SaveChangesAsync();
            membershipId = membership.MemberPackageId;
        }
        using var member = factory.CreateApiClient(context.MemberId, UserRole.Member);
        using var managerClient = factory.CreateApiClient(manager.UserId, UserRole.CenterManager);
        using var counter = factory.CreateApiClient(context.ReceptionistId, UserRole.Receptionist);
        var quoteRequest = new { memberPackageId = membershipId, coachId = coach.UserId, frequencyPerWeek = 1 };
        var quoteResponse = await member.PostAsJsonAsync("/api/checkouts/pt/quote", quoteRequest);
        Assert.Equal(HttpStatusCode.OK, quoteResponse.StatusCode);
        var quote = (await quoteResponse.Content.ReadFromJsonAsync<PtPurchaseQuoteResponse>())!;
        Assert.Equal(4, quote.TotalQuota);
        Assert.Equal(800_000m, quote.TotalPrice);
        var update = await managerClient.PutAsJsonAsync("/api/manager/pt-pricing", new { value = "300000" });
        Assert.Equal(HttpStatusCode.OK, update.StatusCode);

        async Task<HttpResponseMessage> Checkout(string version)
        {
            using var request = new HttpRequestMessage(HttpMethod.Post, "/api/checkouts/pt")
            {
                Content = JsonContent.Create(new { memberPackageId = membershipId, coachId = coach.UserId,
                    frequencyPerWeek = 1, priceVersion = version })
            };
            request.Headers.Add("Idempotency-Key", Guid.NewGuid().ToString("N"));
            return await member.SendAsync(request);
        }
        Assert.Equal(HttpStatusCode.Conflict, (await Checkout(quote.PriceVersion)).StatusCode);
        var current = (await (await member.PostAsJsonAsync("/api/checkouts/pt/quote", quoteRequest))
            .Content.ReadFromJsonAsync<PtPurchaseQuoteResponse>())!;
        Assert.Equal(1_200_000m, current.TotalPrice);
        var created = await Checkout(current.PriceVersion);
        Assert.Equal(HttpStatusCode.Created, created.StatusCode);
        var checkout = (await created.Content.ReadFromJsonAsync<CheckoutResponse>())!;
        var attempt = (await (await member.PostAsync($"/api/checkouts/{checkout.InvoiceId}/attempts", null))
            .Content.ReadFromJsonAsync<PaymentAttemptResponse>())!;
        Assert.Equal(HttpStatusCode.OK, (await counter.PostAsync(
            $"/api/dev/payments/{attempt.TransactionReference}/simulate", null)).StatusCode);
        await factory.QueryAsync(async db =>
        {
            var item = await db.InvoiceItems.SingleAsync(x => x.InvoiceId == checkout.InvoiceId);
            Assert.Equal(300_000m, item.UnitPrice);
            Assert.Equal(4, item.Quantity);
            Assert.Equal(PtEntitlementStatus.Active, await db.PtEntitlements
                .Where(x => x.EntitlementId == item.RelatedEntityId).Select(x => x.Status).SingleAsync());
            return 0;
        });
    }

    [Fact]
    public async Task Fulfillment_failure_keeps_verified_event_and_retries_without_partial_payment()
    {
        var context = await SeedAsync();
        using var member = factory.CreateApiClient(context.MemberId, UserRole.Member);
        var checkout = await CreateAsync(member, context.PackageId);
        Assert.Equal(HttpStatusCode.OK, (await member.PostAsJsonAsync(
            $"/api/wallet/me/checkouts/{checkout.InvoiceId}/points", new { points = 40 })).StatusCode);
        var attempt = (await (await member.PostAsync($"/api/checkouts/{checkout.InvoiceId}/attempts", null))
            .Content.ReadFromJsonAsync<PaymentAttemptResponse>())!;
        var conflictingId = Guid.NewGuid();
        await factory.QueryAsync(async db =>
        {
            var start = DateOnly.FromDateTime(DateTime.UtcNow);
            db.MemberPackages.Add(new MemberPackage
            {
                MemberPackageId = conflictingId, MemberId = context.MemberId,
                PackageId = context.PackageId, StartDate = start,
                EndDate = start.AddMonths(1).AddDays(-1), Status = MemberPackageStatus.Active
            });
            await db.SaveChangesAsync();
            return 0;
        });
        var mock = Assert.IsType<MockPaymentGateway>(factory.Services.GetRequiredService<IPaymentGateway>());
        using (var scope = factory.Services.CreateScope())
            await scope.ServiceProvider.GetRequiredService<PaymentReconciliationService>()
                .ReceiveCallbackAsync(mock.BuildCallback(attempt.TransactionReference, attempt.CashAmount, true), default);
        await factory.QueryAsync(async db =>
        {
            Assert.True(await db.Invoices.Where(x => x.InvoiceId == checkout.InvoiceId)
                .Select(x => x.ReconciliationRequired).SingleAsync());
            Assert.Equal(0, await db.Payments.CountAsync(x => x.InvoiceId == checkout.InvoiceId));
            Assert.Equal(40, await db.PointWallets.Where(x => x.OwnerUserId == context.MemberId)
                .Select(x => x.HeldPoints).SingleAsync());
            Assert.Equal("ReconciliationRequired", await db.VerifiedGatewayEvents
                .Where(x => db.PaymentAttempts.Any(a => a.PaymentAttemptId == x.PaymentAttemptId
                    && a.InvoiceId == checkout.InvoiceId)).Select(x => x.ProcessingStatus).SingleAsync());
            await db.MemberPackages.Where(x => x.MemberPackageId == conflictingId).ExecuteDeleteAsync();
            return 0;
        });
        using (var scope = factory.Services.CreateScope())
            await scope.ServiceProvider.GetRequiredService<PaymentReconciliationService>()
                .RetryPendingAsync(default);
        await factory.QueryAsync(async db =>
        {
            Assert.Equal(InvoiceStatus.Paid, await db.Invoices.Where(x => x.InvoiceId == checkout.InvoiceId)
                .Select(x => x.Status).SingleAsync());
            Assert.Equal(1, await db.Payments.CountAsync(x => x.InvoiceId == checkout.InvoiceId));
            Assert.Equal(0, await db.PointWallets.Where(x => x.OwnerUserId == context.MemberId)
                .Select(x => x.HeldPoints).SingleAsync());
            return 0;
        });
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task Class_checkout_reserves_one_seat_and_converts_only_after_verified_payment(bool late)
    {
        var context = await SeedAsync();
        var manager = await factory.SeedUserAsync(UserRole.CenterManager);
        var coach = await factory.SeedUserAsync(UserRole.Coach);
        int classId;
        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<SportHubDbContext>();
            var room = new Room { Name = "Checkout-room-" + Guid.NewGuid().ToString("N"),
                Capacity = 5, RoomTypeId = 3 };
            db.Rooms.Add(room);
            await db.SaveChangesAsync();
            db.RoomOpeningHours.AddRange(Enumerable.Range(0, 7).Select(day => new RoomOpeningHour
            { RoomId = room.RoomId, DayOfWeek = day, OpenTimeLocal = new(6, 0), CloseTimeLocal = new(22, 0) }));
            db.UserSportSpecialties.Add(new UserSportSpecialty { UserId = coach.UserId, SportId = 3 });
            db.CoachProfiles.Add(new CoachProfile { UserId = coach.UserId });
            await db.SaveChangesAsync();
            var start = new DateOnly(2032, 3, 1);
            var created = await scope.ServiceProvider.GetRequiredService<IClassService>().CreateAsync(
                new SaveClassRequest
                {
                    Code = "CHECKOUT-" + Guid.NewGuid().ToString("N"), Name = "Checkout class",
                    SportId = 3, CoachId = coach.UserId, DefaultRoomId = room.RoomId,
                    StartDate = start, NumSessions = 3, Capacity = 1, Price = 100_000m,
                    CostAmount = 0,
                    ScheduleRules = [new() { DayOfWeek = (int)start.DayOfWeek,
                        StartTimeLocal = "09:00" }]
                }, manager.UserId);
            await scope.ServiceProvider.GetRequiredService<IClassService>()
                .PublishAsync(created.ClassId, new(), manager.UserId);
            classId = created.ClassId;
        }
        using var member = factory.CreateApiClient(context.MemberId, UserRole.Member);
        async Task<HttpResponseMessage> Create(string key)
        {
            using var request = new HttpRequestMessage(HttpMethod.Post, "/api/checkouts/class")
            { Content = JsonContent.Create(new { classId }) };
            request.Headers.Add("Idempotency-Key", key);
            return await member.SendAsync(request);
        }
        var key = Guid.NewGuid().ToString("N");
        var first = await Create(key);
        Assert.Equal(HttpStatusCode.Created, first.StatusCode);
        var checkout = (await first.Content.ReadFromJsonAsync<CheckoutResponse>())!;
        Assert.Equal(checkout.InvoiceId, (await (await Create(key)).Content
            .ReadFromJsonAsync<CheckoutResponse>())!.InvoiceId);
        Assert.Equal(HttpStatusCode.Conflict, (await Create(Guid.NewGuid().ToString("N"))).StatusCode);
        Assert.Equal(0, await factory.QueryAsync(db => db.Enrollments.CountAsync(x =>
            x.MemberId == context.MemberId && x.ClassId == classId)));
        var attempt = (await (await member.PostAsync($"/api/checkouts/{checkout.InvoiceId}/attempts", null))
            .Content.ReadFromJsonAsync<PaymentAttemptResponse>())!;
        if (late)
        {
            await factory.QueryAsync(async db =>
            {
                await db.Invoices.Where(x => x.InvoiceId == checkout.InvoiceId)
                    .ExecuteUpdateAsync(s => s.SetProperty(x => x.HoldExpiresAtUtc, DateTime.UtcNow.AddMinutes(-1)));
                await db.CheckoutSessions.Where(x => x.CheckoutSessionId == checkout.CheckoutSessionId)
                    .ExecuteUpdateAsync(s => s.SetProperty(x => x.ExpiresAtUtc, DateTime.UtcNow.AddMinutes(-1)));
                return 0;
            });
            using var scope = factory.Services.CreateScope();
            await scope.ServiceProvider.GetRequiredService<CheckoutExpiryService>().ExpireDueAsync(default);
        }
        using var receptionist = factory.CreateApiClient(context.ReceptionistId, UserRole.Receptionist);
        Assert.Equal(HttpStatusCode.OK, (await receptionist.PostAsync(
            $"/api/dev/payments/{attempt.TransactionReference}/simulate", null)).StatusCode);
        await factory.QueryAsync(async db =>
        {
            Assert.Equal(1, await db.Enrollments.CountAsync(x => x.MemberId == context.MemberId
                && x.ClassId == classId && x.Status == EnrollmentStatus.Confirmed));
            Assert.Equal(1, await db.Classes.Where(x => x.ClassId == classId)
                .Select(x => x.ReservedCount).SingleAsync());
            return 0;
        });
    }

    [Fact]
    public async Task Retry_after_expiry_creates_new_invoice_and_never_reuses_released_point_hold()
    {
        var context = await SeedAsync();
        using var member = factory.CreateApiClient(context.MemberId, UserRole.Member);
        var old = await CreateAsync(member, context.PackageId);
        Assert.Equal(HttpStatusCode.OK, (await member.PostAsJsonAsync(
            $"/api/wallet/me/checkouts/{old.InvoiceId}/points", new { points = 40 })).StatusCode);
        var oldCycle = await factory.QueryAsync(db => db.Invoices.Where(x => x.InvoiceId == old.InvoiceId)
            .Select(x => x.CheckoutCycleId).SingleAsync());
        await factory.QueryAsync(async db =>
        {
            await db.Invoices.Where(x => x.InvoiceId == old.InvoiceId)
                .ExecuteUpdateAsync(s => s.SetProperty(x => x.HoldExpiresAtUtc, DateTime.UtcNow.AddMinutes(-1)));
            await db.CheckoutSessions.Where(x => x.CheckoutSessionId == oldCycle)
                .ExecuteUpdateAsync(s => s.SetProperty(x => x.ExpiresAtUtc, DateTime.UtcNow.AddMinutes(-1)));
            return 0;
        });
        using (var scope = factory.Services.CreateScope())
            await scope.ServiceProvider.GetRequiredService<CheckoutExpiryService>().ExpireDueAsync(default);
        var key = Guid.NewGuid().ToString("N");
        async Task<CheckoutResponse> Retry()
        {
            using var request = new HttpRequestMessage(HttpMethod.Post, $"/api/checkouts/{old.InvoiceId}/retry")
            { Content = JsonContent.Create(new { }) };
            request.Headers.Add("Idempotency-Key", key);
            var response = await member.SendAsync(request);
            Assert.Equal(HttpStatusCode.Created, response.StatusCode);
            return (await response.Content.ReadFromJsonAsync<CheckoutResponse>())!;
        }
        var renewed = await Retry();
        Assert.NotEqual(old.InvoiceId, renewed.InvoiceId);
        Assert.NotEqual(oldCycle, renewed.CheckoutSessionId);
        Assert.Equal(renewed.InvoiceId, (await Retry()).InvoiceId);
        Assert.Equal(100, await factory.QueryAsync(db => db.PointWallets
            .Where(x => x.OwnerUserId == context.MemberId).Select(x => x.AvailablePoints).SingleAsync()));
        Assert.Equal(0, await factory.QueryAsync(db => db.PointWallets
            .Where(x => x.OwnerUserId == context.MemberId).Select(x => x.HeldPoints).SingleAsync()));
    }
}
