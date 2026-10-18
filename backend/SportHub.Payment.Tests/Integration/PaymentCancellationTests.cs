using System.Net;
using System.Net.Http.Json;
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
    public async Task Signed_cancel_closes_pending_attempt_and_retry_gets_a_new_reference()
    {
        var buyer = await factory.SeedUserAsync(UserRole.Member);
        var (owner, checkout, attempt) = await StartAsync(buyer.UserId);
        using var _ = owner;
        var fields = Gateway().BuildCallback(attempt.TransactionReference, attempt.CashAmount, success: false);

        var response = await owner.PostAsJsonAsync("/api/checkouts/cancel-reference", new { fields });
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal(PaymentAttemptStatus.Failed, await StatusAsync(attempt.PaymentAttemptId));
        Assert.Equal(0, await factory.QueryAsync(db => db.Payments.CountAsync(x => x.InvoiceId == checkout.InvoiceId)));

        // Idempotent for a page refresh.
        var again = await owner.PostAsJsonAsync("/api/checkouts/cancel-reference", new { fields });
        Assert.Equal(HttpStatusCode.OK, again.StatusCode);

        var retry = await owner.PostAsync($"/api/checkouts/{checkout.InvoiceId}/attempts", null);
        Assert.Equal(HttpStatusCode.OK, retry.StatusCode);
        var next = (await retry.Content.ReadFromJsonAsync<PaymentAttemptResponse>())!;
        Assert.NotEqual(attempt.TransactionReference, next.TransactionReference);
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
}
