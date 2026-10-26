using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using SportHub.Administration.Domain.Entities;
using SportHub.BuildingBlocks.Abstractions.Configuration;
using SportHub.Identity.Domain.Enums;
using SportHub.Scheduling.Domain.Entities;

namespace SportHub.Scheduling.Tests.Integration;

[Collection(nameof(SchedulingApiCollection))]
public sealed class ClassSessionDurationTests(SchedulingApiFactory factory)
{
    [Fact]
    public async Task Duration_is_persisted_updated_and_used_for_published_sessions()
    {
        var data = await CourseTestData.CreateAsync(factory, publish: false);
        using var client = factory.CreateApiClient(data.ManagerId, UserRole.CenterManager);
        data.Request.SessionMinutes = 120;
        var updated = await client.PutAsJsonAsync($"/api/manager/classes/{data.Id}", data.Request);
        Assert.True(updated.IsSuccessStatusCode, await updated.Content.ReadAsStringAsync());
        var body = await updated.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal(120, body.GetProperty("sessionMinutes").GetInt32());
        Assert.Equal("11:00", body.GetProperty("scheduleRules")[0].GetProperty("endTimeLocal").GetString());
        var read = await client.GetFromJsonAsync<JsonElement>($"/api/manager/classes/{data.Id}");
        Assert.Equal(120, read.GetProperty("sessionMinutes").GetInt32());
        // Verify the class snapshot is persisted independently of the sport default.
        await factory.QueryAsync(async db => {
            var saved = await db.Set<Class>().SingleAsync(c => c.ClassId == data.Id);
            Assert.Equal(120, saved.SessionMinutes);
            return 0;
        });
        var published = await client.PostAsJsonAsync($"/api/manager/classes/{data.Id}/publish", new { });
        Assert.True(published.IsSuccessStatusCode, await published.Content.ReadAsStringAsync());
        var sessions = await CourseTestData.SessionsAsync(factory, data.Id);
        Assert.Equal(data.Request.NumSessions, sessions.Count);
        Assert.All(sessions, s => Assert.Equal(TimeSpan.FromMinutes(120), s.EndAtUtc - s.StartAtUtc));
    }

    [Theory]
    [InlineData(0)]
    [InlineData(-10)]
    [InlineData(721)]
    public async Task Api_rejects_invalid_duration_even_when_client_validation_is_bypassed(int duration)
    {
        var data = await CourseTestData.CreateAsync(factory, publish: false);
        using var client = factory.CreateApiClient(data.ManagerId, UserRole.CenterManager);
        data.Request.SessionMinutes = duration;
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PutAsJsonAsync($"/api/manager/classes/{data.Id}", data.Request)).StatusCode);
    }

    [Fact]
    public async Task Create_update_and_publish_enforce_entire_session_against_current_center_hours()
    {
        var data = await CourseTestData.CreateAsync(factory, publish: false);
        using var client = factory.CreateApiClient(data.ManagerId, UserRole.CenterManager);
        var old = await factory.QueryAsync(db => db.Set<SystemSetting>().Where(s =>
            s.Key == SystemSettingKeys.CenterOpeningMinutes || s.Key == SystemSettingKeys.CenterClosingMinutes)
            .ToDictionaryAsync(s => s.Key, s => s.Value));
        try
        {
            async Task Setting(string key, string value) => (await client.PutAsJsonAsync($"/api/system-settings/{key}", new { value })).EnsureSuccessStatusCode();
            async Task Outside(HttpResponseMessage response) {
                Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
                Assert.Equal("outside_center_hours", (await response.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("error").GetString());
            }
            await Setting(SystemSettingKeys.CenterOpeningMinutes, "480");
            await Setting(SystemSettingKeys.CenterClosingMinutes, "1200");
            data.Request.Code = "DURATION-" + Guid.NewGuid().ToString("N");
            data.Request.SessionMinutes = 120;
            data.Request.ScheduleRules[0].StartTimeLocal = "18:01";
            await Outside(await client.PostAsJsonAsync("/api/manager/classes", data.Request));
            await Outside(await client.PutAsJsonAsync($"/api/manager/classes/{data.Id}", data.Request));
            data.Request.ScheduleRules[0].StartTimeLocal = "07:59";
            await Outside(await client.PostAsJsonAsync("/api/manager/classes", data.Request));
            data.Request.ScheduleRules[0].StartTimeLocal = "23:00";
            await Outside(await client.PostAsJsonAsync("/api/manager/classes", data.Request));
            data.Request.ScheduleRules[0].StartTimeLocal = "18:00";
            var created = await client.PostAsJsonAsync("/api/manager/classes", data.Request);
            Assert.Equal(HttpStatusCode.Created, created.StatusCode);
            var id = (await created.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("classId").GetInt32();
            // Hours can change between drafting and publishing; publish must revalidate.
            await Setting(SystemSettingKeys.CenterClosingMinutes, "1199");
            await Outside(await client.PostAsJsonAsync($"/api/manager/classes/{id}/publish", new { }));
            Assert.Empty(await CourseTestData.SessionsAsync(factory, id));
            await Setting(SystemSettingKeys.CenterClosingMinutes, "1200");
            var published = await client.PostAsJsonAsync($"/api/manager/classes/{id}/publish", new { });
            Assert.True(published.IsSuccessStatusCode, await published.Content.ReadAsStringAsync());
            Assert.All(await CourseTestData.SessionsAsync(factory, id), s => Assert.Equal(TimeSpan.FromMinutes(120), s.EndAtUtc - s.StartAtUtc));
        }
        finally
        {
            await factory.QueryAsync(async db => {
                foreach (var row in old)
                    await db.Set<SystemSetting>().Where(s => s.Key == row.Key).ExecuteUpdateAsync(s => s.SetProperty(x => x.Value, row.Value));
                return 0;
            });
        }
    }
}
