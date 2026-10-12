using System.Net;
using System.Net.Http.Json;
using Microsoft.EntityFrameworkCore;
using SportHub.Identity.Domain.Enums;
using SportHub.Membership.Domain;
using SportHub.Membership.Domain.Entities;
using SportHub.Membership.Domain.Enums;
using SportHub.Payment.Application.DTOs.Checkouts;

namespace SportHub.Payment.Tests.Integration;

[Collection(nameof(PaymentApiCollection))]
public sealed class GymDayPassTests(PaymentApiFactory factory)
{
    [Fact]
    public async Task Paid_day_pass_starts_today_even_when_member_has_a_long_membership()
    {
        var member = await factory.SeedUserAsync(UserRole.Member);
        var receptionist = await factory.SeedUserAsync(UserRole.Receptionist);
        var today = DateOnly.FromDateTime(DateTime.UtcNow.AddHours(7));

        await factory.QueryAsync(async db =>
        {
            var longPlan = new MembershipPackage
            {
                Name = "Long Gym " + Guid.NewGuid().ToString("N"), Price = 600_000m,
                DurationDays = 30, IsActive = true
            };
            db.MembershipPackages.Add(longPlan);
            await db.SaveChangesAsync();
            db.MemberPackages.Add(new MemberPackage
            {
                MemberPackageId = Guid.NewGuid(), MemberId = member.UserId,
                PackageId = longPlan.PackageId, Status = MemberPackageStatus.Active,
                StartDate = today, EndDate = today.AddDays(29)
            });
            await db.SaveChangesAsync();
            return 0;
        });

        using var buyer = factory.CreateApiClient(member.UserId, UserRole.Member);
        using var request = new HttpRequestMessage(HttpMethod.Post, "/api/checkouts/membership")
        {
            Content = JsonContent.Create(new { packageId = DayPass.PackageId })
        };
        request.Headers.Add("Idempotency-Key", Guid.NewGuid().ToString("N"));
        var created = await buyer.SendAsync(request);
        Assert.Equal(HttpStatusCode.Created, created.StatusCode);
        var checkout = (await created.Content.ReadFromJsonAsync<CheckoutResponse>())!;
        Assert.Equal(DayPass.PriceVnd, checkout.TotalAmount);

        using var staff = factory.CreateApiClient(receptionist.UserId, UserRole.Receptionist);
        var attemptResponse = await buyer.PostAsync($"/api/checkouts/{checkout.InvoiceId}/attempts", null);
        Assert.Equal(HttpStatusCode.OK, attemptResponse.StatusCode);
        var attempt = (await attemptResponse.Content.ReadFromJsonAsync<PaymentAttemptResponse>())!;
        Assert.Equal(HttpStatusCode.OK,
            (await staff.PostAsync($"/api/dev/payments/{attempt.TransactionReference}/simulate", null)).StatusCode);

        await factory.QueryAsync(async db =>
        {
            var pass = await db.MemberPackages.SingleAsync(x => x.MemberId == member.UserId
                && x.PackageId == DayPass.PackageId);
            Assert.Equal(MemberPackageStatus.Active, pass.Status);
            Assert.Equal(today, pass.StartDate);
            Assert.Equal(today, pass.EndDate);
            return 0;
        });
    }

    [Fact]
    public async Task Manager_cannot_change_or_discontinue_the_fixed_day_pass()
    {
        var manager = await factory.SeedUserAsync(UserRole.CenterManager);
        using var client = factory.CreateApiClient(manager.UserId, UserRole.CenterManager);
        var update = await client.PutAsJsonAsync($"/api/membership-packages/{DayPass.PackageId}", new
        {
            name = DayPass.Name, price = 60_000, durationDays = 1
        });
        Assert.Equal(HttpStatusCode.Conflict, update.StatusCode);
        Assert.Equal(HttpStatusCode.Conflict,
            (await client.PostAsync($"/api/membership-packages/{DayPass.PackageId}/discontinue", null)).StatusCode);
    }
}
