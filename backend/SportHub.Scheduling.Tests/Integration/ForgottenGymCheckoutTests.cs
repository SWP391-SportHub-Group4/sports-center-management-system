using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using SportHub.BuildingBlocks.SharedKernel.Time;
using SportHub.Identity.Domain.Enums;

namespace SportHub.Scheduling.Tests.Integration;

[Collection(nameof(SchedulingApiCollection))]
public sealed class ForgottenGymCheckoutTests(SchedulingApiFactory factory)
{
    [Fact]
    public async Task Receptionist_corrects_stale_visit_with_actual_departure_and_reason()
    {
        var member = await factory.SeedUserAsync(UserRole.Member);
        var desk = await factory.SeedUserAsync(UserRole.Receptionist);
        await factory.SeedMemberPackageAsync(member.UserId);
        using var client = factory.CreateApiClient(desk.UserId, UserRole.Receptionist);
        var created = await client.PostAsJsonAsync("/api/gym-checkins", new { targetMemberId = member.UserId });
        Assert.Equal(HttpStatusCode.Created, created.StatusCode);
        var id = (await created.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("checkInId").GetGuid();
        var today = DateOnly.FromDateTime(VietnamTime.ToLocal(DateTime.UtcNow));
        var checkIn = VietnamTime.StartOfDayUtc(today).AddHours(-8);
        var departure = checkIn.AddHours(2);
        await factory.QueryAsync(db => db.GymCheckIns.Where(x => x.CheckInId == id)
            .ExecuteUpdateAsync(s => s.SetProperty(x => x.CheckInTime, checkIn)));
        var stale = await client.GetFromJsonAsync<JsonElement>("/api/gym-checkins/inside?staleOnly=true");
        Assert.Contains(stale.GetProperty("items").EnumerateArray(), x => x.GetProperty("checkInId").GetGuid() == id);
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PostAsJsonAsync(
            $"/api/gym-checkins/{id}/forgotten-checkout",
            new { departedAtUtc = checkIn.AddMinutes(-1), reason = "Member forgot to check out" })).StatusCode);
        var corrected = await client.PostAsJsonAsync($"/api/gym-checkins/{id}/forgotten-checkout",
            new { departedAtUtc = departure, reason = "Member forgot to check out" });
        Assert.Equal(HttpStatusCode.OK, corrected.StatusCode);
        Assert.Equal(departure, await factory.QueryAsync(db => db.GymCheckIns.Where(x => x.CheckInId == id)
            .Select(x => x.CheckOutTime).SingleAsync()));
        Assert.Equal(HttpStatusCode.Conflict, (await client.PostAsJsonAsync(
            $"/api/gym-checkins/{id}/forgotten-checkout",
            new { departedAtUtc = departure, reason = "Duplicate correction" })).StatusCode);
    }
}
