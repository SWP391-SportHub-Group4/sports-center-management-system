using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using SportHub.Identity.Domain.Enums;

namespace SportHub.Security.Tests.Integration;

[Collection(nameof(SportHubApiCollection))]
public sealed class ManagerPeopleTests(SportHubApiFactory factory)
{
    [Fact]
    public async Task Directory_filters_member_and_coach_before_paging_and_never_returns_staff()
    {
        var prefix = "people-" + Guid.NewGuid().ToString("N");
        var member = await factory.SeedUserAsync(prefix + "-member@example.com", null);
        var coach = await factory.SeedUserAsync(prefix + "-coach@example.com", null, role: UserRole.Coach);
        await factory.SeedUserAsync(prefix + "-staff@example.com", null, role: UserRole.Receptionist);
        var manager = await factory.SeedUserAsync(prefix + "-manager@example.com", null, role: UserRole.CenterManager);
        using var client = factory.CreateApiClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", factory.IssueToken(manager.UserId, UserRole.CenterManager));
        var path = "/api/manager/people?keyword=" + prefix;
        var ids = new HashSet<Guid>();
        for (var page = 1; page <= 2; page++)
        {
            var result = await client.GetFromJsonAsync<JsonElement>(path + "&pageSize=1&page=" + page);
            Assert.Equal(2, result.GetProperty("totalCount").GetInt32());
            ids.Add(Assert.Single(result.GetProperty("items").EnumerateArray()).GetProperty("userId").GetGuid());
        }
        Assert.Equal(new[] {member.UserId, coach.UserId}.OrderBy(x => x), ids.OrderBy(x => x));
        var coaches = await client.GetFromJsonAsync<JsonElement>(path + "&role=Coach");
        Assert.Equal(1, coaches.GetProperty("totalCount").GetInt32());
        Assert.Equal(coach.UserId, Assert.Single(coaches.GetProperty("items").EnumerateArray()).GetProperty("userId").GetGuid());
        var staff = await client.GetFromJsonAsync<JsonElement>(path + "&role=Receptionist");
        Assert.Equal(0, staff.GetProperty("totalCount").GetInt32());
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", factory.IssueToken(member.UserId, UserRole.Member));
        Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync(path)).StatusCode);
    }
}
