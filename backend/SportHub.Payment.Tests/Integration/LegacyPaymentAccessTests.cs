using System.Net;
using System.Net.Http.Json;
using Microsoft.EntityFrameworkCore;
using SportHub.Identity.Domain.Enums;
using SportHub.Payment.Domain.Entities;
using SportHub.Payment.Domain.Enums;

namespace SportHub.Payment.Tests.Integration;

[Collection(nameof(PaymentApiCollection))]
public sealed class LegacyPaymentAccessTests(PaymentApiFactory factory)
{
    [Theory]
    [InlineData(UserRole.Member)]
    [InlineData(UserRole.Coach)]
    [InlineData(UserRole.SystemAdministrator)]
    public async Task Non_financial_staff_cannot_read_other_invoices_or_search_members(UserRole role)
    {
        var owner = await factory.SeedUserAsync(UserRole.Member);
        var counter = await factory.SeedUserAsync(UserRole.Receptionist);
        var actor = await factory.SeedUserAsync(role);
        var invoice = await factory.SeedInvoiceAsync(owner.UserId, counter.UserId, 100_000);
        using var client = factory.CreateApiClient(actor.UserId, role);
        Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync($"/api/invoices/{invoice.InvoiceId}")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync("/api/invoices")).StatusCode);
        if (role is UserRole.Member)
        {
            var own = await factory.SeedInvoiceAsync(actor.UserId, counter.UserId, 100_000);
            Assert.Equal(HttpStatusCode.OK, (await client.GetAsync($"/api/invoices/{own.InvoiceId}")).StatusCode);
        }
    }

    [Theory]
    [InlineData(PaymentAdjustmentType.Discount)]
    [InlineData(PaymentAdjustmentType.Correction)]
    public async Task Legacy_adjustments_are_readable_but_cannot_be_created_approved_or_rejected(PaymentAdjustmentType type)
    {
        var owner = await factory.SeedUserAsync(UserRole.Member);
        var counter = await factory.SeedUserAsync(UserRole.Receptionist);
        var manager = await factory.SeedUserAsync(UserRole.CenterManager);
        var invoice = await factory.SeedInvoiceAsync(owner.UserId, counter.UserId, 100_000);
        var id = Guid.NewGuid();
        await factory.QueryAsync(async db =>
        {
            db.PaymentAdjustments.Add(new PaymentAdjustment
            {
                AdjustmentId = id, InvoiceId = invoice.InvoiceId, Type = type, Amount = 10_000,
                RequestedAmount = 10_000, Reason = "Historical request", Status = PaymentAdjustmentStatus.Requested,
                RequestedByUserId = counter.UserId, CreatedAt = DateTime.UtcNow
            });
            await db.SaveChangesAsync();
            return 0;
        });
        using var client = factory.CreateApiClient(manager.UserId, UserRole.CenterManager);
        Assert.Equal(HttpStatusCode.Conflict, (await client.PostAsJsonAsync($"/api/invoices/{invoice.InvoiceId}/adjustments",
            new { type = type.ToString(), amount = 10_000, reason = "Must reject" })).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, (await client.PostAsJsonAsync($"/api/payment-adjustments/{id}/approve", new { reason = "Read only" })).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, (await client.PostAsJsonAsync($"/api/payment-adjustments/{id}/reject", new { reason = "Read only" })).StatusCode);
        var history = await client.GetAsync($"/api/payment-adjustments?invoiceId={invoice.InvoiceId}");
        Assert.Equal(HttpStatusCode.OK, history.StatusCode);
        Assert.Contains(id.ToString(), await history.Content.ReadAsStringAsync());
        Assert.Equal(PaymentAdjustmentStatus.Requested, await factory.QueryAsync(db => db.PaymentAdjustments
            .Where(x => x.AdjustmentId == id).Select(x => x.Status).SingleAsync()));
    }
}
