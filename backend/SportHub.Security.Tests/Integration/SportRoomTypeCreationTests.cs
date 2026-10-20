using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SportHub.API.Persistence;
using SportHub.Identity.Domain.Enums;
using SportHub.Scheduling.Catalog.Application;
using SportHub.Scheduling.Catalog.Domain;

namespace SportHub.Security.Tests.Integration;

[Collection(nameof(SportHubApiCollection))]
public sealed class SportRoomTypeCreationTests(SportHubApiFactory factory)
{
    private async Task<HttpClient> ManagerAsync()
    {
        var user = await factory.SeedUserAsync($"sport-type-{Guid.NewGuid():N}@example.com", null, role: UserRole.CenterManager);
        var client = factory.CreateApiClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", factory.IssueToken(user.UserId, UserRole.CenterManager));
        return client;
    }

    private static SaveSportRequest Request(bool create = false, string? typeName = null) => new()
    {
        Code = "type_" + Guid.NewGuid().ToString("N")[..12], Name = "New sport " + Guid.NewGuid(),
        CreateRoomType = create, RoomTypeName = typeName,
        Services = [new() { ServiceType = "COURT_RENTAL", IsEnabled = true }]
    };

    [Fact]
    public async Task Opt_in_creates_user_named_type_and_links_it_to_the_new_sport()
    {
        using var client = await ManagerAsync();
        var name = "Court type " + Guid.NewGuid();
        var input = Request(true, "  " + name + "  ");
        var response = await client.PostAsJsonAsync("/api/manager/sports", input);
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        var sport = (await response.Content.ReadFromJsonAsync<SportResponse>())!;
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SportHubDbContext>();
        var type = await db.RoomTypes.SingleAsync(t => t.Name == name);
        Assert.True(type.IsActive);
        Assert.True(await db.SportRoomTypes.AnyAsync(l => l.RoomTypeId == type.RoomTypeId && l.SportId == sport.SportId));
        Assert.True(await db.AuditLogs.AnyAsync(a => a.Action == "CREATE_ROOM_TYPE" && a.TargetId == type.RoomTypeId.ToString()));
        Assert.True(await db.AuditLogs.AnyAsync(a => a.Action == "SET_ROOM_TYPE_SPORTS" && a.TargetId == type.RoomTypeId.ToString()));
        var listed = (await client.GetFromJsonAsync<List<RoomTypeResponse>>("/api/room-types"))!;
        Assert.Contains(listed, t => t.RoomTypeId == type.RoomTypeId && t.SportIds.Contains(sport.SportId));
    }

    [Fact]
    public async Task Opt_out_ignores_type_name_and_does_not_change_existing_types_or_links()
    {
        using var client = await ManagerAsync();
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SportHubDbContext>();
        var beforeTypes = await db.RoomTypes.CountAsync();
        var beforeLinks = await db.SportRoomTypes.CountAsync();
        var input = Request(false, "Ignored type " + Guid.NewGuid());
        Assert.Equal(HttpStatusCode.Created, (await client.PostAsJsonAsync("/api/manager/sports", input)).StatusCode);
        Assert.Equal(beforeTypes, await db.RoomTypes.CountAsync());
        Assert.Equal(beforeLinks, await db.SportRoomTypes.CountAsync());
        Assert.True(await db.Sports.AnyAsync(s => s.Code == input.Code));
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    public async Task Opt_in_requires_a_name_and_rejects_without_creating_a_sport(string? name)
    {
        using var client = await ManagerAsync();
        var input = Request(true, name);
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PostAsJsonAsync("/api/manager/sports", input)).StatusCode);
        using var scope = factory.Services.CreateScope();
        Assert.False(await scope.ServiceProvider.GetRequiredService<SportHubDbContext>().Sports.AnyAsync(s => s.Code == input.Code));
    }

    [Fact]
    public async Task Duplicate_type_name_rejects_the_whole_create_without_new_links()
    {
        using var client = await ManagerAsync();
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SportHubDbContext>();
        var type = new RoomType { Name = "Existing type " + Guid.NewGuid() };
        db.RoomTypes.Add(type); await db.SaveChangesAsync();
        var input = Request(true, type.Name.ToUpperInvariant());
        var response = await client.PostAsJsonAsync("/api/manager/sports", input);
        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        Assert.Contains("room_type_name_taken", await response.Content.ReadAsStringAsync());
        Assert.False(await db.Sports.AnyAsync(s => s.Code == input.Code));
        Assert.False(await db.SportRoomTypes.AnyAsync(l => l.RoomTypeId == type.RoomTypeId));
    }
}
