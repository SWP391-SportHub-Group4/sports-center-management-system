using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using SportHub.Identity.Domain.Enums;
using SportHub.Payment.Domain.Entities;
using SportHub.Payment.Domain.Enums;

namespace SportHub.Payment.Tests.Integration;

[Collection(nameof(PaymentApiCollection))]
public sealed class InvoiceServiceLabelTests(PaymentApiFactory factory)
{
    [Fact]
    public async Task Course_service_uses_linked_name_without_rewriting_invoice_snapshot_or_other_services()
    {
        var member = await factory.SeedUserAsync(UserRole.Member);
        var invoice = await factory.SeedInvoiceAsync(member.UserId, member.UserId, 100_000m);
        var expected = await factory.QueryAsync(async db =>
        {
            var course = await db.Classes.OrderBy(c => c.ClassId).FirstAsync();
            var item = await db.InvoiceItems.SingleAsync(i => i.InvoiceId == invoice.InvoiceId);
            item.ItemType = InvoiceItemType.ClassPackage;
            item.ClassId = course.ClassId;
            item.Description = $"Course unrelated sport #{course.ClassId}";
            var snapshot = item.Description;
            db.InvoiceItems.Add(new InvoiceItem
            {
                ItemId = Guid.NewGuid(), InvoiceId = invoice.InvoiceId,
                ItemType = InvoiceItemType.Membership, Description = "Gym 30 days",
                Quantity = 1, UnitPrice = 100_000m, LineAmount = 100_000m
            });
            db.InvoiceItems.Add(new InvoiceItem
            {
                ItemId = Guid.NewGuid(), InvoiceId = invoice.InvoiceId,
                ItemType = InvoiceItemType.ClassPackage, Description = "Archived enrollment",
                Quantity = 1, UnitPrice = 100_000m, LineAmount = 100_000m
            });
            var saved = await db.Invoices.SingleAsync(i => i.InvoiceId == invoice.InvoiceId);
            saved.TotalAmount = 300_000m;
            await db.SaveChangesAsync();
            return (Name: course.Name, item.ItemId, Snapshot: snapshot);
        });

        using var client = factory.CreateApiClient(member.UserId, UserRole.Member);
        var response = await client.GetAsync($"/api/invoices/{invoice.InvoiceId}");
        response.EnsureSuccessStatusCode();
        var detail = await response.Content.ReadFromJsonAsync<JsonElement>();
        var items = detail.GetProperty("items").EnumerateArray().ToArray();
        var courseItem = Assert.Single(items, item => item.GetProperty("itemId").GetGuid() == expected.ItemId);
        Assert.Equal($"{expected.Name.Trim()} enrollment", courseItem.GetProperty("description").GetString());
        Assert.Equal(100_000m, courseItem.GetProperty("lineAmount").GetDecimal());
        Assert.Contains(items, item => item.GetProperty("description").GetString() == "Gym 30 days");
        Assert.Contains(items, item => item.GetProperty("description").GetString() == "Archived enrollment");
        Assert.Equal(expected.Snapshot, await factory.QueryAsync(db => db.InvoiceItems
            .Where(item => item.ItemId == expected.ItemId).Select(item => item.Description).SingleAsync()));
    }
}
