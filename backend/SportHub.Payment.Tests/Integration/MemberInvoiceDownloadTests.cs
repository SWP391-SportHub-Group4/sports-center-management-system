using System.Net;
using System.Net.Http.Headers;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using SportHub.Identity.Domain.Enums;
using SportHub.BuildingBlocks.SharedKernel.Time;
using SportHub.BuildingBlocks.Infrastructure.Authentication;
using SportHub.BuildingBlocks.Abstractions.Scheduling;

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
        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        using (var db = factory.Services.CreateScope())
        {
            var ctx = db.ServiceProvider.GetRequiredService<SportHub.API.Persistence.SportHubDbContext>();
            var row = await ctx.Set<SportHub.Payment.Domain.Entities.Invoice>().SingleAsync(x => x.InvoiceId == invoice.InvoiceId);
            row.Status = SportHub.Payment.Domain.Enums.InvoiceStatus.Paid;
            await ctx.SaveChangesAsync();
        }
        response = await owner.GetAsync($"/api/invoices/{invoice.InvoiceId}/receipt.pdf");
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
        var localDate = DateOnly.FromDateTime(VietnamTime.ToLocal(DateTime.UtcNow));
        var now = VietnamTime.ToUtc(localDate.ToDateTime(new TimeOnly(21, 30)));
        using var app = factory.WithWebHostBuilder(builder => builder.ConfigureTestServices(services =>
        {
            services.RemoveAll<IClock>();
            services.AddSingleton<IClock>(new FixedClock(now));
        }));
        var member = await factory.SeedUserAsync(UserRole.Member);
        using var client = app.CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false });
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer",
            JwtService.GenerateAccessToken(member.UserId, UserRole.Member.ToString(),
                factory.EffectiveJwtOptions, factory.StampOf(member.UserId)));
        client.DefaultRequestHeaders.Add("Idempotency-Key", Guid.NewGuid().ToString());
        var result = await client.PostAsJsonAsync("/api/checkouts/membership", new { packageId = 50000 });
        Assert.True(result.IsSuccessStatusCode, await result.Content.ReadAsStringAsync());
        var checkout = await result.Content.ReadFromJsonAsync<JsonElement>();
        var id = checkout.GetProperty("invoiceId").GetGuid();
        var loaded = await client.GetFromJsonAsync<JsonElement>($"/api/checkouts/{id}");
        Assert.True(loaded.GetProperty("isDayPass").GetBoolean());
        Assert.True(loaded.GetProperty("closingSoon").GetBoolean());
        Assert.Equal(VietnamTime.ToUtc(localDate.ToDateTime(new TimeOnly(22, 0))),
            loaded.GetProperty("closesAtUtc").GetDateTime());
    }

    private sealed class FixedClock(DateTime now) : IClock
    {
        public DateTime UtcNow => now;
    }
}
