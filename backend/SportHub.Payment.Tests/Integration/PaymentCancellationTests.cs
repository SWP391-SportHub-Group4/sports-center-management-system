using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SportHub.Identity.Domain.Enums;
using SportHub.Membership.Domain.Entities;
using SportHub.Payment.Application.DTOs.Checkouts;
using SportHub.Payment.Domain.Enums;
using SportHub.Payment.VnPay;

namespace SportHub.Payment.Tests.Integration;

[Collection(nameof(PaymentApiCollection))]
public sealed class PaymentCancellationTests(PaymentApiFactory factory)
{
    private async Task<(HttpClient Owner, CheckoutResponse Checkout, PaymentAttemptResponse Attempt)> StartAsync(
        Guid buyerId)
    {
        var packageId = await factory.QueryAsync(async db =>
        {
            var package = new MembershipPackage
            {
                Name = "Cancel " + Guid.NewGuid().ToString("N"), Price = 100_000m, DurationDays = 30, IsActive = true
            };
            db.MembershipPackages.Add(package);
            await db.SaveChangesAsync();
            return package.PackageId;
        });
        var owner = factory.CreateApiClient(buyerId, UserRole.Member);
        using var create = new HttpRequestMessage(HttpMethod.Post, "/api/checkouts/membership")
        {
            Content = JsonContent.Create(new { packageId })
        };
        create.Headers.Add("Idempotency-Key", Guid.NewGuid().ToString("N"));
        var created = await owner.SendAsync(create);
        Assert.Equal(HttpStatusCode.Created, created.StatusCode);
        var checkout = (await created.Content.ReadFromJsonAsync<CheckoutResponse>())!;
        var started = await owner.PostAsync($"/api/checkouts/{checkout.InvoiceId}/attempts", null);
        Assert.Equal(HttpStatusCode.OK, started.StatusCode);
        return (owner, checkout, (await started.Content.ReadFromJsonAsync<PaymentAttemptResponse>())!);
    }

    private MockPaymentGateway Gateway()
        => Assert.IsType<MockPaymentGateway>(factory.Services.GetRequiredService<IPaymentGateway>());

    private Task<PaymentAttemptStatus> StatusAsync(Guid attemptId)
        => factory.QueryAsync(db => db.PaymentAttempts.Where(x => x.PaymentAttemptId == attemptId)
            .Select(x => x.Status).SingleAsync());

    [Fact]
    public async Task Signed_cancel_closes_pending_attempt_and_voids_invoice()
    {
        var buyer = await factory.SeedUserAsync(UserRole.Member);
        var (owner, checkout, attempt) = await StartAsync(buyer.UserId);
        using var _ = owner;
        var fields = Gateway().BuildCallback(attempt.TransactionReference, attempt.CashAmount, success: false);

        var response = await owner.PostAsJsonAsync("/api/checkouts/cancel-reference", new { fields });
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("Void", (await response.Content.ReadFromJsonAsync<CheckoutResponse>())!.InvoiceStatus);
        Assert.Equal(PaymentAttemptStatus.Failed, await StatusAsync(attempt.PaymentAttemptId));
        Assert.Equal(0, await factory.QueryAsync(db => db.Payments.CountAsync(x => x.InvoiceId == checkout.InvoiceId)));
        Assert.Equal(InvoiceStatus.Void, await factory.QueryAsync(db => db.Invoices
            .Where(x => x.InvoiceId == checkout.InvoiceId).Select(x => x.Status).SingleAsync()));
        Assert.Contains("was cancelled", await factory.QueryAsync(db => db.Notifications
            .Where(x => x.SourceEntityId == checkout.InvoiceId && x.Channel == SportHub.Notification.Domain.Enums.NotificationChannel.InApp)
            .Select(x => x.Message).SingleAsync()));
        var protectedEmail = await factory.QueryAsync(db => db.Notifications
            .Where(x => x.SourceEntityId == checkout.InvoiceId && x.Channel == SportHub.Notification.Domain.Enums.NotificationChannel.Email)
            .Select(x => x.ProtectedEmailPayload).SingleAsync());
        var emailJson = factory.Services.GetRequiredService<IDataProtectionProvider>()
            .CreateProtector("SportHub.Notification.EmailPayload.v1").Unprotect(protectedEmail!);
        var emailBody = JsonDocument.Parse(emailJson).RootElement.GetProperty("HtmlBody").GetString()!;
        Assert.Contains("was cancelled", emailBody);
        Assert.DoesNotContain("Please pay", emailBody);
        var notices = (await owner.GetFromJsonAsync<List<InvoiceNotice>>("/api/notifications"))!;
        var invoiceNotice = notices.Single(x => x.SourceEntityId == checkout.InvoiceId);
        Assert.Contains("was cancelled", invoiceNotice.Message);
        Assert.DoesNotContain("Please pay", invoiceNotice.Message);
        var inbox = (await owner.GetFromJsonAsync<InvoiceNoticePage>("/api/notifications/inbox"))!;
        Assert.Contains(inbox.Items, x => x.SourceEntityId == checkout.InvoiceId
            && x.Message.Contains("was cancelled"));
        var supportInvoices = await owner.GetFromJsonAsync<JsonElement>(
            "/api/members/me/invoices?page=1&pageSize=5");
        Assert.Contains(supportInvoices.GetProperty("items").EnumerateArray(),
            x => x.GetProperty("invoiceId").GetGuid() == checkout.InvoiceId);

        // Idempotent for a page refresh.
        var again = await owner.PostAsJsonAsync("/api/checkouts/cancel-reference", new { fields });
        Assert.Equal(HttpStatusCode.OK, again.StatusCode);

        var retry = await owner.PostAsync($"/api/checkouts/{checkout.InvoiceId}/attempts", null);
        Assert.Equal(HttpStatusCode.Conflict, retry.StatusCode);
    }

    [Fact]
    public async Task Tampered_signature_is_rejected_and_attempt_stays_pending()
    {
        var buyer = await factory.SeedUserAsync(UserRole.Member);
        var (owner, _, attempt) = await StartAsync(buyer.UserId);
        using var __ = owner;
        var fields = Gateway().BuildCallback(attempt.TransactionReference, attempt.CashAmount, success: false)
            .ToDictionary(x => x.Key, x => x.Value);
        fields["vnp_Amount"] = "1";

        var response = await owner.PostAsJsonAsync("/api/checkouts/cancel-reference", new { fields });
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal(PaymentAttemptStatus.Pending, await StatusAsync(attempt.PaymentAttemptId));
    }

    [Fact]
    public async Task Signed_success_code_is_not_treated_as_cancellation()
    {
        var buyer = await factory.SeedUserAsync(UserRole.Member);
        var (owner, _, attempt) = await StartAsync(buyer.UserId);
        using var __ = owner;
        var fields = Gateway().BuildCallback(attempt.TransactionReference, attempt.CashAmount, success: true);

        var response = await owner.PostAsJsonAsync("/api/checkouts/cancel-reference", new { fields });
        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        Assert.Equal(PaymentAttemptStatus.Pending, await StatusAsync(attempt.PaymentAttemptId));
    }

    [Fact]
    public async Task Replayed_cancel_of_failed_attempt_cannot_void_an_open_invoice()
    {
        var buyer = await factory.SeedUserAsync(UserRole.Member);
        var (owner, checkout, attempt) = await StartAsync(buyer.UserId);
        using var _ = owner;
        await factory.QueryAsync(db => db.PaymentAttempts
            .Where(x => x.PaymentAttemptId == attempt.PaymentAttemptId)
            .ExecuteUpdateAsync(setters => setters.SetProperty(x => x.Status, PaymentAttemptStatus.Failed)));
        var fields = Gateway().BuildCallback(attempt.TransactionReference, attempt.CashAmount, success: false);

        var response = await owner.PostAsJsonAsync("/api/checkouts/cancel-reference", new { fields });
        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        Assert.Equal(InvoiceStatus.Issued, await factory.QueryAsync(db => db.Invoices
            .Where(x => x.InvoiceId == checkout.InvoiceId).Select(x => x.Status).SingleAsync()));
    }

    [Fact]
    public async Task Other_members_cannot_cancel_someone_elses_attempt()
    {
        var buyer = await factory.SeedUserAsync(UserRole.Member);
        var other = await factory.SeedUserAsync(UserRole.Member);
        var (owner, _, attempt) = await StartAsync(buyer.UserId);
        using var __ = owner;
        using var stranger = factory.CreateApiClient(other.UserId, UserRole.Member);
        var fields = Gateway().BuildCallback(attempt.TransactionReference, attempt.CashAmount, success: false);

        var response = await stranger.PostAsJsonAsync("/api/checkouts/cancel-reference", new { fields });
        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        Assert.Equal(PaymentAttemptStatus.Pending, await StatusAsync(attempt.PaymentAttemptId));
    }

    [Fact]
    public async Task Member_invoice_search_includes_void_invoices_and_paginates_newest_first()
    {
        var buyer = await factory.SeedUserAsync(UserRole.Member);
        var invoices = new List<SportHub.Payment.Domain.Entities.Invoice>();
        for (var index = 0; index < 7; index++)
            invoices.Add(await factory.SeedInvoiceAsync(buyer.UserId, buyer.UserId, 100_000m,
                issuedAt: DateTime.UtcNow.AddMinutes(index)));
        var newestId = invoices[^1].InvoiceId;
        await factory.QueryAsync(async db =>
        {
            var row = await db.Invoices.SingleAsync(i => i.InvoiceId == newestId);
            row.Status = InvoiceStatus.Void;
            return await db.SaveChangesAsync();
        });
        using var owner = factory.CreateApiClient(buyer.UserId, UserRole.Member);
        var first = await owner.GetFromJsonAsync<JsonElement>("/api/members/me/invoices?page=1&pageSize=5");
        Assert.Equal(7, first.GetProperty("totalCount").GetInt32());
        Assert.Equal(invoices[^1].InvoiceId, first.GetProperty("items")[0].GetProperty("invoiceId").GetGuid());
        var second = await owner.GetFromJsonAsync<JsonElement>("/api/members/me/invoices?page=2&pageSize=5");
        Assert.Equal(2, second.GetProperty("items").GetArrayLength());
        var search = await owner.GetFromJsonAsync<JsonElement>(
            $"/api/members/me/invoices?page=1&pageSize=5&keyword={invoices[^1].InvoiceNumber}");
        Assert.Equal(1, search.GetProperty("totalCount").GetInt32());
        Assert.Equal(invoices[^1].InvoiceId, search.GetProperty("items")[0].GetProperty("invoiceId").GetGuid());
    }

    private sealed record InvoiceNotice(Guid? SourceEntityId, string Message);
    private sealed record InvoiceNoticePage(List<InvoiceNotice> Items);
}
