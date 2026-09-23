using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using SportHub.Identity.Domain.Enums;

namespace SportHub.Scheduling.Tests.Integration;

[Collection(nameof(SchedulingApiCollection))]
public sealed class GymCheckInHistoryTests(SchedulingApiFactory factory)
{
    [Fact]
    public async Task History_is_paged_and_newest_first()
    {
        var member = await factory.SeedUserAsync(UserRole.Member);
        var receptionist = await factory.SeedUserAsync(UserRole.Receptionist);
        await factory.SeedMemberPackageAsync(member.UserId);

        var receptionistClient = factory.CreateApiClient(receptionist.UserId, UserRole.Receptionist);
        for (var i = 0; i < 5; i++)
        {
            var created = await receptionistClient.PostAsJsonAsync(
                "/api/gym-checkins",
                new { targetMemberId = member.UserId });

            Assert.Equal(HttpStatusCode.Created, created.StatusCode);
        }

        var memberClient = factory.CreateApiClient(member.UserId, UserRole.Member);

        var firstPage = await ReadPageAsync(memberClient, "/api/members/me/gym-checkins?page=1&pageSize=2");
        Assert.Equal(5, firstPage.GetProperty("totalCount").GetInt32());
        Assert.Equal(2, firstPage.GetProperty("pageSize").GetInt32());

        var times = firstPage.GetProperty("items")
            .EnumerateArray()
            .Select(item => item.GetProperty("checkInTime").GetDateTime())
            .ToList();

        Assert.Equal(2, times.Count);
        Assert.Equal(times.OrderByDescending(t => t), times);

        var lastPage = await ReadPageAsync(memberClient, "/api/members/me/gym-checkins?page=3&pageSize=2");
        Assert.Single(lastPage.GetProperty("items").EnumerateArray());

        // Khong co trang nao tra ve trung ban ghi cua trang khac.
        var allIds = new List<Guid>();
        for (var page = 1; page <= 3; page++)
        {
            var body = await ReadPageAsync(memberClient, $"/api/members/me/gym-checkins?page={page}&pageSize=2");
            allIds.AddRange(body.GetProperty("items")
                .EnumerateArray()
                .Select(item => item.GetProperty("checkInId").GetGuid()));
        }

        Assert.Equal(5, allIds.Distinct().Count());
    }

    [Theory]
    [InlineData("page=0&pageSize=0")]
    [InlineData("page=-5&pageSize=-5")]
    [InlineData("pageSize=100000")]
    public async Task Out_of_range_paging_parameters_are_clamped_instead_of_failing(string query)
    {
        var member = await factory.SeedUserAsync(UserRole.Member);
        var client = factory.CreateApiClient(member.UserId, UserRole.Member);

        var response = await client.GetAsync($"/api/members/me/gym-checkins?{query}");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        var body = await response.Content.ReadFromJsonAsync<JsonElement>();
        Assert.True(body.GetProperty("page").GetInt32() >= 1);
        Assert.InRange(body.GetProperty("pageSize").GetInt32(), 1, 100);
    }

    private static async Task<JsonElement> ReadPageAsync(HttpClient client, string url)
    {
        var response = await client.GetAsync(url);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        return await response.Content.ReadFromJsonAsync<JsonElement>();
    }
}
