using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using System.Net;
using System.Net.Http.Json;
using SportHub.Identity.Domain.Enums;
using SportHub.Membership.Domain.Entities;
using SportHub.Membership.Domain.Enums;
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
