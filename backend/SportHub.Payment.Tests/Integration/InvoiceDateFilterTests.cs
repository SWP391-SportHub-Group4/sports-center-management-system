using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using SportHub.Identity.Domain.Enums;

namespace SportHub.Payment.Tests.Integration;

[Collection(nameof(PaymentApiCollection))]
public sealed class InvoiceDateFilterTests(PaymentApiFactory factory)
{
    [Theory]
    [InlineData(true, true)]
    [InlineData(true, false)]
    [InlineData(false, true)]
    public async Task Search_filters_issue_time_in_Vietnam_before_pagination(bool from, bool to)
    {
        var member = await factory.SeedUserAsync(UserRole.Member);
        var manager = await factory.SeedUserAsync(UserRole.CenterManager);
        var start = DateTimeOffset.Parse("2026-11-05T21:23:00+07:00");
        var end = DateTimeOffset.Parse("2026-11-14T12:23:59.999+07:00");
        var times = new[] { start.AddMilliseconds(-1), start, end, end.AddMilliseconds(1),
            DateTimeOffset.Parse("2026-11-18T18:27:00+07:00") };
        var expected = new List<Guid>();
        foreach (var time in times)
        {
            var invoice = await factory.SeedInvoiceAsync(member.UserId, manager.UserId, 100_000m,
                issuedAt: time.UtcDateTime);
            if ((!from || time >= start) && (!to || time <= end)) expected.Add(invoice.InvoiceId);
        }
        using var client = factory.CreateApiClient(manager.UserId, UserRole.CenterManager);
        var query = $"/api/invoices?memberId={member.UserId}&pageSize=1";
        if (from) query += "&issuedFrom=" + Uri.EscapeDataString(start.ToString("O"));
        if (to) query += "&issuedTo=" + Uri.EscapeDataString(end.ToString("O"));
        var actual = new List<Guid>();
        for (var page = 1; page <= expected.Count; page++)
        {
            var response = await client.GetAsync(query + $"&page={page}");
            response.EnsureSuccessStatusCode();
            var body = await response.Content.ReadFromJsonAsync<JsonElement>();
            Assert.Equal(expected.Count, body.GetProperty("totalCount").GetInt32());
            actual.Add(Assert.Single(body.GetProperty("items").EnumerateArray()).GetProperty("invoiceId").GetGuid());
        }
        Assert.Equal(expected.AsEnumerable().Reverse(), actual);
    }

    [Fact]
    public async Task Search_rejects_reversed_date_range()
    {
        var manager = await factory.SeedUserAsync(UserRole.CenterManager);
        using var client = factory.CreateApiClient(manager.UserId, UserRole.CenterManager);
        var response = await client.GetAsync("/api/invoices?issuedFrom=2026-11-14T00:00:00Z&issuedTo=2026-11-05T00:00:00Z");
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("invalid_invoice_date_range", body.GetProperty("error").GetString());
    }
}
