using System.Net;
using System.Net.Http.Json;
using Microsoft.EntityFrameworkCore;
using SportHub.Identity.Domain.Enums;
using SportHub.Scheduling.Application.DTOs;

namespace SportHub.Scheduling.Tests.Integration;

[Collection(nameof(SchedulingApiCollection))]
public sealed class GymCheckOutTests(SchedulingApiFactory factory)
{
    [Fact]
    public async Task Receptionist_checkout_is_server_timed_concurrent_and_idempotent()
    {
        var receptionist = await factory.SeedUserAsync(UserRole.Receptionist);
        var member = await factory.SeedUserAsync(UserRole.Member);
        await factory.SeedMemberPackageAsync(member.UserId);
        var client = factory.CreateApiClient(receptionist.UserId, UserRole.Receptionist);
        var checkin = await (await client.PostAsJsonAsync("api/gym-checkins", new { targetMemberId = member.UserId })).Content.ReadFromJsonAsync<GymCheckInResponse>();
        Assert.NotNull(checkin);
        var before = DateTime.UtcNow;
        var responses = await Task.WhenAll(Enumerable.Range(0, 2).Select(_ => client.PostAsJsonAsync($"api/gym-checkins/{checkin.CheckInId}/checkout", new { checkOutTime = "2000-01-01" })));
        var first = await responses[0].Content.ReadFromJsonAsync<GymCheckInResponse>();
        var second = await responses[1].Content.ReadFromJsonAsync<GymCheckInResponse>();
        Assert.All(responses, r => Assert.Equal(HttpStatusCode.OK, r.StatusCode));
        Assert.Equal(first!.CheckOutTime, second!.CheckOutTime);
        Assert.InRange(first.CheckOutTime!.Value, before.AddMilliseconds(-1), DateTime.UtcNow);
        Assert.True(first.CheckOutTime >= first.CheckInTime);
        Assert.Equal(receptionist.UserId, first.CheckedOutByUserId);
        foreach (var role in new[] { UserRole.Member, UserRole.Coach, UserRole.CenterManager, UserRole.SystemAdministrator })
        {
            var actor = await factory.SeedUserAsync(role);
            Assert.Equal(HttpStatusCode.Forbidden, (await factory.CreateApiClient(actor.UserId, role).PostAsync($"api/gym-checkins/{checkin.CheckInId}/checkout", null)).StatusCode);
        }
    }

    [Fact]
    public async Task Checkout_rejects_unknown_or_future_checkin()
    {
        var receptionist = await factory.SeedUserAsync(UserRole.Receptionist);
        var member = await factory.SeedUserAsync(UserRole.Member);
        await factory.SeedMemberPackageAsync(member.UserId);
        var client = factory.CreateApiClient(receptionist.UserId, UserRole.Receptionist);
        Assert.Equal(HttpStatusCode.NotFound, (await client.PostAsync($"api/gym-checkins/{Guid.NewGuid()}/checkout", null)).StatusCode);
        var checkin = await (await client.PostAsJsonAsync("api/gym-checkins", new { targetMemberId = member.UserId })).Content.ReadFromJsonAsync<GymCheckInResponse>();
        await factory.QueryAsync(db => db.GymCheckIns.Where(c => c.CheckInId == checkin!.CheckInId).ExecuteUpdateAsync(s => s.SetProperty(c => c.CheckInTime, DateTime.UtcNow.AddHours(1))));
        Assert.Equal(HttpStatusCode.Conflict, (await client.PostAsync($"api/gym-checkins/{checkin!.CheckInId}/checkout", null)).StatusCode);
    }
}
