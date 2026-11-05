using System.Net;
using System.Net.Http.Json;
using Microsoft.EntityFrameworkCore;
using SportHub.Identity.Domain.Enums;
using SportHub.Scheduling.Catalog.Application;
using SportHub.Scheduling.Catalog.Domain;

namespace SportHub.Scheduling.Tests.Integration;

[Collection(nameof(SchedulingApiCollection))]
public sealed class AutomaticSportCodeTests(SchedulingApiFactory factory)
{
    [Theory]
    [InlineData(" Bóng bàn ", "bong_ban")]
    [InlineData("Đá cầu", "da_cau")]
    [InlineData("BÓNG---BÀN", "bong_ban")]
    [InlineData("A", "a")]
    [InlineData("!!!", "")]
    public void Code_is_generated_from_the_normalized_name(string name, string code)
        => Assert.Equal(code, SportCode.FromName(name));

    [Fact]
    public async Task Generated_codes_reject_collisions_even_for_inactive_sports_and_remain_immutable()
    {
        var actor = await factory.SeedUserAsync(UserRole.CenterManager);
        using var manager = factory.CreateApiClient(actor.UserId, UserRole.CenterManager);
        var suffix = Guid.NewGuid().ToString("N")[..8];
        var name = "Bóng bàn " + suffix;
        var response = await manager.PostAsJsonAsync("api/manager/sports", new { name, code = "ignored", services = Array.Empty<object>() });
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        var sport = (await response.Content.ReadFromJsonAsync<SportResponse>())!;
        Assert.Equal("bong_ban_" + suffix, sport.Code);
        var renamed = await manager.PutAsJsonAsync($"api/manager/sports/{sport.SportId}", new { name = "Đổi tên " + suffix, services = Array.Empty<object>() });
        renamed.EnsureSuccessStatusCode();
        Assert.Equal(sport.Code, (await renamed.Content.ReadFromJsonAsync<SportResponse>())!.Code);
        (await manager.PostAsync($"api/manager/sports/{sport.SportId}/deactivate", null)).EnsureSuccessStatusCode();

        var collision = "Bong ban " + suffix;
        var availability = (await manager.GetFromJsonAsync<SportNameAvailabilityResponse>(
            "api/manager/sports/name-availability?name=" + Uri.EscapeDataString(collision)))!;
        Assert.True(availability.IsValid);
        Assert.False(availability.IsAvailable);
        var duplicate = await manager.PostAsJsonAsync("api/manager/sports", new { name = collision, services = Array.Empty<object>() });
        Assert.Equal(HttpStatusCode.Conflict, duplicate.StatusCode);
        Assert.Contains("sport_code_taken", await duplicate.Content.ReadAsStringAsync());
        Assert.Equal(1, await factory.QueryAsync(db => db.Set<Sport>().CountAsync(s => s.Code == sport.Code)));

        var ownName = await manager.GetFromJsonAsync<SportNameAvailabilityResponse>(
            $"api/manager/sports/name-availability?name={Uri.EscapeDataString("Đổi tên " + suffix)}&excludeSportId={sport.SportId}");
        Assert.True(ownName!.IsAvailable);
        using var member = factory.CreateApiClient((await factory.SeedUserAsync(UserRole.Member)).UserId, UserRole.Member);
        Assert.Equal(HttpStatusCode.Forbidden, (await member.GetAsync("api/manager/sports/name-availability?name=Gym")).StatusCode);
    }

    [Fact]
    public async Task Concurrent_names_with_the_same_generated_code_create_only_one_sport()
    {
        var actor = await factory.SeedUserAsync(UserRole.CenterManager);
        using var manager = factory.CreateApiClient(actor.UserId, UserRole.CenterManager);
        var suffix = Guid.NewGuid().ToString("N")[..8];
        var responses = await Task.WhenAll(new[] { "Đá cầu ", "Da cau " }.Select(prefix =>
            manager.PostAsJsonAsync("api/manager/sports", new { name = prefix + suffix, services = Array.Empty<object>() })));
        Assert.Single(responses, response => response.StatusCode == HttpStatusCode.Created);
        var rejected = Assert.Single(responses, response => response.StatusCode == HttpStatusCode.Conflict);
        Assert.Contains("sport_code_taken", await rejected.Content.ReadAsStringAsync());
    }
}
