using System.Net;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using SportHub.Identity.Domain.Enums;

namespace SportHub.Payment.Tests.Integration;

[Collection(nameof(PaymentApiCollection))]
public sealed class MemberInvoiceDownloadTests(PaymentApiFactory factory)
{
    [Fact]
    public async Task Member_downloads_own_pdf_but_cannot_download_another_members_invoice()
    {
        var member = await factory.SeedUserAsync(UserRole.Member);
        var other = await factory.SeedUserAsync(UserRole.Member);
        var invoice = await factory.SeedInvoiceAsync(member.UserId, member.UserId, 100_000m);
        using var owner = factory.CreateApiClient(member.UserId, UserRole.Member);
        var response = await owner.GetAsync($"/api/invoices/{invoice.InvoiceId}/receipt.pdf");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("application/pdf", response.Content.Headers.ContentType?.MediaType);
        Assert.StartsWith("%PDF-", Encoding.ASCII.GetString(await response.Content.ReadAsByteArrayAsync()));
        using var outsider = factory.CreateApiClient(other.UserId, UserRole.Member);
        Assert.Equal(HttpStatusCode.Forbidden,
            (await outsider.GetAsync($"/api/invoices/{invoice.InvoiceId}/receipt.pdf")).StatusCode);
    }

    [Fact]
    public async Task Day_pass_checkout_retains_its_notice_flag_when_loaded_by_invoice_id()
    {
        var member = await factory.SeedUserAsync(UserRole.Member);
        using var client = factory.CreateApiClient(member.UserId, UserRole.Member);
        client.DefaultRequestHeaders.Add("Idempotency-Key", Guid.NewGuid().ToString());
        var result = await client.PostAsJsonAsync("/api/checkouts/membership", new { packageId = 50000 });
        Assert.True(result.IsSuccessStatusCode, await result.Content.ReadAsStringAsync());
        var checkout = await result.Content.ReadFromJsonAsync<JsonElement>();
        var id = checkout.GetProperty("invoiceId").GetGuid();
        var loaded = await client.GetFromJsonAsync<JsonElement>($"/api/checkouts/{id}");
        Assert.True(loaded.GetProperty("isDayPass").GetBoolean());
    }
}
