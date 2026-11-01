using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Logging.Abstractions;
using SportHub.BuildingBlocks.Abstractions.Membership;
using SportHub.BuildingBlocks.Abstractions.Persistence;
using SportHub.BuildingBlocks.Abstractions.Scheduling;
using SportHub.BuildingBlocks.SharedKernel.Time;
using SportHub.BuildingBlocks.Infrastructure.Authentication;
using SportHub.Scheduling.Catalog.Domain;
using SportHub.Scheduling.Domain.Entities;
using SportHub.Identity.Domain.Enums;
using SportHub.Membership.Domain;
using SportHub.Membership.Domain.Entities;
using SportHub.Membership.Domain.Enums;
using SportHub.Membership.Domain.Rules;
using SportHub.Notification.Domain.Enums;
using SportHub.Payment.Application.DTOs.Checkouts;
using SportHub.Payment.Application.Services;
using SportHub.Payment.Domain.Entities;
using SportHub.Payment.Domain.Enums;

namespace SportHub.Payment.Tests.Integration;

[Collection(nameof(PaymentApiCollection))]
public sealed class GymDayPassTests(PaymentApiFactory factory)
{
    [Theory]
    [InlineData(5, 59, false, false)]
    [InlineData(6, 0, true, false)]
    [InlineData(21, 59, true, true)]
    [InlineData(22, 0, false, false)]
    public async Task Day_pass_checkout_respects_sale_window_and_closing_notice(
        int hour, int minute, bool canBuy, bool closingSoon)
    {
        var now = TodayAtLocalHour(hour).AddMinutes(minute);
        using var app = AtTime(now);
        var member = await factory.SeedUserAsync(UserRole.Member);
        using var buyer = Client(app, member.UserId, UserRole.Member);
        using var request = new HttpRequestMessage(HttpMethod.Post, "/api/checkouts/membership")
        {
            Content = JsonContent.Create(new { packageId = DayPass.PackageId })
        };
        request.Headers.Add("Idempotency-Key", Guid.NewGuid().ToString("N"));
        var response = await buyer.SendAsync(request);
        if (!canBuy)
        {
            Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
            Assert.Contains("day_pass_outside_hours", await response.Content.ReadAsStringAsync());
            return;
        }
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        var checkout = (await response.Content.ReadFromJsonAsync<CheckoutResponse>())!;
        Assert.Equal(closingSoon, checkout.ClosingSoon);
        Assert.Equal(DayPassClock.ClosesAtUtc(now), checkout.ClosesAtUtc);
    }

    [Fact]
    public async Task Day_pass_paid_at_2203_after_2158_checkout_is_unactivated()
    {
        var clock = new FixedClock(TodayAtLocalHour(21).AddMinutes(58));
        using var app = AtTime(clock);
        var member = await factory.SeedUserAsync(UserRole.Member);
        using var buyer = Client(app, member.UserId, UserRole.Member);
        using var request = new HttpRequestMessage(HttpMethod.Post, "/api/checkouts/membership")
        {
            Content = JsonContent.Create(new { packageId = DayPass.PackageId })
        };
        request.Headers.Add("Idempotency-Key", Guid.NewGuid().ToString("N"));
        var created = await buyer.SendAsync(request);
        Assert.Equal(HttpStatusCode.Created, created.StatusCode);
        var checkout = (await created.Content.ReadFromJsonAsync<CheckoutResponse>())!;
        Assert.True(checkout.ClosingSoon);
        var attemptResponse = await buyer.PostAsync($"/api/checkouts/{checkout.InvoiceId}/attempts", null);
        Assert.Equal(HttpStatusCode.OK, attemptResponse.StatusCode);
        var attempt = (await attemptResponse.Content.ReadFromJsonAsync<PaymentAttemptResponse>())!;

        clock.UtcNow = TodayAtLocalHour(22).AddMinutes(3);
        var proofId = Guid.NewGuid();
        await factory.QueryAsync(async db =>
        {
            db.VerifiedGatewayEvents.Add(new VerifiedGatewayEvent
            {
                VerifiedGatewayEventId = proofId, PaymentAttemptId = attempt.PaymentAttemptId,
                Provider = "VNPay", ProviderTransactionId = Guid.NewGuid().ToString("N"),
                TransactionReference = attempt.TransactionReference, Amount = attempt.CashAmount,
                ResponseCode = "00", TransactionStatus = "00", ProviderPaidAtUtc = clock.UtcNow,
                VerifiedAtUtc = clock.UtcNow, ProcessingStatus = "Pending"
            });
            await db.SaveChangesAsync();
            return 0;
        });
        using (var scope = app.Services.CreateScope())
            await scope.ServiceProvider.GetRequiredService<PaymentReconciliationService>()
                .ProcessAsync(proofId, default);

        await factory.QueryAsync(async db =>
        {
            var invoice = await db.Invoices.SingleAsync(i => i.InvoiceId == checkout.InvoiceId);
            Assert.Equal(InvoiceStatus.PaidAfterReconciliation, invoice.Status);
            Assert.True(invoice.ReconciliationRequired);
            Assert.Equal(MemberPackageStatus.Cancelled, await db.MemberPackages
                .Where(p => p.MemberPackageId == invoice.MemberPackageId)
                .Select(p => p.Status).SingleAsync());
            return 0;
        });
    }

    [Fact]
    public async Task Paid_day_pass_expires_at_22_today_even_when_member_has_a_long_membership()
    {
        var testNow = TodayAtLocalHour(14);
        using var app = AtTime(testNow);
        var member = await factory.SeedUserAsync(UserRole.Member);
        var today = DateOnly.FromDateTime(DateTime.UtcNow.AddHours(7));

        await factory.QueryAsync(async db =>
        {
            var longPlan = new MembershipPackage
            {
                Name = "Long Gym " + Guid.NewGuid().ToString("N"), Price = 600_000m,
                DurationDays = 30, IsActive = true
            };
            db.MembershipPackages.Add(longPlan);
            await db.SaveChangesAsync();
            db.MemberPackages.Add(new MemberPackage
            {
                MemberPackageId = Guid.NewGuid(), MemberId = member.UserId,
                PackageId = longPlan.PackageId, Status = MemberPackageStatus.Active,
                StartDate = today, EndDate = today.AddDays(29)
            });
            await db.SaveChangesAsync();
            return 0;
        });

        using var buyer = Client(app, member.UserId, UserRole.Member);
        using var request = new HttpRequestMessage(HttpMethod.Post, "/api/checkouts/membership")
        {
            Content = JsonContent.Create(new { packageId = DayPass.PackageId })
        };
        request.Headers.Add("Idempotency-Key", Guid.NewGuid().ToString("N"));
        var created = await buyer.SendAsync(request);
        Assert.Equal(HttpStatusCode.Created, created.StatusCode);
        var checkout = (await created.Content.ReadFromJsonAsync<CheckoutResponse>())!;
        Assert.Equal(DayPass.PriceVnd, checkout.TotalAmount);
        Assert.True(checkout.IsDayPass);
        var restored = await buyer.GetFromJsonAsync<CheckoutResponse>($"/api/checkouts/{checkout.InvoiceId}");
        Assert.True(restored!.IsDayPass);


        var attemptResponse = await buyer.PostAsync($"/api/checkouts/{checkout.InvoiceId}/attempts", null);
        Assert.Equal(HttpStatusCode.OK, attemptResponse.StatusCode);
        var attempt = (await attemptResponse.Content.ReadFromJsonAsync<PaymentAttemptResponse>())!;
        var proofId = Guid.NewGuid();
        await factory.QueryAsync(async db =>
        {
            db.VerifiedGatewayEvents.Add(new VerifiedGatewayEvent
            {
                VerifiedGatewayEventId = proofId, PaymentAttemptId = attempt.PaymentAttemptId,
                Provider = "VNPay", ProviderTransactionId = Guid.NewGuid().ToString("N"),
                TransactionReference = attempt.TransactionReference, Amount = attempt.CashAmount,
                ResponseCode = "00", TransactionStatus = "00", ProviderPaidAtUtc = testNow,
                VerifiedAtUtc = testNow, ProcessingStatus = "Pending"
            });
            await db.SaveChangesAsync();
            return 0;
        });
        using (var scope = app.Services.CreateScope())
            await scope.ServiceProvider.GetRequiredService<PaymentReconciliationService>()
                .ProcessAsync(proofId, default);

        await factory.QueryAsync(async db =>
        {
            var pass = await db.MemberPackages.SingleAsync(x => x.MemberId == member.UserId
                && x.PackageId == DayPass.PackageId);
            Assert.Equal(MemberPackageStatus.Active, pass.Status);
            Assert.Equal(today, pass.StartDate);
            Assert.Equal(today, pass.EndDate);
            Assert.Equal(DayPassClock.ClosesAtUtc(testNow), pass.ExpiresAtUtc);
            // Member receives the 22:00 expiry and check-in instructions in app and by email.
            var notices = await db.Notifications.Where(n => n.UserId == member.UserId && n.SourceEntityId == pass.MemberPackageId).ToListAsync();
            Assert.True(notices.Count >= 2);
            Assert.Contains(notices, n => n.Message.Contains("22:00"));
            return 0;
        });
    }

    [Fact]
    public async Task Manager_can_change_day_pass_price_but_not_duration_or_availability()
    {
        var manager = await factory.SeedUserAsync(UserRole.CenterManager);
        using var client = factory.CreateApiClient(manager.UserId, UserRole.CenterManager);
        var update = await client.PutAsJsonAsync($"/api/membership-packages/{DayPass.PackageId}", new
        {
            name = DayPass.Name, price = 60_000, durationDays = 1
        });
        Assert.Equal(HttpStatusCode.OK, update.StatusCode);
        Assert.Equal(60_000m, await factory.QueryAsync(db => db.MembershipPackages
            .Where(x => x.PackageId == DayPass.PackageId).Select(x => x.Price).SingleAsync()));
        var longer = await client.PutAsJsonAsync($"/api/membership-packages/{DayPass.PackageId}", new
        {
            name = DayPass.Name, price = 60_000, durationDays = 2
        });
        Assert.Equal(HttpStatusCode.Conflict, longer.StatusCode);
        await client.PutAsJsonAsync($"/api/membership-packages/{DayPass.PackageId}", new
        {
            name = DayPass.Name, price = (int)DayPass.PriceVnd, durationDays = 1
        });
        Assert.Equal(HttpStatusCode.Conflict,
            (await client.PostAsync($"/api/membership-packages/{DayPass.PackageId}/discontinue", null)).StatusCode);
    }

    private static async Task<MemberPackage> SeedActiveDayPassAsync(PaymentApiFactory factory, Guid memberId, DateOnly today)
        => await factory.QueryAsync(async db =>
        {
            var pass = new MemberPackage
            {
                MemberPackageId = Guid.NewGuid(), MemberId = memberId, PackageId = DayPass.PackageId,
                Status = MemberPackageStatus.Active, StartDate = today, EndDate = today
            };
            db.MemberPackages.Add(pass);
            await db.SaveChangesAsync();
            return pass;
        });

    [Fact]
    public async Task Gym_closure_extension_does_not_stretch_a_one_day_pass()
    {
        var member = await factory.SeedUserAsync(UserRole.Member);
        var today = DateOnly.FromDateTime(DateTime.UtcNow.AddHours(7));
        var pass = await SeedActiveDayPassAsync(factory, member.UserId, today);

        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<ISportHubDbContext>();
            var extension = scope.ServiceProvider.GetRequiredService<IMembershipClosureExtension>();
            await using var tx = await db.Database.BeginTransactionAsync();
            var extended = await extension.ExtendActiveAsync(3, today);
            Assert.DoesNotContain(extended, e => e.MemberId == member.UserId);
            await tx.RollbackAsync();
        }

        await factory.QueryAsync(async db =>
        {
            Assert.Equal(today, (await db.MemberPackages.SingleAsync(x => x.MemberPackageId == pass.MemberPackageId)).EndDate);
            return 0;
        });
    }

    [Fact]
    public async Task Day_pass_expiry_job_does_not_send_a_renewal_reminder()
    {
        var member = await factory.SeedUserAsync(UserRole.Member);
        var today = DateOnly.FromDateTime(DateTime.UtcNow.AddHours(7));
        var pass = await SeedActiveDayPassAsync(factory, member.UserId, today);

        var job = new SportHub.API.Jobs.MemberPackageExpiryJob(factory.Services, NullLogger<SportHub.API.Jobs.MemberPackageExpiryJob>.Instance);
        var run = typeof(SportHub.API.Jobs.MemberPackageExpiryJob)
            .GetMethod("RunOnceAsync", System.Reflection.BindingFlags.NonPublic | System.Reflection.BindingFlags.Instance)!;
        using (var scope = factory.Services.CreateScope())
            await (Task)run.Invoke(job, [scope.ServiceProvider, CancellationToken.None])!;

        await factory.QueryAsync(async db =>
        {
            Assert.False(await db.Notifications.AnyAsync(n => n.UserId == member.UserId && n.SourceEntityId == pass.MemberPackageId));
            return 0;
        });
    }

    [Fact]
    public async Task Expiry_job_queues_one_in_app_and_email_reminder_ten_days_before_expiry()
    {
        var member = await factory.SeedUserAsync(UserRole.Member);
        var today = DateOnly.FromDateTime(DateTime.UtcNow.AddHours(7));
        var packageId = await factory.QueryAsync(async db =>
        {
            var plan = new MembershipPackage
            {
                Name = "Expiry reminder " + Guid.NewGuid().ToString("N"),
                Price = 600_000m, DurationDays = 30, IsActive = true
            };
            db.MembershipPackages.Add(plan);
            await db.SaveChangesAsync();
            var membership = new MemberPackage
            {
                MemberPackageId = Guid.NewGuid(), MemberId = member.UserId,
                PackageId = plan.PackageId, Status = MemberPackageStatus.Active,
                StartDate = today.AddDays(-19), EndDate = today.AddDays(10)
            };
            db.MemberPackages.Add(membership);
            await db.SaveChangesAsync();
            return membership.MemberPackageId;
        });

        var job = new SportHub.API.Jobs.MemberPackageExpiryJob(factory.Services, NullLogger<SportHub.API.Jobs.MemberPackageExpiryJob>.Instance);
        var run = typeof(SportHub.API.Jobs.MemberPackageExpiryJob)
            .GetMethod("RunOnceAsync", System.Reflection.BindingFlags.NonPublic | System.Reflection.BindingFlags.Instance)!;
        for (var attempt = 0; attempt < 2; attempt++)
        {
            using var scope = factory.Services.CreateScope();
            await (Task)run.Invoke(job, [scope.ServiceProvider, CancellationToken.None])!;
        }

        await factory.QueryAsync(async db =>
        {
            var notices = await db.Notifications.Where(n => n.SourceEntityId == packageId
                && n.SourceEventType == NotificationSourceEventType.PackageExpiring).ToListAsync();
            Assert.Single(notices, n => n.Channel == NotificationChannel.InApp);
            var email = Assert.Single(notices, n => n.Channel == NotificationChannel.Email);
            Assert.Equal(member.Email, email.RecipientAddress);
            Assert.NotNull(email.ProtectedEmailPayload);
            return 0;
        });
    }

    [Fact]
    public async Task Day_pass_cannot_be_bought_while_the_whole_gym_is_closed()
    {
        var testNow = TodayAtLocalHour(14);
        using var app = AtTime(testNow);
        var member = await factory.SeedUserAsync(UserRole.Member);
        var manager = await factory.SeedUserAsync(UserRole.CenterManager);
        var blockIds = new List<Guid>();
        try
        {
            await factory.QueryAsync(async db =>
            {
                var gymRoomTypeIds = await db.Set<SportRoomType>()
                    .Join(db.Set<Sport>().Where(sport => sport.Code == "gym"),
                        link => link.SportId, sport => sport.SportId, (link, _) => link.RoomTypeId).ToListAsync();
                Assert.NotEmpty(gymRoomTypeIds);
                var gymRooms = await db.Set<Room>().Where(r => r.IsActive && r.RoomTypeId != null
                    && gymRoomTypeIds.Contains(r.RoomTypeId.Value)).ToListAsync();
                if (gymRooms.Count == 0)
                {
                    var room = new Room { Name = $"Gym floor {Guid.NewGuid():N}", Capacity = 30, RoomTypeId = gymRoomTypeIds[0] };
                    db.Set<Room>().Add(room);
                    await db.SaveChangesAsync();
                    gymRooms.Add(room);
                }
                foreach (var room in gymRooms)
                {
                    var block = new RoomBlock
                    {
                        BlockId = Guid.NewGuid(), RoomId = room.RoomId, Reason = "Day pass closure test",
                        StartAtUtc = testNow.AddHours(-1), EndAtUtc = testNow.AddHours(1),
                        CreatedByUserId = manager.UserId
                    };
                    db.Set<RoomBlock>().Add(block);
                    blockIds.Add(block.BlockId);
                }
                await db.SaveChangesAsync();
                return 0;
            });

            using var buyer = Client(app, member.UserId, UserRole.Member);
            using var request = new HttpRequestMessage(HttpMethod.Post, "/api/checkouts/membership")
            {
                Content = JsonContent.Create(new { packageId = DayPass.PackageId })
            };
            request.Headers.Add("Idempotency-Key", Guid.NewGuid().ToString("N"));
            var response = await buyer.SendAsync(request);

            Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
            Assert.Contains("gym_closed_today", await response.Content.ReadAsStringAsync());
        }
        finally
        {
            await factory.QueryAsync(async db =>
            {
                db.Set<RoomBlock>().RemoveRange(db.Set<RoomBlock>().Where(b => blockIds.Contains(b.BlockId)));
                await db.SaveChangesAsync();
                return 0;
            });
        }
    }

    [Theory]
    [InlineData(7, 59, false, false)]
    [InlineData(8, 0, true, false)]
    [InlineData(19, 59, true, false)]
    [InlineData(20, 0, false, false)]
    [InlineData(7, 59, false, true)]
    [InlineData(8, 0, true, true)]
    [InlineData(19, 59, true, true)]
    [InlineData(20, 0, false, true)]
    public async Task Day_pass_sales_follow_Manager_settings(int hour, int minute, bool allowed, bool atCounter)
    {
        using var app = AtTime(TodayAtLocalHour(hour).AddMinutes(minute));
        var manager = await factory.SeedUserAsync(UserRole.CenterManager);
        using var management = Client(app, manager.UserId, UserRole.CenterManager);
        var original = await management.GetFromJsonAsync<List<HourSetting>>("/api/system-settings");
        try
        {
            await SaveHoursAsync(management, 8 * 60, 20 * 60);
            var member = await factory.SeedUserAsync(UserRole.Member);
            var actor = atCounter ? await factory.SeedUserAsync(UserRole.Receptionist) : member;
            using var buyer = Client(app, actor.UserId, atCounter ? UserRole.Receptionist : UserRole.Member);
            using var request = new HttpRequestMessage(HttpMethod.Post, "/api/checkouts/membership") {
                Content = JsonContent.Create(new { packageId = DayPass.PackageId, targetMemberId = member.UserId }) };
            request.Headers.Add("Idempotency-Key", Guid.NewGuid().ToString("N"));
            var response = await buyer.SendAsync(request);
            Assert.Equal(allowed ? HttpStatusCode.Created : HttpStatusCode.Conflict, response.StatusCode);
            if (allowed)
            {
                var checkout = (await response.Content.ReadFromJsonAsync<CheckoutResponse>())!;
                Assert.True(checkout.ExpiresAtUtc <= TodayAtLocalHour(20));
            }
        }
        finally { await RestoreHoursAsync(management, original!); }
    }

    [Fact]
    public async Task Settings_update_reactivates_paid_day_passes_for_today()
    {
        var clock = new FixedClock(TodayAtLocalHour(18));
        using var app = AtTime(clock);
        var manager = await factory.SeedUserAsync(UserRole.CenterManager);
        using var management = Client(app, manager.UserId, UserRole.CenterManager);
        var original = await management.GetFromJsonAsync<List<HourSetting>>("/api/system-settings");
        try
        {
            await SaveHoursAsync(management, 8 * 60, 20 * 60);
            var member = await factory.SeedUserAsync(UserRole.Member);
            var expiredMember = await factory.SeedUserAsync(UserRole.Member);
            var today = DateOnly.FromDateTime(VietnamTime.ToLocal(clock.UtcNow));
            var live = await SeedPaidDayPassAsync(member.UserId, today);
            var expired = await SeedPaidDayPassAsync(expiredMember.UserId, today);
            await factory.QueryAsync(async db => {
                await db.MemberPackages.Where(p => p.MemberPackageId == live.MemberPackageId)
                    .ExecuteUpdateAsync(u => u.SetProperty(p => p.ExpiresAtUtc, TodayAtLocalHour(20)));
                await db.MemberPackages.Where(p => p.MemberPackageId == expired.MemberPackageId)
                    .ExecuteUpdateAsync(u => u.SetProperty(p => p.ExpiresAtUtc, TodayAtLocalHour(17))
                        .SetProperty(p => p.Status, MemberPackageStatus.Expired));
                return 0;
            });
            await SaveHoursAsync(management, 8 * 60, 21 * 60);
            Assert.Equal(TodayAtLocalHour(21), await PassExpiryAsync(live.MemberPackageId));
            Assert.Equal(TodayAtLocalHour(21), await PassExpiryAsync(expired.MemberPackageId));
            Assert.Equal(MemberPackageStatus.Active, await PassStatusAsync(expired.MemberPackageId));
            await SaveHoursAsync(management, 19 * 60, 21 * 60);
            Assert.Equal(MemberPackageStatus.Active, await PassStatusAsync(live.MemberPackageId));
            using (var accessScope = app.Services.CreateScope())
                Assert.Null(await accessScope.ServiceProvider.GetRequiredService<IMembershipAccessReader>()
                    .GetActiveAsync(member.UserId, new DateTimeOffset(clock.UtcNow)));
            using (var accessScope = app.Services.CreateScope())
                Assert.NotNull(await accessScope.ServiceProvider.GetRequiredService<IMembershipAccessReader>()
                    .GetActiveAsync(member.UserId, new DateTimeOffset(TodayAtLocalHour(19))));
            await SaveHoursAsync(management, 8 * 60, 21 * 60);
            Assert.Equal(MemberPackageStatus.Active, await PassStatusAsync(live.MemberPackageId));
            await SaveHoursAsync(management, 8 * 60, 19 * 60);
            Assert.Equal(TodayAtLocalHour(19), await PassExpiryAsync(live.MemberPackageId));
            // Move closing into the past, then extend it: today's paid pass becomes usable again.
            await SaveHoursAsync(management, 8 * 60, 17 * 60 + 30);
            Assert.Equal(MemberPackageStatus.Expired, await PassStatusAsync(live.MemberPackageId));
            await SaveHoursAsync(management, 8 * 60, 22 * 60);
            Assert.Equal(TodayAtLocalHour(22), await PassExpiryAsync(live.MemberPackageId));
            Assert.Equal(MemberPackageStatus.Active, await PassStatusAsync(live.MemberPackageId));
            using var scope = app.Services.CreateScope();
            Assert.NotNull(await scope.ServiceProvider.GetRequiredService<IMembershipAccessReader>()
                .GetActiveAsync(member.UserId, new DateTimeOffset(clock.UtcNow)));
        }
        finally { await RestoreHoursAsync(management, original!); }
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task Closing_cancels_pending_checkout_and_late_payment_cannot_revive_it(bool changeSettings)
    {
        var clock = new FixedClock(TodayAtLocalHour(19).AddMinutes(58));
        using var app = AtTime(clock);
        var manager = await factory.SeedUserAsync(UserRole.CenterManager);
        using var management = Client(app, manager.UserId, UserRole.CenterManager);
        var original = await management.GetFromJsonAsync<List<HourSetting>>("/api/system-settings");
        try
        {
            await SaveHoursAsync(management, 8 * 60, 20 * 60);
            var member = await factory.SeedUserAsync(UserRole.Member);
            using var buyer = Client(app, member.UserId, UserRole.Member);
            using var request = new HttpRequestMessage(HttpMethod.Post, "/api/checkouts/membership") {
                Content = JsonContent.Create(new { packageId = DayPass.PackageId }) };
            request.Headers.Add("Idempotency-Key", Guid.NewGuid().ToString("N"));
            var response = await buyer.SendAsync(request);
            response.EnsureSuccessStatusCode();
            var checkout = (await response.Content.ReadFromJsonAsync<CheckoutResponse>())!;
            var attemptResponse = await buyer.PostAsync($"/api/checkouts/{checkout.InvoiceId}/attempts", null);
            attemptResponse.EnsureSuccessStatusCode();
            var attempt = (await attemptResponse.Content.ReadFromJsonAsync<PaymentAttemptResponse>())!;
            if (changeSettings) await SaveHoursAsync(management, 8 * 60, 19 * 60 + 57);
            else
            {
                clock.UtcNow = TodayAtLocalHour(20);
                using var scope = app.Services.CreateScope();
                await scope.ServiceProvider.GetRequiredService<DayPassHoursService>().CloseDueAsync();
            }
            var closed = (await buyer.GetFromJsonAsync<CheckoutResponse>($"/api/checkouts/{checkout.InvoiceId}"))!;
            Assert.Equal("EXPIRED", closed.State.ToUpperInvariant());
            Assert.Equal("VOID", closed.InvoiceStatus.ToUpperInvariant());
            await factory.QueryAsync(async db => {
                Assert.True(await db.Notifications.AnyAsync(n => n.UserId == member.UserId
                    && n.SourceEntityId == checkout.InvoiceId && n.Message.Contains("expired")));
                return 0;
            });
            // Extending hours must not reopen the same order, even with a successful late payment.
            await SaveHoursAsync(management, 8 * 60, 22 * 60);
            var proofId = Guid.NewGuid();
            await factory.QueryAsync(async db => {
                db.VerifiedGatewayEvents.Add(new VerifiedGatewayEvent {
                    VerifiedGatewayEventId = proofId, PaymentAttemptId = attempt.PaymentAttemptId,
                    Provider = "VNPay", ProviderTransactionId = Guid.NewGuid().ToString("N"),
                    TransactionReference = attempt.TransactionReference, Amount = attempt.CashAmount,
                    ResponseCode = "00", TransactionStatus = "00", ProviderPaidAtUtc = clock.UtcNow,
                    VerifiedAtUtc = clock.UtcNow, ProcessingStatus = "Pending" });
                await db.SaveChangesAsync();
                return 0;
            });
            using (var scope = app.Services.CreateScope())
                await scope.ServiceProvider.GetRequiredService<PaymentReconciliationService>().ProcessAsync(proofId, default);
            await factory.QueryAsync(async db => {
                var invoice = await db.Invoices.SingleAsync(i => i.InvoiceId == checkout.InvoiceId);
                Assert.True(invoice.ReconciliationRequired);
                Assert.Equal(InvoiceStatus.PaidAfterReconciliation, invoice.Status);
                Assert.Equal(MemberPackageStatus.Cancelled, (await db.MemberPackages.SingleAsync(p => p.MemberPackageId == invoice.MemberPackageId)).Status);
                Assert.Equal(attempt.CashAmount, await db.Payments.Where(p => p.InvoiceId == invoice.InvoiceId && p.Status == PaymentStatus.Success).SumAsync(p => p.Amount));
                return 0;
            });
        }
        finally { await RestoreHoursAsync(management, original!); }
    }

    [Fact]
    public async Task Pass_can_be_paid_and_activated_after_22_when_settings_allow_it()
    {
        var clock = new FixedClock(TodayAtLocalHour(22).AddMinutes(15));
        using var app = AtTime(clock);
        var manager = await factory.SeedUserAsync(UserRole.CenterManager);
        using var management = Client(app, manager.UserId, UserRole.CenterManager);
        var original = await management.GetFromJsonAsync<List<HourSetting>>("/api/system-settings");
        try
        {
            await SaveHoursAsync(management, 5 * 60 + 30, 23 * 60 + 30);
            var member = await factory.SeedUserAsync(UserRole.Member);
            using var buyer = Client(app, member.UserId, UserRole.Member);
            using var request = new HttpRequestMessage(HttpMethod.Post, "/api/checkouts/membership") {
                Content = JsonContent.Create(new { packageId = DayPass.PackageId }) };
            request.Headers.Add("Idempotency-Key", Guid.NewGuid().ToString("N"));
            var response = await buyer.SendAsync(request);
            response.EnsureSuccessStatusCode();
            var checkout = (await response.Content.ReadFromJsonAsync<CheckoutResponse>())!;
            var attempted = await buyer.PostAsync($"/api/checkouts/{checkout.InvoiceId}/attempts", null);
            attempted.EnsureSuccessStatusCode();
            var attempt = (await attempted.Content.ReadFromJsonAsync<PaymentAttemptResponse>())!;
            var proofId = Guid.NewGuid();
            await factory.QueryAsync(async db => {
                db.VerifiedGatewayEvents.Add(new VerifiedGatewayEvent {
                    VerifiedGatewayEventId = proofId, PaymentAttemptId = attempt.PaymentAttemptId,
                    Provider = "VNPay", ProviderTransactionId = Guid.NewGuid().ToString("N"),
                    TransactionReference = attempt.TransactionReference, Amount = attempt.CashAmount,
                    ResponseCode = "00", TransactionStatus = "00", ProviderPaidAtUtc = clock.UtcNow,
                    VerifiedAtUtc = clock.UtcNow, ProcessingStatus = "Pending" });
                await db.SaveChangesAsync();
                return 0;
            });
            using (var scope = app.Services.CreateScope())
                await scope.ServiceProvider.GetRequiredService<PaymentReconciliationService>().ProcessAsync(proofId, default);
            await factory.QueryAsync(async db => {
                var invoice = await db.Invoices.SingleAsync(i => i.InvoiceId == checkout.InvoiceId);
                var pass = await db.MemberPackages.SingleAsync(p => p.MemberPackageId == invoice.MemberPackageId);
                Assert.Equal(InvoiceStatus.Paid, invoice.Status);
                Assert.False(invoice.ReconciliationRequired);
                Assert.Equal(MemberPackageStatus.Active, pass.Status);
                Assert.Equal(TodayAtLocalHour(23).AddMinutes(30), pass.ExpiresAtUtc);
                return 0;
            });
        }
        finally { await RestoreHoursAsync(management, original!); }
    }

    [Fact]
    public async Task Extending_closing_at_2030_restores_a_paid_pass_that_expired_at_2000()
    {
        var clock = new FixedClock(TodayAtLocalHour(20).AddMinutes(30));
        using var app = AtTime(clock);
        var manager = await factory.SeedUserAsync(UserRole.CenterManager);
        using var management = Client(app, manager.UserId, UserRole.CenterManager);
        var original = await management.GetFromJsonAsync<List<HourSetting>>("/api/system-settings");
        try
        {
            await SaveHoursAsync(management, 8 * 60, 20 * 60);
            var member = await factory.SeedUserAsync(UserRole.Member);
            var today = DateOnly.FromDateTime(VietnamTime.ToLocal(clock.UtcNow));
            var pass = await SeedPaidDayPassAsync(member.UserId, today);
            await factory.QueryAsync(async db => {
                await db.MemberPackages.Where(p => p.MemberPackageId == pass.MemberPackageId)
                    .ExecuteUpdateAsync(u => u.SetProperty(p => p.ExpiresAtUtc, TodayAtLocalHour(20))
                        .SetProperty(p => p.Status, MemberPackageStatus.Expired));
                return 0;
            });
            await SaveHoursAsync(management, 8 * 60, 22 * 60);
            Assert.Equal(MemberPackageStatus.Active, await PassStatusAsync(pass.MemberPackageId));
            Assert.Equal(TodayAtLocalHour(22), await PassExpiryAsync(pass.MemberPackageId));
            using var scope = app.Services.CreateScope();
            Assert.NotNull(await scope.ServiceProvider.GetRequiredService<IMembershipAccessReader>()
                .GetActiveAsync(member.UserId, new DateTimeOffset(clock.UtcNow)));
        }
        finally { await RestoreHoursAsync(management, original!); }
    }

    [Theory]
    [InlineData("previous-day")]
    [InlineData("cancelled")]
    [InlineData("unpaid")]
    [InlineData("refunded")]
    [InlineData("compensated")]
    [InlineData("awaiting-resolution")]
    public async Task Settings_never_restore_ineligible_day_passes(string scenario)
    {
        var clock = new FixedClock(TodayAtLocalHour(20).AddMinutes(30));
        using var app = AtTime(clock);
        var manager = await factory.SeedUserAsync(UserRole.CenterManager);
        using var management = Client(app, manager.UserId, UserRole.CenterManager);
        var original = await management.GetFromJsonAsync<List<HourSetting>>("/api/system-settings");
        try
        {
            await SaveHoursAsync(management, 8 * 60, 20 * 60);
            var member = await factory.SeedUserAsync(UserRole.Member);
            var today = DateOnly.FromDateTime(VietnamTime.ToLocal(clock.UtcNow));
            var date = scenario == "previous-day" ? today.AddDays(-1) : today;
            var pass = await SeedPaidDayPassAsync(member.UserId, date);
            var oldExpiry = VietnamTime.ToUtc(date.ToDateTime(new TimeOnly(20, 0)));
            var expectedStatus = scenario == "cancelled" ? MemberPackageStatus.Cancelled : MemberPackageStatus.Expired;
            await factory.QueryAsync(async db => {
                var row = await db.MemberPackages.SingleAsync(p => p.MemberPackageId == pass.MemberPackageId);
                row.ExpiresAtUtc = oldExpiry;
                row.Status = expectedStatus;
                var invoice = await db.Invoices.SingleAsync(i => i.MemberPackageId == pass.MemberPackageId);
                if (scenario == "unpaid") invoice.Status = InvoiceStatus.Issued;
                if (scenario == "compensated") invoice.Status = InvoiceStatus.Compensated;
                if (scenario == "awaiting-resolution") {
                    invoice.Status = InvoiceStatus.PaidAfterReconciliation;
                    invoice.PaidVia = "VnPayAwaitingResolution";
                    invoice.ReconciliationRequired = true;
                }
                if (scenario == "refunded") db.PaymentAdjustments.Add(new PaymentAdjustment {
                    AdjustmentId = Guid.NewGuid(), InvoiceId = invoice.InvoiceId,
                    InvoiceItemId = row.InvoiceItemId, Type = PaymentAdjustmentType.Refund,
                    Status = PaymentAdjustmentStatus.Completed, Amount = invoice.TotalAmount,
                    RequestedAmount = invoice.TotalAmount, Reason = "Refunded day pass",
                    RequestedByUserId = manager.UserId, ApprovedByUserId = manager.UserId,
                    CompletedByUserId = manager.UserId, CreatedAt = clock.UtcNow,
                    CompletedAtUtc = clock.UtcNow, RefundMethod = PaymentMethod.VnPay });
                await db.SaveChangesAsync();
                return 0;
            });
            await SaveHoursAsync(management, 8 * 60, 22 * 60);
            Assert.Equal(expectedStatus, await PassStatusAsync(pass.MemberPackageId));
            Assert.Equal(oldExpiry, await PassExpiryAsync(pass.MemberPackageId));
            using var scope = app.Services.CreateScope();
            Assert.Null(await scope.ServiceProvider.GetRequiredService<IMembershipAccessReader>()
                .GetActiveAsync(member.UserId, new DateTimeOffset(clock.UtcNow)));
        }
        finally { await RestoreHoursAsync(management, original!); }
    }

    private async Task<MemberPackage> SeedPaidDayPassAsync(Guid memberId, DateOnly date)
    {
        var pass = await SeedActiveDayPassAsync(factory, memberId, date);
        var invoice = await factory.SeedInvoiceAsync(memberId, memberId, DayPass.PriceVnd, pass.MemberPackageId);
        await factory.QueryAsync(async db => {
            var row = await db.Invoices.Include(i => i.Items).SingleAsync(i => i.InvoiceId == invoice.InvoiceId);
            row.Status = InvoiceStatus.Paid;
            row.PaidVia = "VnPay";
            row.PaidAtUtc = VietnamTime.ToUtc(date.ToDateTime(new TimeOnly(10, 0)));
            var item = row.Items.Single();
            item.MemberPackageId = pass.MemberPackageId;
            (await db.MemberPackages.SingleAsync(p => p.MemberPackageId == pass.MemberPackageId)).InvoiceItemId = item.ItemId;
            await db.SaveChangesAsync();
            return 0;
        });
        return pass;
    }
    private Task<MemberPackageStatus> PassStatusAsync(Guid id)
        => factory.QueryAsync(db => db.MemberPackages.Where(p => p.MemberPackageId == id).Select(p => p.Status).SingleAsync());

    private sealed record HourSetting(string Key, string Value);
    private static async Task SaveHoursAsync(HttpClient manager, int opens, int closes)
    {
        var response = await manager.PutAsJsonAsync("/api/system-settings", new { values = new Dictionary<string, string> {
            ["center.opening_minutes"] = opens.ToString(), ["center.closing_minutes"] = closes.ToString() } });
        response.EnsureSuccessStatusCode();
    }
    private static Task RestoreHoursAsync(HttpClient manager, List<HourSetting> original)
        => SaveHoursAsync(manager, int.Parse(original.Single(x => x.Key == "center.opening_minutes").Value),
            int.Parse(original.Single(x => x.Key == "center.closing_minutes").Value));
    private Task<DateTime?> PassExpiryAsync(Guid id)
        => factory.QueryAsync(db => db.MemberPackages.Where(p => p.MemberPackageId == id).Select(p => p.ExpiresAtUtc).SingleAsync());

    private sealed class FixedClock(DateTime now) : IClock
    {
        public DateTime UtcNow { get; set; } = now;
    }

    private static DateTime TodayAtLocalHour(int hour)
    {
        var localDate = DateOnly.FromDateTime(VietnamTime.ToLocal(DateTime.UtcNow));
        return VietnamTime.ToUtc(localDate.ToDateTime(new TimeOnly(hour, 0)));
    }

    private WebApplicationFactory<Program> AtTime(DateTime now)
        => AtTime(new FixedClock(now));

    private WebApplicationFactory<Program> AtTime(FixedClock clock)
        => factory.WithWebHostBuilder(builder => builder.ConfigureTestServices(services =>
        {
            services.RemoveAll<IClock>();
            services.AddSingleton<IClock>(clock);
        }));

    private HttpClient Client(WebApplicationFactory<Program> app, Guid userId, UserRole role)
    {
        var client = app.CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false });
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer",
            JwtService.GenerateAccessToken(userId, role.ToString(), factory.EffectiveJwtOptions, factory.StampOf(userId)));
        return client;
    }

    [Fact]
    public async Task Day_pass_buyers_are_reported_separately_from_members_with_a_membership()
    {
        var today = DateOnly.FromDateTime(DateTime.UtcNow.AddHours(7));
        async Task<(int Members, int DayPass, int Sold)> Snapshot()
        {
            using var scope = factory.Services.CreateScope();
            var reports = scope.ServiceProvider.GetRequiredService<SportHub.Membership.Application.Interfaces.IMembershipReportService>();
            var summary = await reports.GetSummaryAsync(today);
            var period = await reports.GetPeriodAsync(today, today);
            return (summary.MembersWithActiveMembership, summary.MembersWithDayPassToday, period.DayPassesSold);
        }

        var before = await Snapshot();
        var member = await factory.SeedUserAsync(UserRole.Member);
        var pass = await SeedActiveDayPassAsync(factory, member.UserId, today);
        var unpaid = await Snapshot();
        Assert.Equal(before.Sold, unpaid.Sold);
        var invoice = await factory.SeedInvoiceAsync(member.UserId, member.UserId, 50_000m, pass.MemberPackageId);
        await factory.QueryAsync(async db =>
        {
            var row = await db.Invoices.Include(i => i.Items).SingleAsync(i => i.InvoiceId == invoice.InvoiceId);
            row.Status = InvoiceStatus.Paid;
            row.PaidAtUtc = DateTime.UtcNow;
            row.Items.Single().MemberPackageId = pass.MemberPackageId;
            await db.SaveChangesAsync();
            return true;
        });
        var after = await Snapshot();

        Assert.Equal(before.Members, after.Members);
        Assert.Equal(before.DayPass + 1, after.DayPass);
        Assert.Equal(before.Sold + 1, after.Sold);
    }
}
