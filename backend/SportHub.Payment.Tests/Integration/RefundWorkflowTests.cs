using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using SportHub.Identity.Domain.Enums;
using SportHub.Membership.Domain.Entities;
using SportHub.Membership.Domain.Enums;
using SportHub.Membership.Domain;
using SportHub.Payment.Domain.Entities;
using SportHub.Payment.Domain.Enums;
using SportHub.Payment.Wallet.Domain;

namespace SportHub.Payment.Tests.Integration;

[Collection(nameof(PaymentApiCollection))]
public sealed class RefundWorkflowTests(PaymentApiFactory factory)
{
    private sealed record Fixture(Guid MemberId, Guid ReceptionistId, Guid ManagerId,
        Guid InvoiceId, Guid InvoiceItemId, Guid MemberPackageId);

    private async Task<Fixture> SeedPaidMembershipAsync()
    {
        var member = await factory.SeedUserAsync(UserRole.Member);
        var receptionist = await factory.SeedUserAsync(UserRole.Receptionist);
        var manager = await factory.SeedUserAsync(UserRole.CenterManager);
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SportHub.API.Persistence.SportHubDbContext>();
        var today = DateOnly.FromDateTime(DateTime.UtcNow.AddHours(7));
        var catalog = new MembershipPackage
        {
            Name = $"Refund package {Guid.NewGuid():N}", Price = 1_000_000, DurationDays = 90,
            SessionLimit = 30, IsActive = true
        };
        db.MembershipPackages.Add(catalog);
        await db.SaveChangesAsync();
        var invoiceId = Guid.NewGuid();
        var itemId = Guid.NewGuid();
        var packageId = Guid.NewGuid();
        var package = new MemberPackage
        {
            MemberPackageId = packageId, MemberId = member.UserId, PackageId = catalog.PackageId,
            StartDate = today.AddDays(-10), EndDate = today.AddDays(80), RemainingSessions = 30,
            Status = MemberPackageStatus.Active
        };
        var invoice = new Invoice
        {
            InvoiceId = invoiceId, InvoiceNumber = $"RF-{Guid.NewGuid():N}"[..20], MemberId = member.UserId,
            IssuedByUserId = receptionist.UserId, MemberPackageId = packageId, TotalAmount = 1_000_000,
            CashAmount = 1_000_000, Status = InvoiceStatus.Paid, IssuedAt = DateTime.UtcNow,
            PaidAtUtc = DateTime.UtcNow, PaidVia = "VnPay"
        };
        var item = new InvoiceItem
        {
            ItemId = itemId, InvoiceId = invoiceId, ItemType = InvoiceItemType.Membership,
            Description = catalog.Name, UnitPrice = 1_000_000, Quantity = 1, LineAmount = 1_000_000,
            RelatedEntityId = packageId
        };
        invoice.Items.Add(item);
        db.MemberPackages.Add(package);
        db.Invoices.Add(invoice);
        db.Payments.Add(new SportHub.Payment.Domain.Entities.Payment
        {
            PaymentId = Guid.NewGuid(), InvoiceId = invoiceId, Amount = 1_000_000,
            Method = PaymentMethod.VnPay, ReferenceCode = Guid.NewGuid().ToString("N"),
            Status = PaymentStatus.Success, ReceivedByUserId = receptionist.UserId, PaidAt = DateTime.UtcNow
        });
        await db.SaveChangesAsync();
        package.InvoiceItemId = itemId;
        await db.SaveChangesAsync();
        return new Fixture(member.UserId, receptionist.UserId, manager.UserId, invoiceId, itemId, packageId);
    }

    [Fact]
    public async Task Refund_quote_is_owner_scoped_and_parallel_requests_create_one_pending_refund()
    {
        var fixture = await SeedPaidMembershipAsync();
        using var member = factory.CreateApiClient(fixture.MemberId, UserRole.Member);
        Assert.Equal(HttpStatusCode.OK, (await member.GetAsync($"/api/refunds/quote/{fixture.InvoiceItemId}")).StatusCode);
        var stranger = await factory.SeedUserAsync(UserRole.Member);
        using var other = factory.CreateApiClient(stranger.UserId, UserRole.Member);
        Assert.Equal(HttpStatusCode.Forbidden, (await other.GetAsync($"/api/refunds/quote/{fixture.InvoiceItemId}")).StatusCode);
        var responses = await Task.WhenAll(Enumerable.Range(0, 2).Select(_ => member.PostAsJsonAsync("/api/refunds", new { invoiceItemId = fixture.InvoiceItemId, reason = "Member refund request" })));
        Assert.All(responses, response => Assert.Equal(HttpStatusCode.OK, response.StatusCode));
        Assert.Equal(1, await factory.QueryAsync(db => db.PaymentAdjustments.CountAsync(a => a.InvoiceItemId == fixture.InvoiceItemId && a.Status == PaymentAdjustmentStatus.Requested)));
    }

    [Fact]
    public async Task Member_refund_history_contains_only_their_own_requests()
    {
        var fixture = await SeedPaidMembershipAsync();
        using var member = factory.CreateApiClient(fixture.MemberId, UserRole.Member);
        var stranger = await factory.SeedUserAsync(UserRole.Member);
        using var other = factory.CreateApiClient(stranger.UserId, UserRole.Member);
        using var staff = factory.CreateApiClient(fixture.ReceptionistId, UserRole.Receptionist);

        var created = await member.PostAsJsonAsync("/api/refunds",
            new { invoiceItemId = fixture.InvoiceItemId, reason = "Kiểm tra lịch sử hoàn điểm" });
        Assert.Equal(HttpStatusCode.OK, created.StatusCode);

        var mine = await member.GetFromJsonAsync<JsonElement>("/api/refunds/mine");
        var others = await other.GetFromJsonAsync<JsonElement>("/api/refunds/mine");
        Assert.Equal(1, mine.GetProperty("totalCount").GetInt32());
        Assert.Equal(fixture.InvoiceId, mine.GetProperty("items")[0].GetProperty("invoiceId").GetGuid());
        Assert.Equal(0, others.GetProperty("totalCount").GetInt32());
        Assert.Equal(HttpStatusCode.Forbidden, (await staff.GetAsync("/api/refunds/mine")).StatusCode);
    }

    [Fact]
    public async Task Member_request_then_manager_approval_credits_points_and_cancels_membership_atomically()
    {
        var fixture = await SeedPaidMembershipAsync();
        var memberClient = factory.CreateApiClient(fixture.MemberId, UserRole.Member);
        var managerClient = factory.CreateApiClient(fixture.ManagerId, UserRole.CenterManager);
        var createdResponse = await memberClient.PostAsJsonAsync("/api/refunds",
            new { invoiceItemId = fixture.InvoiceItemId, reason = "Yêu cầu hoàn theo chính sách Membership" });
        Assert.Equal(HttpStatusCode.OK, createdResponse.StatusCode);
        var requested = (await createdResponse.Content.ReadFromJsonAsync<RefundResponse>())!;
        Assert.Equal("REQUESTED", requested.Status);
        Assert.Equal(500, requested.SystemCalculatedPoints);
        Assert.Equal(fixture.InvoiceItemId, requested.InvoiceItemId);

        var approvedResponse = await managerClient.PostAsJsonAsync($"/api/refunds/{requested.AdjustmentId}/approve",
            new { reason = "Đủ điều kiện hoàn 50%" });
        Assert.Equal(HttpStatusCode.OK, approvedResponse.StatusCode);
        var approved = (await approvedResponse.Content.ReadFromJsonAsync<RefundResponse>())!;
        Assert.Equal("COMPLETED", approved.Status);
        Assert.Equal(500, approved.ApprovedPoints);
        Assert.NotNull(approved.PointLedgerEntryId);
        Assert.Null(approved.RefundMethod);

        var state = await factory.QueryAsync(async db => new
        {
            PackageStatus = await db.MemberPackages.Where(x => x.MemberPackageId == fixture.MemberPackageId)
                .Select(x => x.Status).SingleAsync(),
            Wallet = await db.Set<PointWallet>().SingleAsync(x => x.OwnerUserId == fixture.MemberId),
            Ledger = await db.Set<PointLedgerEntry>().CountAsync(x => x.ReferenceType == "PaymentAdjustment"
                && x.ReferenceId == requested.AdjustmentId && x.EntryType == PointEntryType.Earn),
            Adjustment = await db.PaymentAdjustments.SingleAsync(x => x.AdjustmentId == requested.AdjustmentId)
        });
        Assert.Equal(MemberPackageStatus.Cancelled, state.PackageStatus);
        Assert.Equal(500, state.Wallet.AvailablePoints);
        Assert.Equal(1, state.Ledger);
        Assert.Equal(state.Ledger == 1 ? approved.PointLedgerEntryId : null, state.Adjustment.PointLedgerEntryId);

        var retry = await managerClient.PostAsJsonAsync($"/api/refunds/{requested.AdjustmentId}/approve",
            new { reason = "Thử duyệt lại" });
        Assert.Equal(HttpStatusCode.Conflict, retry.StatusCode);
        var ledgerCount = await factory.QueryAsync(db => db.Set<PointLedgerEntry>()
            .CountAsync(x => x.ReferenceType == "PaymentAdjustment" && x.ReferenceId == requested.AdjustmentId));
        Assert.Equal(1, ledgerCount);
    }

    [Theory]
    [InlineData(51)]
    [InlineData(100)]
    public async Task Manager_cannot_approve_more_than_the_membership_rule_allows(int percent)
    {
        var fixture = await SeedPaidMembershipAsync();
        using var member = factory.CreateApiClient(fixture.MemberId, UserRole.Member);
        using var manager = factory.CreateApiClient(fixture.ManagerId, UserRole.CenterManager);
        var created = await member.PostAsJsonAsync("/api/refunds",
            new { invoiceItemId = fixture.InvoiceItemId, reason = "Membership refund review" });
        Assert.Equal(HttpStatusCode.OK, created.StatusCode);
        var request = (await created.Content.ReadFromJsonAsync<RefundResponse>())!;

        var excessive = await manager.PostAsJsonAsync($"/api/refunds/{request.AdjustmentId}/approve",
            new { reason = "Try to exceed the system-calculated amount", percent });
        Assert.Equal(HttpStatusCode.Conflict, excessive.StatusCode);
        Assert.Contains("refund_exceeds_system_limit", await excessive.Content.ReadAsStringAsync());
        Assert.Equal(MemberPackageStatus.Active, await factory.QueryAsync(db => db.MemberPackages
            .Where(x => x.MemberPackageId == fixture.MemberPackageId).Select(x => x.Status).SingleAsync()));
        Assert.Equal(0, await factory.QueryAsync(db => db.Set<PointLedgerEntry>()
            .CountAsync(x => x.ReferenceType == "PaymentAdjustment" && x.ReferenceId == request.AdjustmentId)));
        Assert.Equal(PaymentAdjustmentStatus.Requested, await factory.QueryAsync(db => db.PaymentAdjustments
            .Where(x => x.AdjustmentId == request.AdjustmentId).Select(x => x.Status).SingleAsync()));
        Assert.Equal(0, await factory.QueryAsync(db => db.Set<PointWallet>()
            .Where(x => x.OwnerUserId == fixture.MemberId).SumAsync(x => x.AvailablePoints)));
    }

    [Theory]
    [InlineData(25, 250)]
    [InlineData(50, 500)]
    public async Task Manager_can_approve_at_or_below_the_quoted_limit(int percent, int expectedPoints)
    {
        var fixture = await SeedPaidMembershipAsync();
        using var member = factory.CreateApiClient(fixture.MemberId, UserRole.Member);
        using var manager = factory.CreateApiClient(fixture.ManagerId, UserRole.CenterManager);
        var created = await member.PostAsJsonAsync("/api/refunds",
            new { invoiceItemId = fixture.InvoiceItemId, reason = "Membership refund review" });
        created.EnsureSuccessStatusCode();
        var request = (await created.Content.ReadFromJsonAsync<RefundResponse>())!;
        var quoteUrl = $"/api/refunds/{request.AdjustmentId}/approval-quote";
        Assert.Equal(HttpStatusCode.Forbidden, (await member.GetAsync(quoteUrl)).StatusCode);
        var quote = await manager.GetFromJsonAsync<JsonElement>(quoteUrl);
        Assert.Equal(500, quote.GetProperty("systemCalculatedPoints").GetInt32());
        Assert.Equal(1_000_000m, quote.GetProperty("remainingPaidVnd").GetDecimal());
        Assert.Equal(50, quote.GetProperty("maxPercent").GetInt32());
        var centerQuote = await manager.GetFromJsonAsync<JsonElement>(quoteUrl + "?centerFault=true");
        Assert.True(centerQuote.GetProperty("centerFault").GetBoolean());
        Assert.Equal(890, centerQuote.GetProperty("systemCalculatedPoints").GetInt32());
        Assert.Equal(89, centerQuote.GetProperty("maxPercent").GetInt32());
        var approved = await manager.PostAsJsonAsync($"/api/refunds/{request.AdjustmentId}/approve",
            new { reason = "Approve within the calculated limit", percent });
        approved.EnsureSuccessStatusCode();
        Assert.Equal(expectedPoints, (await approved.Content.ReadFromJsonAsync<RefundResponse>())!.ApprovedPoints);
        Assert.Equal(expectedPoints, await factory.QueryAsync(db => db.Set<PointWallet>()
            .Where(x => x.OwnerUserId == fixture.MemberId).Select(x => x.AvailablePoints).SingleAsync()));
    }

    [Theory]
    [InlineData(30, 30, 500)]
    [InlineData(30, 0, 500)]
    [InlineData(31, 30, 0)]
    [InlineData(31, 0, 0)]
    [InlineData(90, 30, 0)]
    [InlineData(-10, 30, 500)]
    public async Task Membership_standard_refund_uses_inclusive_term_not_gym_visits(
        int elapsedDays, int remainingSessions, int expectedPoints)
    {
        var fixture = await SeedPaidMembershipAsync();
        var today = DateOnly.FromDateTime(DateTime.UtcNow.AddHours(7));
        var start = today.AddDays(-elapsedDays);
        await factory.QueryAsync(db => db.MemberPackages.Where(x => x.MemberPackageId == fixture.MemberPackageId)
            .ExecuteUpdateAsync(s => s.SetProperty(x => x.StartDate, start)
                .SetProperty(x => x.EndDate, start.AddDays(89))
                .SetProperty(x => x.RemainingSessions, remainingSessions)));
        using var member = factory.CreateApiClient(fixture.MemberId, UserRole.Member);
        using var manager = factory.CreateApiClient(fixture.ManagerId, UserRole.CenterManager);
        var quote = await member.GetFromJsonAsync<JsonElement>($"/api/refunds/quote/{fixture.InvoiceItemId}");
        Assert.Equal(expectedPoints, quote.GetProperty("systemCalculatedPoints").GetInt32());
        if (expectedPoints == 0)
        {
            var cancellation = await member.PostAsJsonAsync("/api/refunds/membership-cancellations",
                new { invoiceItemId = fixture.InvoiceItemId });
            Assert.Equal(HttpStatusCode.Conflict, cancellation.StatusCode);
            Assert.Contains("refund_points_zero", await cancellation.Content.ReadAsStringAsync());
        }
        var created = await member.PostAsJsonAsync("/api/refunds",
            new { invoiceItemId = fixture.InvoiceItemId, reason = "Review the membership term" });
        created.EnsureSuccessStatusCode();
        var request = (await created.Content.ReadFromJsonAsync<RefundResponse>())!;
        Assert.Equal(expectedPoints, request.SystemCalculatedPoints);
        var reviewQuote = await manager.GetFromJsonAsync<JsonElement>($"/api/refunds/{request.AdjustmentId}/approval-quote");
        Assert.Equal(expectedPoints, reviewQuote.GetProperty("systemCalculatedPoints").GetInt32());
        var approved = await manager.PostAsJsonAsync($"/api/refunds/{request.AdjustmentId}/approve",
            new { reason = "Apply the standard term policy", percent = 50 });
        Assert.Equal(expectedPoints > 0 ? HttpStatusCode.OK : HttpStatusCode.Conflict, approved.StatusCode);
        if (expectedPoints == 0)
            Assert.Contains("refund_exceeds_system_limit", await approved.Content.ReadAsStringAsync());
        Assert.Equal(expectedPoints, await factory.QueryAsync(db => db.Set<PointWallet>()
            .Where(x => x.OwnerUserId == fixture.MemberId).SumAsync(x => x.AvailablePoints)));
        Assert.Equal(expectedPoints > 0 ? MemberPackageStatus.Cancelled : MemberPackageStatus.Active,
            await factory.QueryAsync(db => db.MemberPackages.Where(x => x.MemberPackageId == fixture.MemberPackageId)
                .Select(x => x.Status).SingleAsync()));
    }

    [Theory]
    [InlineData(false, 500)]
    [InlineData(true, 0)]
    public async Task Center_fault_refunds_only_the_unused_inclusive_term_and_never_an_expired_package(
        bool expired, int expectedPoints)
    {
        var fixture = await SeedPaidMembershipAsync();
        var today = DateOnly.FromDateTime(DateTime.UtcNow.AddHours(7));
        await factory.QueryAsync(db => db.MemberPackages.Where(x => x.MemberPackageId == fixture.MemberPackageId)
            .ExecuteUpdateAsync(s => s.SetProperty(x => x.StartDate, today.AddDays(-45))
                .SetProperty(x => x.EndDate, today.AddDays(44))
                .SetProperty(x => x.Status, expired ? MemberPackageStatus.Expired : MemberPackageStatus.Active)));
        using var member = factory.CreateApiClient(fixture.MemberId, UserRole.Member);
        using var manager = factory.CreateApiClient(fixture.ManagerId, UserRole.CenterManager);
        var created = await member.PostAsJsonAsync("/api/refunds",
            new { invoiceItemId = fixture.InvoiceItemId, reason = "Center permanently stopped providing the service" });
        created.EnsureSuccessStatusCode();
        var request = (await created.Content.ReadFromJsonAsync<RefundResponse>())!;
        Assert.Equal(0, request.SystemCalculatedPoints); // 45/90 remaining is below the standard threshold.
        var reviewQuote = await manager.GetFromJsonAsync<JsonElement>(
            $"/api/refunds/{request.AdjustmentId}/approval-quote?centerFault=true");
        Assert.Equal(expectedPoints, reviewQuote.GetProperty("systemCalculatedPoints").GetInt32());
        var approved = await manager.PostAsJsonAsync($"/api/refunds/{request.AdjustmentId}/approve",
            new { reason = "Center permanently discontinued the service; 45 of 90 days remain", centerFault = true });
        Assert.Equal(expired ? HttpStatusCode.Conflict : HttpStatusCode.OK, approved.StatusCode);
        if (expired) Assert.Contains("refund_points_zero", await approved.Content.ReadAsStringAsync());
        Assert.Equal(expectedPoints, await factory.QueryAsync(db => db.Set<PointWallet>()
            .Where(x => x.OwnerUserId == fixture.MemberId).SumAsync(x => x.AvailablePoints)));
    }

    [Theory]
    [InlineData(16, 500)] // 23:00 yesterday in Vietnam: exactly 60/90 remain.
    [InlineData(18, 0)] // 01:00 today in Vietnam: only 59/90 remain.
    public async Task Approval_uses_the_request_Vietnam_date_even_when_reviewed_later(int utcHour, int expectedPoints)
    {
        var fixture = await SeedPaidMembershipAsync();
        var today = DateOnly.FromDateTime(DateTime.UtcNow.AddHours(7));
        await factory.QueryAsync(db => db.MemberPackages.Where(x => x.MemberPackageId == fixture.MemberPackageId)
            .ExecuteUpdateAsync(s => s.SetProperty(x => x.StartDate, today.AddDays(-31))
                .SetProperty(x => x.EndDate, today.AddDays(58))));
        using var member = factory.CreateApiClient(fixture.MemberId, UserRole.Member);
        using var manager = factory.CreateApiClient(fixture.ManagerId, UserRole.CenterManager);
        var created = await member.PostAsJsonAsync("/api/refunds",
            new { invoiceItemId = fixture.InvoiceItemId, reason = "Review eligibility on the request date" });
        created.EnsureSuccessStatusCode();
        var request = (await created.Content.ReadFromJsonAsync<RefundResponse>())!;
        var requestedAt = today.AddDays(-1).ToDateTime(new TimeOnly(utcHour, 0), DateTimeKind.Utc);
        await factory.QueryAsync(db => db.PaymentAdjustments.Where(x => x.AdjustmentId == request.AdjustmentId)
            .ExecuteUpdateAsync(s => s.SetProperty(x => x.CreatedAt, requestedAt)));
        var quote = await manager.GetFromJsonAsync<JsonElement>($"/api/refunds/{request.AdjustmentId}/approval-quote");
        Assert.Equal(expectedPoints, quote.GetProperty("systemCalculatedPoints").GetInt32());
        var approved = await manager.PostAsJsonAsync($"/api/refunds/{request.AdjustmentId}/approve",
            new { reason = "Use the Vietnam date of the submitted request" });
        Assert.Equal(expectedPoints > 0 ? HttpStatusCode.OK : HttpStatusCode.Conflict, approved.StatusCode);
        Assert.Equal(expectedPoints, await factory.QueryAsync(db => db.Set<PointWallet>()
            .Where(x => x.OwnerUserId == fixture.MemberId).SumAsync(x => x.AvailablePoints)));
    }

    [Fact]
    public async Task Day_pass_cannot_enter_any_point_refund_path()
    {
        var fixture = await SeedPaidMembershipAsync();
        using var member = factory.CreateApiClient(fixture.MemberId, UserRole.Member);
        using var manager = factory.CreateApiClient(fixture.ManagerId, UserRole.CenterManager);
        // Simulate a pending request from old/imported data before identifying the item as a day pass.
        var created = await member.PostAsJsonAsync("/api/refunds",
            new { invoiceItemId = fixture.InvoiceItemId, reason = "Pending request for review" });
        created.EnsureSuccessStatusCode();
        var pending = (await created.Content.ReadFromJsonAsync<RefundResponse>())!;
        var today = DateOnly.FromDateTime(DateTime.UtcNow.AddHours(7));
        await factory.QueryAsync(async db =>
        {
            await db.MemberPackages.Where(x => x.MemberPackageId == fixture.MemberPackageId)
                .ExecuteUpdateAsync(s => s.SetProperty(x => x.PackageId, DayPass.PackageId)
                    .SetProperty(x => x.StartDate, today).SetProperty(x => x.EndDate, today));
            return 0;
        });
        foreach (var response in new[]
        {
            await member.GetAsync($"/api/refunds/quote/{fixture.InvoiceItemId}"),
            await member.PostAsJsonAsync("/api/refunds",
                new { invoiceItemId = fixture.InvoiceItemId, reason = "Request day-pass points" }),
            await member.PostAsJsonAsync("/api/refunds/membership-cancellations",
                new { invoiceItemId = fixture.InvoiceItemId }),
            await manager.GetAsync($"/api/refunds/{pending.AdjustmentId}/approval-quote?centerFault=true"),
            await manager.PostAsJsonAsync($"/api/refunds/{pending.AdjustmentId}/approve",
                new { reason = "Approve an imported day pass request", percent = 100, centerFault = false }),
            await manager.PostAsJsonAsync($"/api/refunds/{pending.AdjustmentId}/approve",
                new { reason = "Center fault cannot override the day pass restriction", percent = 100, centerFault = true })
        })
        {
            Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
            Assert.Contains("day_pass_non_refundable", await response.Content.ReadAsStringAsync());
        }
        Assert.Equal(0, await factory.QueryAsync(db => db.Set<PointWallet>()
            .Where(x => x.OwnerUserId == fixture.MemberId).SumAsync(x => x.AvailablePoints)));
        Assert.Equal(0, await factory.QueryAsync(db => db.Set<PointLedgerEntry>()
            .CountAsync(x => x.ReferenceType == "PaymentAdjustment" && x.ReferenceId == pending.AdjustmentId)));
        Assert.Equal(MemberPackageStatus.Active, await factory.QueryAsync(db => db.MemberPackages
            .Where(x => x.MemberPackageId == fixture.MemberPackageId).Select(x => x.Status).SingleAsync()));
        Assert.Equal(PaymentAdjustmentStatus.Requested, await factory.QueryAsync(db => db.PaymentAdjustments
            .Where(x => x.AdjustmentId == pending.AdjustmentId).Select(x => x.Status).SingleAsync()));
    }

    [Fact]
    public async Task Member_cancelling_membership_with_two_thirds_left_gets_half_back_and_is_blocked_by_a_queued_renewal()
    {
        var fixture = await SeedPaidMembershipAsync();
        using var memberClient = factory.CreateApiClient(fixture.MemberId, UserRole.Member);
        var renewalId = Guid.NewGuid();
        await factory.QueryAsync(async db =>
        {
            var current = await db.MemberPackages.SingleAsync(x => x.MemberPackageId == fixture.MemberPackageId);
            var today = DateOnly.FromDateTime(DateTime.UtcNow.AddHours(7));
            current.StartDate = today.AddDays(-30);
            current.EndDate = today.AddDays(59); // Exactly 60/90 calendar days remain.
            db.MemberPackages.Add(new MemberPackage
            {
                MemberPackageId = renewalId, MemberId = fixture.MemberId, PackageId = current.PackageId,
                StartDate = current.EndDate.AddDays(1), EndDate = current.EndDate.AddMonths(3),
                Status = MemberPackageStatus.Active
            });
            await db.SaveChangesAsync();
            return 0;
        });
        var blocked = await memberClient.PostAsJsonAsync("/api/refunds/membership-cancellations",
            new { invoiceItemId = fixture.InvoiceItemId });
        Assert.Equal(HttpStatusCode.Conflict, blocked.StatusCode);
        Assert.Contains("membership_has_renewal", await blocked.Content.ReadAsStringAsync());
        await factory.QueryAsync(async db =>
        {
            await db.MemberPackages.Where(x => x.MemberPackageId == renewalId).ExecuteDeleteAsync();
            return 0;
        });
        var done = await memberClient.PostAsJsonAsync("/api/refunds/membership-cancellations",
            new { invoiceItemId = fixture.InvoiceItemId });
        Assert.Equal(HttpStatusCode.OK, done.StatusCode);
        var state = await factory.QueryAsync(async db => new
        {
            Status = await db.MemberPackages.Where(x => x.MemberPackageId == fixture.MemberPackageId)
                .Select(x => x.Status).SingleAsync(),
            Points = await db.Set<PointWallet>().Where(x => x.OwnerUserId == fixture.MemberId)
                .Select(x => x.AvailablePoints).SingleAsync()
        });
        Assert.Equal(MemberPackageStatus.Cancelled, state.Status);
        Assert.Equal(500, state.Points);
        Assert.Equal(HttpStatusCode.Conflict, (await memberClient.PostAsJsonAsync(
            "/api/refunds/membership-cancellations", new { invoiceItemId = fixture.InvoiceItemId })).StatusCode);
    }

    [Fact]
    public async Task Different_member_cannot_request_refund_for_another_members_item()
    {
        var fixture = await SeedPaidMembershipAsync();
        var other = await factory.SeedUserAsync(UserRole.Member);
        var client = factory.CreateApiClient(other.UserId, UserRole.Member);
        var response = await client.PostAsJsonAsync("/api/refunds",
            new { invoiceItemId = fixture.InvoiceItemId, reason = "Not mine" });
        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    [Fact]
    public async Task Legacy_cash_refund_creation_and_payout_endpoint_are_not_available()
    {
        var member = await factory.SeedUserAsync(UserRole.Member);
        var receptionist = await factory.SeedUserAsync(UserRole.Receptionist);
        var invoice = await factory.SeedInvoiceAsync(member.UserId, receptionist.UserId, 1_000_000);
        var frontDesk = factory.CreateApiClient(receptionist.UserId, UserRole.Receptionist);
        var legacyCreate = await frontDesk.PostAsJsonAsync($"/api/invoices/{invoice.InvoiceId}/adjustments",
            new { type = "Refund", amount = 500_000m, reason = "Legacy cash path" });
        Assert.Equal(HttpStatusCode.Conflict, legacyCreate.StatusCode);
        var oldComplete = await frontDesk.PostAsJsonAsync($"/api/payment-adjustments/{Guid.NewGuid()}/complete",
            new { refundMethod = "Cash", note = "Must not exist" });
        Assert.Equal(HttpStatusCode.NotFound, oldComplete.StatusCode);
    }

    private sealed record RefundResponse(Guid AdjustmentId, Guid InvoiceId, Guid? InvoiceItemId,
        int SystemCalculatedPoints, int ApprovedPoints, Guid? PointLedgerEntryId, string Status,
        string? RefundMethod);
}
