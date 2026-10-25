using System.Net;
using System.Net.Http.Json;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SportHub.API.Persistence;
using SportHub.BuildingBlocks.Abstractions.Wallet;
using SportHub.BuildingBlocks.SharedKernel.Time;
using SportHub.Identity.Domain.Enums;
using SportHub.Membership.Domain.Entities;
using SportHub.Membership.Domain.Enums;
using SportHub.Identity.Domain.Entities;
using SportHub.Payment.Application.DTOs.Checkouts;
using SportHub.Payment.Domain.Enums;
using SportHub.Payment.Domain.Entities;
using SportHub.Payment.Application.Services;
using SportHub.Payment.VnPay;
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
    private sealed class PaidQueryGateway : IPaymentGateway
    {
        public int QueryCount { get; private set; }
        public string CreatePaymentUrl(string reference, decimal amount, DateTime createdAt,
            DateTime expiresAt, string ip) => "/test-payment";
        public VerifiedPaymentResult VerifyCallback(IReadOnlyDictionary<string, string> fields)
            => throw new NotSupportedException();
        public Task<VerifiedPaymentResult?> QueryAsync(PaymentAttempt attempt, CancellationToken ct)
        {
            QueryCount++;
            return Task.FromResult<VerifiedPaymentResult?>(new VerifiedPaymentResult(
                attempt.VnpTxnRef, Guid.NewGuid().ToString("N"), attempt.Amount,
                true, "00", "00", DateTime.UtcNow));
        }
    }

    [Fact]
    public async Task Expiry_queries_gateway_before_releasing_hold_and_fulfills_verified_payment()
    {
        var context = await SeedAsync();
        using var member = factory.CreateApiClient(context.MemberId, UserRole.Member);
        var checkout = await CreateAsync(member, context.PackageId);
        Assert.Equal(HttpStatusCode.OK,
            (await member.PostAsync($"/api/checkouts/{checkout.InvoiceId}/attempts", null)).StatusCode);
        await factory.QueryAsync(async db =>
        {
            await db.Invoices.Where(i => i.InvoiceId == checkout.InvoiceId).ExecuteUpdateAsync(s =>
                s.SetProperty(i => i.HoldExpiresAtUtc, DateTime.UtcNow.AddMinutes(-1)));
            await db.CheckoutSessions.Where(s => s.CheckoutSessionId == checkout.CheckoutSessionId)
                .ExecuteUpdateAsync(s => s.SetProperty(c => c.ExpiresAtUtc, DateTime.UtcNow.AddMinutes(-1)));
            return 0;
        });

        var gateway = new PaidQueryGateway();
        using var app = factory.WithWebHostBuilder(builder => builder.ConfigureTestServices(services =>
        {
            services.RemoveAll<IPaymentGateway>();
            services.AddSingleton<IPaymentGateway>(gateway);
        }));
        using (var scope = app.Services.CreateScope())
            await scope.ServiceProvider.GetRequiredService<CheckoutExpiryService>()
                .ExpireDueAsync(default);
        Assert.True(gateway.QueryCount >= 1);
        await factory.QueryAsync(async db =>
        {
            var invoice = await db.Invoices.SingleAsync(i => i.InvoiceId == checkout.InvoiceId);
            Assert.Equal(InvoiceStatus.PaidAfterReconciliation, invoice.Status);
            Assert.Equal("VnPayAfterReconciliation", invoice.PaidVia);
            Assert.Equal(MemberPackageStatus.Active, await db.MemberPackages
                .Where(p => p.MemberPackageId == invoice.MemberPackageId)
                .Select(p => p.Status).SingleAsync());
            return 0;
        });
    }

    private async Task<(Guid MemberId, Guid ReceptionistId, int PackageId)> SeedAsync()
    {
        var member = await factory.SeedUserAsync(UserRole.Member);
        var receptionist = await factory.SeedUserAsync(UserRole.Receptionist);

        using var scope = factory.Services.CreateScope();

        var db =
            scope.ServiceProvider.GetRequiredService<SportHubDbContext>();

        var catalog = new MembershipPackage
        {
            Name = "Checkout " + Guid.NewGuid().ToString("N"),
            Price = 100_000m,
            DurationDays = 30,
            IsActive = true
        };

        db.MembershipPackages.Add(catalog);

        await db.SaveChangesAsync();

        await using var tx =
            await db.Database.BeginTransactionAsync();

        await scope.ServiceProvider
            .GetRequiredService<IPointWalletService>()
            .EarnAsync(
                new(
                    member.UserId,
                    100,
                    "TestCredit",
                    Guid.NewGuid()));

        await tx.CommitAsync();

        return (
            member.UserId,
            receptionist.UserId,
            catalog.PackageId);
    }

    private async Task<CheckoutResponse> CreateAsync(
        HttpClient client,
        int packageId)
    {
        using var request =
            new HttpRequestMessage(
                HttpMethod.Post,
                "/api/checkouts/membership")
            {
                Content =
                    JsonContent.Create(
                        new
                        {
                            packageId
                        })
            };

        request.Headers.Add(
            "Idempotency-Key",
            Guid.NewGuid().ToString("N"));

        var response =
            await client.SendAsync(request);

        Assert.Equal(
            HttpStatusCode.Created,
            response.StatusCode);

        return (
            await response.Content
                .ReadFromJsonAsync<CheckoutResponse>())!;
    }

    [Fact]
    public async Task Gym_checkout_resumes_the_same_invoice_and_deadline_after_returning_to_catalog()
    {
        var context = await SeedAsync();
        using var member = factory.CreateApiClient(context.MemberId, UserRole.Member);

        var first = await CreateAsync(member, context.PackageId);
        var resumed = await CreateAsync(member, context.PackageId);

        Assert.Equal(first.InvoiceId, resumed.InvoiceId);
        Assert.Equal(first.CheckoutSessionId, resumed.CheckoutSessionId);
        Assert.InRange(
            (first.ExpiresAtUtc - resumed.ExpiresAtUtc).Duration(),
            TimeSpan.Zero,
            TimeSpan.FromMilliseconds(1));
        Assert.Equal(1, await factory.QueryAsync(db => db.MemberPackages.CountAsync(
            p => p.MemberId == context.MemberId && p.PackageId == context.PackageId
                && p.Status == MemberPackageStatus.PendingPayment)));
    }

    [Fact]
    public async Task Expiry_skips_stalled_gateway_captures_before_applying_batch_limit()
    {
        var context = await SeedAsync();
        using var member = factory.CreateApiClient(context.MemberId, UserRole.Member);
        var releasable = await CreateAsync(member, context.PackageId);
        var blockedIds = new List<Guid>();
        await factory.QueryAsync(async db =>
        {
            var now = DateTime.UtcNow;
            var blockedExpiry = now.AddMinutes(-3);
            var releasableExpiry = now.AddMinutes(-1);
            await db.Invoices.Where(x => x.InvoiceId == releasable.InvoiceId)
                .ExecuteUpdateAsync(s => s.SetProperty(x => x.HoldExpiresAtUtc, releasableExpiry));
            await db.CheckoutSessions.Where(x => x.CheckoutSessionId == releasable.CheckoutSessionId)
                .ExecuteUpdateAsync(s => s.SetProperty(x => x.ExpiresAtUtc, releasableExpiry));

            for (var i = 0; i < 100; i++)
            {
                var invoiceId = Guid.NewGuid();
                var cycleId = Guid.NewGuid();
                var attemptId = Guid.NewGuid();
                var reference = attemptId.ToString("N");
                blockedIds.Add(invoiceId);
                db.Invoices.Add(new Invoice
                {
                    InvoiceId = invoiceId,
                    InvoiceNumber = $"EXP-{invoiceId:N}",
                    MemberId = context.MemberId,
                    IssuedByUserId = context.ReceptionistId,
                    TotalAmount = 100_000m,
                    CashAmount = 100_000m,
                    CheckoutCycleId = cycleId,
                    CheckoutRevision = 1,
                    HoldExpiresAtUtc = blockedExpiry,
                    Status = InvoiceStatus.Issued,
                    IssuedAt = now.AddMinutes(-10)
                });
                db.CheckoutSessions.Add(new CheckoutSession
                {
                    CheckoutSessionId = cycleId,
                    InvoiceId = invoiceId,
                    Revision = 1,
                    IdempotencyKey = Guid.NewGuid().ToString("N"),
                    Kind = "Membership",
                    State = "Active",
                    CreatedAtUtc = now.AddMinutes(-10),
                    ExpiresAtUtc = blockedExpiry
                });
                db.PaymentAttempts.Add(new PaymentAttempt
                {
                    PaymentAttemptId = attemptId,
                    InvoiceId = invoiceId,
                    CheckoutSessionId = cycleId,
                    VnpTxnRef = reference,
                    Amount = 100_000m,
                    CashSnapshot = 100_000m,
                    VnpExpireDate = blockedExpiry,
                    Status = PaymentAttemptStatus.Pending,
                    CreatedAt = now.AddMinutes(-10)
                });
                db.VerifiedGatewayEvents.Add(new VerifiedGatewayEvent
                {
                    VerifiedGatewayEventId = Guid.NewGuid(),
                    PaymentAttemptId = attemptId,
                    ProviderTransactionId = Guid.NewGuid().ToString("N"),
                    TransactionReference = reference,
                    Amount = 100_000m,
                    ResponseCode = "00",
                    TransactionStatus = "00",
                    ProviderPaidAtUtc = now.AddMinutes(-9),
                    VerifiedAtUtc = now.AddMinutes(-9),
                    ProcessingStatus = "Pending"
                });
            }
            await db.SaveChangesAsync();
            return 0;
        });

        using (var scope = factory.Services.CreateScope())
            await scope.ServiceProvider.GetRequiredService<CheckoutExpiryService>()
                .ExpireDueAsync(default);

        await factory.QueryAsync(async db =>
        {
            Assert.Equal(InvoiceStatus.Void, await db.Invoices.Where(x => x.InvoiceId == releasable.InvoiceId)
                .Select(x => x.Status).SingleAsync());
            Assert.Equal(100, await db.Invoices.CountAsync(x => blockedIds.Contains(x.InvoiceId)
                && x.Status == InvoiceStatus.Issued));
            await db.Invoices.Where(x => blockedIds.Contains(x.InvoiceId))
                .ExecuteUpdateAsync(s => s.SetProperty(x => x.Status, InvoiceStatus.Void));
            return 0;
        });
    }

    [Fact]
    public async Task Explicit_points_confirmation_is_idempotent_without_gateway_attempt_and_recovery_is_owned()
    {
        var context = await SeedAsync();

        using var member =
            factory.CreateApiClient(
                context.MemberId,
                UserRole.Member);

        var key =
            Guid.NewGuid().ToString("N");

        using var request =
            new HttpRequestMessage(
                HttpMethod.Post,
                "/api/checkouts/membership")
            {
                Content =
                    JsonContent.Create(
                        new
                        {
                            packageId =
                                context.PackageId
                        })
            };

        request.Headers.Add(
            "Idempotency-Key",
            key);

        var created =
            await member.SendAsync(request);

        Assert.Equal(
            HttpStatusCode.Created,
            created.StatusCode);

        var checkout =
            (await created.Content
                .ReadFromJsonAsync<CheckoutResponse>())!;

        Assert.Equal(
            HttpStatusCode.OK,
            (
                await member.GetAsync(
                    $"/api/checkouts/by-key?key={key}")
            ).StatusCode);

        var otherUser =
            await factory.SeedUserAsync(
                UserRole.Member);

        using var other =
            factory.CreateApiClient(
                otherUser.UserId,
                UserRole.Member);

        Assert.Equal(
            HttpStatusCode.NotFound,
            (
                await other.GetAsync(
                    $"/api/checkouts/by-key?key={key}")
            ).StatusCode);

        Assert.Equal(
            HttpStatusCode.Conflict,
            (
                await member.PostAsync(
                    $"/api/checkouts/{checkout.InvoiceId}/confirm-points",
                    null)
            ).StatusCode);

        Assert.Equal(
            HttpStatusCode.OK,
            (
                await member.PostAsJsonAsync(
                    $"/api/wallet/me/checkouts/{checkout.InvoiceId}/points",
                    new
                    {
                        points = 100
                    })
            ).StatusCode);

        for (var n = 0; n < 2; n++)
        {
            Assert.Equal(
                HttpStatusCode.OK,
                (
                    await member.PostAsync(
                        $"/api/checkouts/{checkout.InvoiceId}/confirm-points",
                        null)
                ).StatusCode);
        }

        await factory.QueryAsync(
            async db =>
            {
                Assert.False(
                    await db.Set<PaymentAttempt>()
                        .AnyAsync(
                            a =>
                                a.InvoiceId ==
                                checkout.InvoiceId));

                Assert.Equal(
                    InvoiceStatus.Paid,
                    (
                        await db.Invoices
                            .SingleAsync(
                                a =>
                                    a.InvoiceId ==
                                    checkout.InvoiceId)
                    ).Status);

                return 0;
            });
    }

    [Theory]
    [InlineData(0)]
    [InlineData(40)]
    [InlineData(100)]
    public async Task Payment_split_fulfills_once_with_mock_verified_pipeline(
        int points)
    {
        var context = await SeedAsync();

        using var member =
            factory.CreateApiClient(
                context.MemberId,
                UserRole.Member);

        using var receptionist =
            factory.CreateApiClient(
                context.ReceptionistId,
                UserRole.Receptionist);

        var checkout =
            await CreateAsync(
                member,
                context.PackageId);

        if (points > 0)
        {
            var select =
                await member.PostAsJsonAsync(
                    $"/api/wallet/me/checkouts/{checkout.InvoiceId}/points",
                    new
                    {
                        points
                    });

            Assert.Equal(
                HttpStatusCode.OK,
                select.StatusCode);
        }

        var attemptResponse =
            await member.PostAsync(
                $"/api/checkouts/{checkout.InvoiceId}/attempts",
                null);

        Assert.Equal(
            HttpStatusCode.OK,
            attemptResponse.StatusCode);

        var attempt =
            (await attemptResponse.Content
                .ReadFromJsonAsync<PaymentAttemptResponse>())!;

        if (points < 100)
        {
            Assert.Equal(
                100_000m - points * 1000m,
                attempt.CashAmount);

            Assert.NotEqual(
                Guid.Empty,
                attempt.PaymentAttemptId);

            var simulated =
                await receptionist.PostAsync(
                    $"/api/dev/payments/{attempt.TransactionReference}/simulate",
                    null);

            Assert.Equal(
                HttpStatusCode.OK,
                simulated.StatusCode);
        }
        else
        {
            Assert.Equal(
                Guid.Empty,
                attempt.PaymentAttemptId);
        }

        await factory.QueryAsync(
            async db =>
            {
                var invoice =
                    await db.Invoices
                        .SingleAsync(
                            x =>
                                x.InvoiceId ==
                                checkout.InvoiceId);

                var package =
                    await db.MemberPackages
                        .SingleAsync(
                            x =>
                                x.MemberPackageId ==
                                invoice.MemberPackageId);

                var wallet =
                    await db.PointWallets
                        .SingleAsync(
                            x =>
                                x.OwnerUserId ==
                                context.MemberId);

                Assert.Equal(
                    InvoiceStatus.Paid,
                    invoice.Status);

                Assert.Equal(
                    MemberPackageStatus.Active,
                    package.Status);

                Assert.Equal(
                    100 - points,
                    wallet.AvailablePoints);

                Assert.Equal(
                    0,
                    wallet.HeldPoints);

                Assert.Equal(
                    points < 100 ? 1 : 0,
                    await db.Payments
                        .CountAsync(
                            x =>
                                x.InvoiceId ==
                                checkout.InvoiceId));

                Assert.Equal(
                    points < 100 ? 1 : 0,
                    await db.VerifiedGatewayEvents
                        .CountAsync(
                            x =>
                                db.PaymentAttempts
                                    .Any(
                                        a =>
                                            a.PaymentAttemptId ==
                                                x.PaymentAttemptId &&
                                            a.InvoiceId ==
                                                checkout.InvoiceId)));

                return 0;
            });
    }

    [Fact]
    public async Task New_checkout_cannot_be_marked_paid_by_legacy_manual_endpoint()
    {
        var context = await SeedAsync();

        using var member =
            factory.CreateApiClient(
                context.MemberId,
                UserRole.Member);

        using var receptionist =
            factory.CreateApiClient(
                context.ReceptionistId,
                UserRole.Receptionist);

        var checkout =
            await CreateAsync(
                member,
                context.PackageId);

        var response =
            await receptionist.PostAsJsonAsync(
                $"/api/invoices/{checkout.InvoiceId}/payments",
                new
                {
                    amount = 100_000m,
                    method = "Cash"
                });

        Assert.Equal(
            HttpStatusCode.Conflict,
            response.StatusCode);
    }

    [Fact]
    public async Task Duplicate_callback_is_idempotent_but_second_bank_capture_waits_for_member_choice()
    {
        var context = await SeedAsync();

        using var member =
            factory.CreateApiClient(
                context.MemberId,
                UserRole.Member);

        var checkout =
            await CreateAsync(
                member,
                context.PackageId);

        var started =
            await member.PostAsync(
                $"/api/checkouts/{checkout.InvoiceId}/attempts",
                null);

        var attempt =
            (await started.Content
                .ReadFromJsonAsync<PaymentAttemptResponse>())!;

        var mock =
            Assert.IsType<MockPaymentGateway>(
                factory.Services
                    .GetRequiredService<IPaymentGateway>());

        var first =
            mock.BuildCallback(
                attempt.TransactionReference,
                attempt.CashAmount,
                true);

        var reportDay =
            DateOnly.FromDateTime(
                SportHub.BuildingBlocks.SharedKernel.Time
                    .VietnamTime
                    .ToLocal(
                        DateTime.UtcNow));

        using var reportScope =
            factory.Services.CreateScope();

        var reports =
            reportScope.ServiceProvider
                .GetRequiredService<
                    SportHub.Payment.Application.Interfaces.IRevenueReportService>();

        var before =
            await reports.GetAsync(
                reportDay,
                reportDay);

        async Task Receive(
            IReadOnlyDictionary<string, string> callback)
        {
            using var scope =
                factory.Services.CreateScope();

            await scope.ServiceProvider
                .GetRequiredService<PaymentReconciliationService>()
                .ReceiveCallbackAsync(
                    callback,
                    default);
        }

        await Task.WhenAll(
            Receive(first),
            Receive(first));

        await Receive(first);

        await Receive(
            mock.BuildCallback(
                attempt.TransactionReference,
                attempt.CashAmount,
                true));

        var after =
            await reports.GetAsync(
                reportDay,
                reportDay);

        Assert.Equal(
            200_000m,
            after.TotalCollected -
            before.TotalCollected);

        Assert.Equal(
            0m,
            after.ReconciliationCashCollected -
            before.ReconciliationCashCollected);

        Assert.Equal(
            0,
            after.PointsIssued -
            before.PointsIssued);

        // An additional capture waits for the member's choice and does not issue points automatically.
        Assert.Equal(
            0,
            after.PointsRefunded -
            before.PointsRefunded);

        Assert.Equal(
            after.TotalCollected,
            after.BySource.Sum(
                x =>
                    x.CashCollected));

        Assert.Equal(
            after.TotalCollected,
            after.BySportAndSource.Sum(
                x =>
                    x.CashCollected));

        await factory.QueryAsync(
            async db =>
            {
                Assert.Equal(
                    2,
                    await db.Payments
                        .CountAsync(
                            x =>
                                x.InvoiceId ==
                                    checkout.InvoiceId &&
                                x.Status ==
                                    PaymentStatus.Success));

                Assert.Equal(
                    2,
                    await db.VerifiedGatewayEvents
                        .CountAsync(
                            x =>
                                db.PaymentAttempts.Any(
                                    a =>
                                        a.PaymentAttemptId ==
                                            x.PaymentAttemptId &&
                                        a.InvoiceId ==
                                            checkout.InvoiceId)));

                Assert.Equal(
                    100,
                    await db.PointWallets
                        .Where(
                            x =>
                                x.OwnerUserId ==
                                context.MemberId)
                        .Select(
                            x =>
                                x.AvailablePoints)
                        .SingleAsync());

                return 0;
            });

        var unactivated = await member.GetFromJsonAsync<System.Text.Json.JsonElement>(
            "/api/members/me/unactivated-payments");
        Assert.Contains(unactivated.EnumerateArray(), row =>
            row.GetProperty("invoiceId").GetGuid() == checkout.InvoiceId);
        using var convert = new HttpRequestMessage(HttpMethod.Post,
            $"/api/invoices/{checkout.InvoiceId}/convert-to-points");
        convert.Headers.Add("Idempotency-Key", "duplicate-capture-choice");
        var conversion = await member.SendAsync(convert);
        Assert.Equal(HttpStatusCode.OK, conversion.StatusCode);
        var result = await conversion.Content.ReadFromJsonAsync<System.Text.Json.JsonElement>();
        Assert.Equal(100, result.GetProperty("points").GetInt32());
        await factory.QueryAsync(async db =>
        {
            Assert.Equal(InvoiceStatus.Paid, await db.Invoices.Where(i => i.InvoiceId == checkout.InvoiceId)
                .Select(i => i.Status).SingleAsync());
            Assert.Equal(200, await db.PointWallets.Where(w => w.OwnerUserId == context.MemberId)
                .Select(w => w.AvailablePoints).SingleAsync());
            return 0;
        });

        await Receive(mock.BuildCallback(attempt.TransactionReference, attempt.CashAmount, true));
        await factory.QueryAsync(async db =>
        {
            Assert.Equal(InvoiceStatus.Paid, await db.Invoices.Where(i => i.InvoiceId == checkout.InvoiceId)
                .Select(i => i.Status).SingleAsync());
            Assert.Equal(200, await db.PointWallets.Where(w => w.OwnerUserId == context.MemberId)
                .Select(w => w.AvailablePoints).SingleAsync());
            Assert.Equal(3, await db.Payments.CountAsync(p => p.InvoiceId == checkout.InvoiceId));
            return 0;
        });
        using var repeat = new HttpRequestMessage(HttpMethod.Post,
            $"/api/invoices/{checkout.InvoiceId}/convert-to-points");
        repeat.Headers.Add("Idempotency-Key", "duplicate-capture-choice");
        Assert.Equal(HttpStatusCode.Conflict, (await member.SendAsync(repeat)).StatusCode);
    }

    [Fact]
    public async Task Late_capture_after_points_release_waits_for_member_choice_and_converts_once()
    {
        var context = await SeedAsync();

        using var member =
            factory.CreateApiClient(
                context.MemberId,
                UserRole.Member);

        var checkout =
            await CreateAsync(
                member,
                context.PackageId);

        Assert.Equal(
            HttpStatusCode.OK,
            (
                await member.PostAsJsonAsync(
                    $"/api/wallet/me/checkouts/{checkout.InvoiceId}/points",
                    new
                    {
                        points = 40
                    })
            ).StatusCode);

        var started =
            await member.PostAsync(
                $"/api/checkouts/{checkout.InvoiceId}/attempts",
                null);

        var attempt =
            (await started.Content
                .ReadFromJsonAsync<PaymentAttemptResponse>())!;

        await factory.QueryAsync(
            async db =>
            {
                await db.Invoices
                    .Where(
                        x =>
                            x.InvoiceId ==
                            checkout.InvoiceId)
                    .ExecuteUpdateAsync(
                        s =>
                            s.SetProperty(
                                x =>
                                    x.HoldExpiresAtUtc,
                                DateTime.UtcNow
                                    .AddMinutes(-1)));

                await db.CheckoutSessions
                    .Where(
                        x =>
                            x.CheckoutSessionId ==
                            db.Invoices
                                .Where(
                                    i =>
                                        i.InvoiceId ==
                                        checkout.InvoiceId)
                                .Select(
                                    i =>
                                        i.CheckoutCycleId)
                                .Single())
                    .ExecuteUpdateAsync(
                        s =>
                            s.SetProperty(
                                x =>
                                    x.ExpiresAtUtc,
                                DateTime.UtcNow
                                    .AddMinutes(-1)));

                return 0;
            });

        using (var scope =
               factory.Services.CreateScope())
        {
            Assert.True(
                await scope.ServiceProvider
                    .GetRequiredService<CheckoutExpiryService>()
                    .ExpireDueAsync(
                        default) >= 1);
        }

        var mock =
            Assert.IsType<MockPaymentGateway>(
                factory.Services
                    .GetRequiredService<IPaymentGateway>());

        using (var scope =
               factory.Services.CreateScope())
        {
            await scope.ServiceProvider
                .GetRequiredService<PaymentReconciliationService>()
                .ReceiveCallbackAsync(
                    mock.BuildCallback(
                        attempt.TransactionReference,
                        attempt.CashAmount,
                        true),
                    default);
        }

        await factory.QueryAsync(
            async db =>
            {
                var invoice =
                    await db.Invoices
                        .SingleAsync(
                            x =>
                                x.InvoiceId ==
                                checkout.InvoiceId);

                Assert.Equal(
                    InvoiceStatus.PaidAfterReconciliation,
                    invoice.Status);

                Assert.Equal(
                    "VnPayAwaitingResolution",
                    invoice.PaidVia);

                Assert.Equal(
                    MemberPackageStatus.Cancelled,
                    await db.MemberPackages
                        .Where(
                            x =>
                                x.MemberPackageId ==
                                invoice.MemberPackageId)
                        .Select(
                            x =>
                                x.Status)
                        .SingleAsync());

                Assert.Equal(
                    100,
                    await db.PointWallets
                        .Where(
                            x =>
                                x.OwnerUserId ==
                                context.MemberId)
                        .Select(
                            x =>
                                x.AvailablePoints)
                        .SingleAsync());

                Assert.Equal(
                    0,
                    await db.PointWallets
                        .Where(
                            x =>
                                x.OwnerUserId ==
                                context.MemberId)
                        .Select(
                            x =>
                                x.HeldPoints)
                        .SingleAsync());

                Assert.Equal(
                    1,
                    await db.Payments
                        .CountAsync(
                            x =>
                                x.InvoiceId ==
                                checkout.InvoiceId));

                return 0;
            });

        var unactivated = await member.GetFromJsonAsync<System.Text.Json.JsonElement>(
            "/api/members/me/unactivated-payments");
        Assert.Contains(unactivated.EnumerateArray(), x =>
            x.GetProperty("invoiceId").GetGuid() == checkout.InvoiceId);

        async Task<HttpResponseMessage> Convert(string key)
        {
            using var request = new HttpRequestMessage(HttpMethod.Post,
                $"/api/invoices/{checkout.InvoiceId}/convert-to-points");
            request.Headers.Add("Idempotency-Key", key);
            return await member.SendAsync(request);
        }

        using (var other = factory.CreateApiClient(
                   (await factory.SeedUserAsync(UserRole.Member)).UserId, UserRole.Member))
        {
            using var request = new HttpRequestMessage(HttpMethod.Post,
                $"/api/invoices/{checkout.InvoiceId}/convert-to-points");
            request.Headers.Add("Idempotency-Key", "other-member");
            Assert.Equal(HttpStatusCode.Forbidden, (await other.SendAsync(request)).StatusCode);
        }

        Assert.Equal(HttpStatusCode.OK, (await Convert("choose-points")).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await Convert("choose-points")).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, (await Convert("different-choice")).StatusCode);
        await factory.QueryAsync(async db =>
        {
            var invoice = await db.Invoices.SingleAsync(x => x.InvoiceId == checkout.InvoiceId);
            Assert.Equal(InvoiceStatus.Compensated, invoice.Status);
            Assert.Equal(160, await db.PointWallets.Where(x => x.OwnerUserId == context.MemberId)
                .Select(x => x.AvailablePoints).SingleAsync());
            return 0;
        });

        var compensatedDetail = await member.GetFromJsonAsync<System.Text.Json.JsonElement>(
            $"/api/invoices/{checkout.InvoiceId}");
        Assert.Equal(0m, compensatedDetail.GetProperty("summary")
            .GetProperty("outstanding").GetDecimal());
    }

    [Fact]
    public async Task Odd_verified_capture_releases_hold_and_waits_for_member_choice()
    {
        var context = await SeedAsync();

        using var member =
            factory.CreateApiClient(
                context.MemberId,
                UserRole.Member);

        var checkout =
            await CreateAsync(
                member,
                context.PackageId);

        Assert.Equal(
            HttpStatusCode.OK,
            (
                await member.PostAsJsonAsync(
                    $"/api/wallet/me/checkouts/{checkout.InvoiceId}/points",
                    new
                    {
                        points = 40
                    })
            ).StatusCode);

        var started =
            await member.PostAsync(
                $"/api/checkouts/{checkout.InvoiceId}/attempts",
                null);

        var attempt =
            (await started.Content
                .ReadFromJsonAsync<PaymentAttemptResponse>())!;

        await factory.QueryAsync(
            async db =>
            {
                db.VerifiedGatewayEvents.Add(
                    new VerifiedGatewayEvent
                    {
                        VerifiedGatewayEventId =
                            Guid.NewGuid(),

                        PaymentAttemptId =
                            attempt.PaymentAttemptId,

                        Provider =
                            "VNPay",

                        ProviderTransactionId =
                            Guid.NewGuid()
                                .ToString("N"),

                        TransactionReference =
                            attempt.TransactionReference,

                        Amount =
                            60_001m,

                        ResponseCode =
                            "00",

                        TransactionStatus =
                            "00",

                        ProviderPaidAtUtc =
                            DateTime.UtcNow,

                        VerifiedAtUtc =
                            DateTime.UtcNow,

                        ProcessingStatus =
                            "Pending"
                    });

                await db.SaveChangesAsync();

                return 0;
            });

        var proofId =
            await factory.QueryAsync(
                db =>
                    db.VerifiedGatewayEvents
                        .Where(
                            x =>
                                x.TransactionReference ==
                                attempt.TransactionReference)
                        .Select(
                            x =>
                                x.VerifiedGatewayEventId)
                        .SingleAsync());

        using (var scope =
               factory.Services.CreateScope())
        {
            await scope.ServiceProvider
                .GetRequiredService<PaymentReconciliationService>()
                .ProcessAsync(
                    proofId,
                    default);
        }

        await factory.QueryAsync(
            async db =>
            {
                var invoice =
                    await db.Invoices
                        .SingleAsync(
                            x =>
                                x.InvoiceId ==
                                checkout.InvoiceId);

                var proof =
                    await db.VerifiedGatewayEvents
                        .SingleAsync(
                            x =>
                                x.TransactionReference ==
                                attempt.TransactionReference);

                var wallet =
                    await db.PointWallets
                        .SingleAsync(
                            x =>
                                x.OwnerUserId ==
                                context.MemberId);

                Assert.Equal(
                    InvoiceStatus.PaidAfterReconciliation,
                    invoice.Status);

                Assert.True(
                    invoice.ReconciliationRequired);

                Assert.Equal(
                    "VnPayAwaitingResolution",
                    invoice.PaidVia);

                Assert.Equal(
                    "Unactivated",
                    proof.ProcessingStatus);

                Assert.Equal(
                    100,
                    wallet.AvailablePoints);

                Assert.Equal(
                    0,
                    wallet.HeldPoints);

                Assert.Equal(
                    1,
                    await db.Payments
                        .CountAsync(
                            x =>
                                x.InvoiceId ==
                                checkout.InvoiceId));

                return 0;
            });
    }

    [Fact]
    public async Task Fulfillment_failure_keeps_verified_event_and_retries_without_partial_payment()
    {
        var context = await SeedAsync();

        using var member =
            factory.CreateApiClient(
                context.MemberId,
                UserRole.Member);

        var checkout =
            await CreateAsync(
                member,
                context.PackageId);

        Assert.Equal(
            HttpStatusCode.OK,
            (
                await member.PostAsJsonAsync(
                    $"/api/wallet/me/checkouts/{checkout.InvoiceId}/points",
                    new
                    {
                        points = 40
                    })
            ).StatusCode);

        var attempt =
            (await (
                    await member.PostAsync(
                        $"/api/checkouts/{checkout.InvoiceId}/attempts",
                        null)
                )
                .Content
                .ReadFromJsonAsync<PaymentAttemptResponse>())!;

        var pendingPackageId =
            await factory.QueryAsync(
                db =>
                    db.Invoices
                        .Where(
                            x =>
                                x.InvoiceId ==
                                checkout.InvoiceId)
                        .Select(
                            x =>
                                x.MemberPackageId!.Value)
                        .SingleAsync());

        await factory.QueryAsync(
            async db =>
            {
                await db.MemberPackages
                    .Where(
                        x =>
                            x.MemberPackageId ==
                            pendingPackageId)
                    .ExecuteUpdateAsync(
                        p =>
                            p.SetProperty(
                                x =>
                                    x.Status,
                                MemberPackageStatus.Cancelled));

                return 0;
            });

        var mock =
            Assert.IsType<MockPaymentGateway>(
                factory.Services
                    .GetRequiredService<IPaymentGateway>());

        using (var scope =
               factory.Services.CreateScope())
        {
            await scope.ServiceProvider
                .GetRequiredService<PaymentReconciliationService>()
                .ReceiveCallbackAsync(
                    mock.BuildCallback(
                        attempt.TransactionReference,
                        attempt.CashAmount,
                        true),
                    default);
        }

        await factory.QueryAsync(
            async db =>
            {
                Assert.True(
                    await db.Invoices
                        .Where(
                            x =>
                                x.InvoiceId ==
                                checkout.InvoiceId)
                        .Select(
                            x =>
                                x.ReconciliationRequired)
                        .SingleAsync());

                Assert.Equal(
                    0,
                    await db.Payments
                        .CountAsync(
                            x =>
                                x.InvoiceId ==
                                checkout.InvoiceId));

                Assert.Equal(
                    40,
                    await db.PointWallets
                        .Where(
                            x =>
                                x.OwnerUserId ==
                                context.MemberId)
                        .Select(
                            x =>
                                x.HeldPoints)
                        .SingleAsync());

                Assert.Equal(
                    "ReconciliationRequired",
                    await db.VerifiedGatewayEvents
                        .Where(
                            x =>
                                db.PaymentAttempts.Any(
                                    a =>
                                        a.PaymentAttemptId ==
                                            x.PaymentAttemptId &&
                                        a.InvoiceId ==
                                            checkout.InvoiceId))
                        .Select(
                            x =>
                                x.ProcessingStatus)
                        .SingleAsync());

                await db.MemberPackages
                    .Where(
                        x =>
                            x.MemberPackageId ==
                            pendingPackageId)
                    .ExecuteUpdateAsync(
                        p =>
                            p.SetProperty(
                                x =>
                                    x.Status,
                                MemberPackageStatus.PendingPayment));

                return 0;
            });

        using (var scope =
               factory.Services.CreateScope())
        {
            await scope.ServiceProvider
                .GetRequiredService<PaymentReconciliationService>()
                .RetryPendingAsync(
                    default);
        }

        await factory.QueryAsync(
            async db =>
            {
                Assert.Equal(
                    InvoiceStatus.Paid,
                    await db.Invoices
                        .Where(
                            x =>
                                x.InvoiceId ==
                                checkout.InvoiceId)
                        .Select(
                            x =>
                                x.Status)
                        .SingleAsync());

                Assert.Equal(
                    1,
                    await db.Payments
                        .CountAsync(
                            x =>
                                x.InvoiceId ==
                                checkout.InvoiceId));

                Assert.Equal(
                    0,
                    await db.PointWallets
                        .Where(
                            x =>
                                x.OwnerUserId ==
                                context.MemberId)
                        .Select(
                            x =>
                                x.HeldPoints)
                        .SingleAsync());

                return 0;
            });
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task Class_checkout_reserves_one_seat_and_converts_only_after_verified_payment(
        bool late)
    {
        var context = await SeedAsync();

        var manager =
            await factory.SeedUserAsync(
                UserRole.CenterManager);

        var coach =
            await factory.SeedUserAsync(
                UserRole.Coach);

        int classId;

        using (var scope =
               factory.Services.CreateScope())
        {
            var db =
                scope.ServiceProvider
                    .GetRequiredService<SportHubDbContext>();

            var room =
                new Room
                {
                    Name =
                        "Checkout-room-" +
                        Guid.NewGuid()
                            .ToString("N"),

                    Capacity =
                        5,

                    RoomTypeId =
                        3
                };

            db.Rooms.Add(
                room);

            await db.SaveChangesAsync();

            db.RoomOpeningHours.AddRange(
                Enumerable
                    .Range(0, 7)
                    .Select(
                        day =>
                            new RoomOpeningHour
                            {
                                RoomId =
                                    room.RoomId,

                                DayOfWeek =
                                    day,

                                OpenTimeLocal =
                                    new(6, 0),

                                CloseTimeLocal =
                                    new(22, 0)
                            }));

            db.UserSportSpecialties.Add(
                new UserSportSpecialty
                {
                    UserId =
                        coach.UserId,

                    SportId =
                        3
                });

            db.CoachProfiles.Add(
                new CoachProfile
                {
                    UserId =
                        coach.UserId
                });

            await db.SaveChangesAsync();

            var start =
                VietnamTime.TodayLocal(scope.ServiceProvider.GetRequiredService<IClock>()).AddDays(30);

            var classService =
                scope.ServiceProvider
                    .GetRequiredService<IClassService>();

            var created =
                await classService.CreateAsync(
                    new SaveClassRequest
                    {
                        Code =
                            "CHECKOUT-" +
                            Guid.NewGuid()
                                .ToString("N"),

                        Name =
                            "Checkout class",

                        SportId =
                            3,

                        CoachId =
                            coach.UserId,

                        DefaultRoomId =
                            room.RoomId,

                        StartDate =
                            start,

                        NumSessions =
                            3,

                        Capacity =
                            1,

                        Price =
                            100_000m,

                        CostAmount =
                            0,

                        ScheduleRules =
                        [
                            new()
                            {
                                DayOfWeek =
                                    (int)start.DayOfWeek,

                                StartTimeLocal =
                                    "09:00"
                            }
                        ]
                    },
                    manager.UserId);

            await classService.PublishAsync(
                created.ClassId,
                new(),
                manager.UserId);

            await classService.SetEnrollmentOpenAsync(
                created.ClassId,
                true,
                manager.UserId);

            classId =
                created.ClassId;
        }

        using var member =
            factory.CreateApiClient(
                context.MemberId,
                UserRole.Member);

        async Task<HttpResponseMessage> Create(
            string key)
        {
            using var request =
                new HttpRequestMessage(
                    HttpMethod.Post,
                    "/api/checkouts/class")
                {
                    Content =
                        JsonContent.Create(
                            new
                            {
                                classId
                            })
                };

            request.Headers.Add(
                "Idempotency-Key",
                key);

            return await member.SendAsync(
                request);
        }

        var key =
            Guid.NewGuid()
                .ToString("N");

        var first =
            await Create(key);

        Assert.Equal(
            HttpStatusCode.Created,
            first.StatusCode);

        var checkout =
            (await first.Content
                .ReadFromJsonAsync<CheckoutResponse>())!;

        Assert.Equal(
            checkout.InvoiceId,
            (
                await (
                    await Create(key)
                ).Content
                    .ReadFromJsonAsync<CheckoutResponse>()
            )!.InvoiceId);

        var resumedResponse = await Create(Guid.NewGuid().ToString("N"));
        Assert.Equal(HttpStatusCode.Created, resumedResponse.StatusCode);
        var resumed = (await resumedResponse.Content.ReadFromJsonAsync<CheckoutResponse>())!;
        Assert.Equal(checkout.InvoiceId, resumed.InvoiceId);
        Assert.Equal(checkout.CheckoutSessionId, resumed.CheckoutSessionId);
        Assert.InRange(
            (checkout.ExpiresAtUtc - resumed.ExpiresAtUtc).Duration(),
            TimeSpan.Zero,
            TimeSpan.FromMilliseconds(1));

        Assert.Equal(
            0,
            await factory.QueryAsync(
                db =>
                    db.Enrollments.CountAsync(
                        x =>
                            x.MemberId ==
                                context.MemberId &&
                            x.ClassId ==
                                classId)));

        var attempt =
            (await (
                    await member.PostAsync(
                        $"/api/checkouts/{checkout.InvoiceId}/attempts",
                        null)
                )
                .Content
                .ReadFromJsonAsync<PaymentAttemptResponse>())!;

        if (late)
        {
            await factory.QueryAsync(
                async db =>
                {
                    await db.Invoices
                        .Where(
                            x =>
                                x.InvoiceId ==
                                checkout.InvoiceId)
                        .ExecuteUpdateAsync(
                            s =>
                                s.SetProperty(
                                    x =>
                                        x.HoldExpiresAtUtc,
                                    DateTime.UtcNow
                                        .AddMinutes(-1)));

                    await db.CheckoutSessions
                        .Where(
                            x =>
                                x.CheckoutSessionId ==
                                checkout.CheckoutSessionId)
                        .ExecuteUpdateAsync(
                            s =>
                                s.SetProperty(
                                    x =>
                                        x.ExpiresAtUtc,
                                    DateTime.UtcNow
                                        .AddMinutes(-1)));

                    return 0;
                });

            using var scope =
                factory.Services.CreateScope();

            await scope.ServiceProvider
                .GetRequiredService<CheckoutExpiryService>()
                .ExpireDueAsync(
                    default);
        }

        using var receptionist =
            factory.CreateApiClient(
                context.ReceptionistId,
                UserRole.Receptionist);

        Assert.Equal(
            HttpStatusCode.OK,
            (
                await receptionist.PostAsync(
                    $"/api/dev/payments/{attempt.TransactionReference}/simulate",
                    null)
            ).StatusCode);

        var result =
            (await member.GetFromJsonAsync<CheckoutResponse>(
                $"/api/checkouts/{checkout.InvoiceId}"))!;

        Assert.Equal(
            late
                ? "PaidAfterReconciliation"
                : "Paid",
            result.InvoiceStatus);

        Assert.Equal(
            "Fulfilled",
            result.FulfillmentOutcome);

        await factory.QueryAsync(
            async db =>
            {
                Assert.Equal(
                    1,
                    await db.Enrollments
                        .CountAsync(
                            x =>
                                x.MemberId ==
                                    context.MemberId &&
                                x.ClassId ==
                                    classId &&
                                x.Status ==
                                    EnrollmentStatus.Confirmed));

                Assert.Equal(
                    1,
                    await db.Classes
                        .Where(
                            x =>
                                x.ClassId ==
                                classId)
                        .Select(
                            x =>
                                x.ReservedCount)
                        .SingleAsync());

                // Học viên đã ghi danh thành quan hệ huấn luyện ClassBased với Coach của lớp.
                Assert.True(
                    await db.Set<SportHub.Training.Domain.Entities.CoachMemberRelationship>()
                        .AnyAsync(
                            r =>
                                r.CoachId == coach.UserId &&
                                r.MemberId == context.MemberId &&
                                r.ClassId == classId &&
                                r.Status == SportHub.Training.Domain.Enums.RelationshipStatus.Active &&
                                r.SourceType == SportHub.Training.Domain.Enums.RelationshipSourceType.ClassBased));

                return 0;
            });
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task Member_cancelling_a_class_far_from_start_gets_full_points_and_frees_the_seat(bool makeupOnly)
    {
        var context = await SeedAsync();

        var manager =
            await factory.SeedUserAsync(
                UserRole.CenterManager);

        var coach =
            await factory.SeedUserAsync(
                UserRole.Coach);

        int classId;

        using (var scope =
               factory.Services.CreateScope())
        {
            var db =
                scope.ServiceProvider
                    .GetRequiredService<SportHubDbContext>();

            var room =
                new Room
                {
                    Name =
                        "Cancel-room-" +
                        Guid.NewGuid()
                            .ToString("N"),

                    Capacity =
                        5,

                    RoomTypeId =
                        3
                };

            db.Rooms.Add(
                room);

            await db.SaveChangesAsync();

            db.RoomOpeningHours.AddRange(
                Enumerable
                    .Range(0, 7)
                    .Select(
                        day =>
                            new RoomOpeningHour
                            {
                                RoomId =
                                    room.RoomId,

                                DayOfWeek =
                                    day,

                                OpenTimeLocal =
                                    new(6, 0),

                                CloseTimeLocal =
                                    new(22, 0)
                            }));

            db.UserSportSpecialties.Add(
                new UserSportSpecialty
                {
                    UserId =
                        coach.UserId,

                    SportId =
                        3
                });

            db.CoachProfiles.Add(
                new CoachProfile
                {
                    UserId =
                        coach.UserId
                });

            await db.SaveChangesAsync();

            var start =
                VietnamTime.TodayLocal(scope.ServiceProvider.GetRequiredService<IClock>()).AddDays(30);

            var classService =
                scope.ServiceProvider
                    .GetRequiredService<IClassService>();

            var created =
                await classService.CreateAsync(
                    new SaveClassRequest
                    {
                        Code =
                            "CANCEL-" +
                            Guid.NewGuid()
                                .ToString("N"),

                        Name =
                            "Cancel class",

                        SportId =
                            3,

                        CoachId =
                            coach.UserId,

                        DefaultRoomId =
                            room.RoomId,

                        StartDate =
                            start,

                        NumSessions =
                            3,

                        Capacity =
                            1,

                        Price =
                            100_000m,

                        CostAmount =
                            0,

                        ScheduleRules =
                        [
                            new()
                            {
                                DayOfWeek =
                                    (int)start.DayOfWeek,

                                StartTimeLocal =
                                    "09:00"
                            }
                        ]
                    },
                    manager.UserId);

            await classService.PublishAsync(
                created.ClassId,
                new(),
                manager.UserId);

            await classService.SetEnrollmentOpenAsync(
                created.ClassId,
                true,
                manager.UserId);

            classId =
                created.ClassId;
        }

        using var member =
            factory.CreateApiClient(
                context.MemberId,
                UserRole.Member);

        using var request =
            new HttpRequestMessage(
                HttpMethod.Post,
                "/api/checkouts/class")
            {
                Content =
                    JsonContent.Create(
                        new
                        {
                            classId
                        })
            };

        request.Headers.Add(
            "Idempotency-Key",
            Guid.NewGuid()
                .ToString("N"));

        var checkoutResponse =
            await member.SendAsync(
                request);

        Assert.Equal(
            HttpStatusCode.Created,
            checkoutResponse.StatusCode);

        var checkout =
            (await checkoutResponse.Content
                .ReadFromJsonAsync<CheckoutResponse>())!;

        var attemptResponse =
            await member.PostAsync(
                $"/api/checkouts/{checkout.InvoiceId}/attempts",
                null);

        Assert.Equal(
            HttpStatusCode.OK,
            attemptResponse.StatusCode);

        var attempt =
            (await attemptResponse.Content
                .ReadFromJsonAsync<PaymentAttemptResponse>())!;

        using var receptionist =
            factory.CreateApiClient(
                context.ReceptionistId,
                UserRole.Receptionist);

        var simulated =
            await receptionist.PostAsync(
                $"/api/dev/payments/{attempt.TransactionReference}/simulate",
                null);

        Assert.Equal(
            HttpStatusCode.OK,
            simulated.StatusCode);

        var itemId =
            await factory.QueryAsync(
                db =>
                    db.InvoiceItems
                        .Where(
                            x =>
                                x.InvoiceId ==
                                checkout.InvoiceId)
                        .Select(
                            x =>
                                x.ItemId)
                        .SingleAsync());

        if (makeupOnly)
            await factory.QueryAsync(async db =>
            {
                await db.ClassSessions.Where(x => x.ClassId == classId)
                    .ExecuteUpdateAsync(x => x.SetProperty(s => s.IsMakeup, true));
                return 0;
            });

        Assert.Equal(HttpStatusCode.OK,
            (await member.GetAsync($"/api/refunds/quote/{itemId}")).StatusCode);

        var stranger =
            await factory.SeedUserAsync(
                UserRole.Member);

        using var other =
            factory.CreateApiClient(
                stranger.UserId,
                UserRole.Member);

        Assert.Equal(
            HttpStatusCode.Forbidden,
            (
                await other.PostAsJsonAsync(
                    "/api/refunds/class-cancellations",
                    new
                    {
                        invoiceItemId =
                            itemId
                    })
            ).StatusCode);

        var pointsBefore =
            await factory.QueryAsync(
                db =>
                    db.PointWallets
                        .Where(
                            x =>
                                x.OwnerUserId ==
                                context.MemberId)
                        .Select(
                            x =>
                                x.AvailablePoints)
                        .SingleAsync());

        using var refundReportScope =
            factory.Services.CreateScope();

        var refundReports =
            refundReportScope.ServiceProvider
                .GetRequiredService<
                    SportHub.Payment.Application.Interfaces.IRevenueReportService>();

        var refundDay =
            DateOnly.FromDateTime(
                DateTime.UtcNow.AddHours(7));

        var refundedBefore =
            (await refundReports.GetAsync(
                refundDay,
                refundDay)).PointsRefunded;

        var cancelled =
            await member.PostAsJsonAsync(
                "/api/refunds/class-cancellations",
                new
                {
                    invoiceItemId =
                        itemId
                });

        Assert.Equal(
            HttpStatusCode.OK,
            cancelled.StatusCode);

        // A member refund is a points credit and must be counted as "points refunded".
        Assert.Equal(
            100,
            (await refundReports.GetAsync(
                refundDay,
                refundDay)).PointsRefunded -
            refundedBefore);

        Assert.Equal(
            HttpStatusCode.Conflict,
            (
                await member.PostAsJsonAsync(
                    "/api/refunds/class-cancellations",
                    new
                    {
                        invoiceItemId =
                            itemId
                    })
            ).StatusCode);

        await factory.QueryAsync(
            async db =>
            {
                Assert.Equal(
                    EnrollmentStatus.Refunded,
                    await db.Enrollments
                        .Where(
                            x =>
                                x.MemberId ==
                                    context.MemberId &&
                                x.ClassId ==
                                    classId)
                        .Select(
                            x =>
                                x.Status)
                        .SingleAsync());

                Assert.Equal(
                    0,
                    await db.Classes
                        .Where(
                            x =>
                                x.ClassId ==
                                classId)
                        .Select(
                            x =>
                                x.ConfirmedCount)
                        .SingleAsync());

                Assert.Equal(
                    pointsBefore + 100,
                    await db.PointWallets
                        .Where(
                            x =>
                                x.OwnerUserId ==
                                context.MemberId)
                        .Select(
                            x =>
                                x.AvailablePoints)
                        .SingleAsync());

                return 0;
            });
    }

    [Fact]
    public async Task Retry_after_expiry_creates_new_invoice_and_never_reuses_released_point_hold()
    {
        var context = await SeedAsync();

        using var member =
            factory.CreateApiClient(
                context.MemberId,
                UserRole.Member);

        var old =
            await CreateAsync(
                member,
                context.PackageId);

        Assert.Equal(
            HttpStatusCode.OK,
            (
                await member.PostAsJsonAsync(
                    $"/api/wallet/me/checkouts/{old.InvoiceId}/points",
                    new
                    {
                        points = 40
                    })
            ).StatusCode);

        var oldCycle =
            await factory.QueryAsync(
                db =>
                    db.Invoices
                        .Where(
                            x =>
                                x.InvoiceId ==
                                old.InvoiceId)
                        .Select(
                            x =>
                                x.CheckoutCycleId)
                        .SingleAsync());

        await factory.QueryAsync(
            async db =>
            {
                await db.Invoices
                    .Where(
                        x =>
                            x.InvoiceId ==
                            old.InvoiceId)
                    .ExecuteUpdateAsync(
                        s =>
                            s.SetProperty(
                                x =>
                                    x.HoldExpiresAtUtc,
                                DateTime.UtcNow
                                    .AddMinutes(-1)));

                await db.CheckoutSessions
                    .Where(
                        x =>
                            x.CheckoutSessionId ==
                            oldCycle)
                    .ExecuteUpdateAsync(
                        s =>
                            s.SetProperty(
                                x =>
                                    x.ExpiresAtUtc,
                                DateTime.UtcNow
                                    .AddMinutes(-1)));

                return 0;
            });

        using (var scope =
               factory.Services.CreateScope())
        {
            await scope.ServiceProvider
                .GetRequiredService<CheckoutExpiryService>()
                .ExpireDueAsync(
                    default);
        }

        var key =
            Guid.NewGuid()
                .ToString("N");

        async Task<CheckoutResponse> Retry()
        {
            using var request =
                new HttpRequestMessage(
                    HttpMethod.Post,
                    $"/api/checkouts/{old.InvoiceId}/retry")
                {
                    Content =
                        JsonContent.Create(
                            new
                            {
                            })
                };

            request.Headers.Add(
                "Idempotency-Key",
                key);

            var response =
                await member.SendAsync(
                    request);

            Assert.Equal(
                HttpStatusCode.Created,
                response.StatusCode);

            return (
                await response.Content
                    .ReadFromJsonAsync<CheckoutResponse>())!;
        }

        var renewed =
            await Retry();

        Assert.NotEqual(
            old.InvoiceId,
            renewed.InvoiceId);

        Assert.NotEqual(
            oldCycle,
            renewed.CheckoutSessionId);

        Assert.Equal(
            renewed.InvoiceId,
            (
                await Retry()
            ).InvoiceId);

        Assert.Equal(
            100,
            await factory.QueryAsync(
                db =>
                    db.PointWallets
                        .Where(
                            x =>
                                x.OwnerUserId ==
                                context.MemberId)
                        .Select(
                            x =>
                                x.AvailablePoints)
                        .SingleAsync()));

        Assert.Equal(
            0,
            await factory.QueryAsync(
                db =>
                    db.PointWallets
                        .Where(
                            x =>
                                x.OwnerUserId ==
                                context.MemberId)
                        .Select(
                            x =>
                                x.HeldPoints)
                        .SingleAsync()));
    }
}
