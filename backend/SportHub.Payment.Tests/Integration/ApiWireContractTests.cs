using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using SportHub.Identity.Domain.Enums;
using SportHub.Membership.Domain.Entities;
using Xunit.Abstractions;
using Microsoft.EntityFrameworkCore;

namespace SportHub.Payment.Tests.Integration;

[Collection(nameof(PaymentApiCollection))]
public sealed class ApiWireContractTests(PaymentApiFactory factory, ITestOutputHelper output)
{
    [Fact]
    public async Task Checkout_and_invoice_json_expose_canonical_state_and_fulfillment_with_ownership()
    {
        var member = await factory.SeedUserAsync(UserRole.Member);
        var stranger = await factory.SeedUserAsync(UserRole.Member);
        var packageId = await factory.QueryAsync(async db =>
        {
            var package = new MembershipPackage { Name = "Wire contract fixture", Price = 100_000,
                DurationDays = 30, IsActive = true };
            db.MembershipPackages.Add(package);
            await db.SaveChangesAsync();
            return package.PackageId;
        });
        using var client = factory.CreateApiClient(member.UserId, UserRole.Member);
        using var request = new HttpRequestMessage(HttpMethod.Post, "/api/checkouts/membership")
            { Content = JsonContent.Create(new { packageId }) };
        request.Headers.Add("Idempotency-Key", Guid.NewGuid().ToString());
        var created = await client.SendAsync(request);
        Assert.Equal(HttpStatusCode.Created, created.StatusCode);
        var body = await created.Content.ReadAsStringAsync();
        using var checkout = JsonDocument.Parse(body);
        Assert.Equal("MEMBERSHIP", checkout.RootElement.GetProperty("kind").GetString());
        Assert.Equal("ISSUED", checkout.RootElement.GetProperty("invoiceStatus").GetString());
        Assert.Equal("PENDING", checkout.RootElement.GetProperty("fulfillmentOutcome").GetString());
        output.WriteLine("CHECKOUT_JSON=" + body);
        var id = checkout.RootElement.GetProperty("invoiceId").GetGuid();
        var detail = await client.GetAsync($"/api/invoices/{id}");
        Assert.Equal(HttpStatusCode.OK, detail.StatusCode);
        var invoiceBody = await detail.Content.ReadAsStringAsync();
        using var invoice = JsonDocument.Parse(invoiceBody);
        Assert.Equal("ISSUED", invoice.RootElement.GetProperty("summary").GetProperty("status").GetString());
        output.WriteLine("INVOICE_JSON=" + invoiceBody);
        using var other = factory.CreateApiClient(stranger.UserId, UserRole.Member);
        var denied = await other.GetAsync($"/api/checkouts/{id}");
        Assert.Equal(HttpStatusCode.Forbidden, denied.StatusCode);
        output.WriteLine("ERROR_JSON=" + await denied.Content.ReadAsStringAsync());

        // Changing catalog terms after checkout must not change the purchased price/duration.
        await factory.QueryAsync(db => db.MembershipPackages.Where(x => x.PackageId == packageId)
            .ExecuteUpdateAsync(s => s.SetProperty(x => x.Price, 200_000m).SetProperty(x => x.DurationDays, 60)));
        var attemptResponse = await client.PostAsync($"/api/checkouts/{id}/attempts", null);
        Assert.Equal(HttpStatusCode.OK, attemptResponse.StatusCode);
        using var attempt = JsonDocument.Parse(await attemptResponse.Content.ReadAsStringAsync());
        var reference = attempt.RootElement.GetProperty("transactionReference").GetString();
        var staff = await factory.SeedUserAsync(UserRole.Receptionist);
        using var counter = factory.CreateApiClient(staff.UserId, UserRole.Receptionist);
        Assert.Equal(HttpStatusCode.OK, (await counter.PostAsync($"/api/dev/payments/{reference}/simulate", null)).StatusCode);
        await factory.QueryAsync(async db =>
        {
            var item = await db.InvoiceItems.SingleAsync(x => x.InvoiceId == id);
            Assert.NotNull(item.MemberPackageId);
            Assert.Equal(100_000m, item.LineAmount);
            var entitlement = await db.MemberPackages.SingleAsync(x => x.MemberPackageId == item.MemberPackageId);
            Assert.Equal(30, entitlement.DurationDaysSnapshot);
            Assert.Equal(30, entitlement.EndDate.DayNumber - entitlement.StartDate.DayNumber + 1);
            Assert.Null(entitlement.RemainingSessions);
            Assert.NotNull((await db.Payments.SingleAsync(x => x.InvoiceId == id)).PaymentAttemptId);
            Assert.Equal(2, await db.Notifications.CountAsync(x => x.SourceEntityId == id
                && x.Channel == SportHub.Notification.Domain.Enums.NotificationChannel.Email));
            return 0;
        });
    }
}
