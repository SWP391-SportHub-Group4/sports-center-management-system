using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.Extensions.DependencyInjection;
using SportHub.API.Persistence;
using SportHub.Identity.Domain.Enums;
using SportHub.Training.Domain.Entities;
using SportHub.Training.Domain.Enums;

namespace SportHub.Security.Tests.Integration;

/// <summary>Hồ sơ sức khỏe do hội viên tự khai: kiểm tra đầu vào, BMI tính ở server, lịch sử số đo và phạm vi đọc.</summary>
[Collection(nameof(SportHubApiCollection))]
public sealed class TrainingProfileTests(SportHubApiFactory factory)
{
    private static object ValidProfile(decimal weightKg = 70m, decimal? targetWeightKg = null) => new
    {
        goal = "Lose a little fat and build a regular routine",
        goalType = "FAT_LOSS",
        experienceLevel = "BEGINNER",
        dateOfBirth = DateOnly.FromDateTime(DateTime.UtcNow.AddYears(-28)).ToString("yyyy-MM-dd"),
        sex = "FEMALE",
        heightCm = 165.0m,
        weightKg,
        targetWeightKg,
        activityLevel = "LIGHTLY_ACTIVE",
        trainingDaysPerWeek = 3,
        sessionMinutes = 60,
        dietaryPreference = "VEGETARIAN",
        foodAllergies = "Peanuts",
        notes = "Mild knee pain on stairs"
    };

    private HttpClient As(Guid userId, UserRole role)
    {
        var client = factory.CreateApiClient();
        client.DefaultRequestHeaders.Authorization =
            new AuthenticationHeaderValue("Bearer", factory.IssueToken(userId, role));
        return client;
    }

    private static async Task<JsonElement> Json(HttpResponseMessage response)
        => JsonDocument.Parse(await response.Content.ReadAsStringAsync()).RootElement.Clone();

    [Fact]
    public async Task Member_saves_a_profile_and_server_computes_bmi_and_records_measurement_history_on_change()
    {
        var member = await factory.SeedUserAsync($"profile-{Guid.NewGuid():N}@example.com", null);
        var client = As(member.UserId, UserRole.Member);

        Assert.Equal(HttpStatusCode.NoContent, (await client.GetAsync("api/members/me/training-profile")).StatusCode);

        var saved = await client.PutAsJsonAsync("api/members/me/training-profile", ValidProfile());
        Assert.Equal(HttpStatusCode.OK, saved.StatusCode);
        var body = await Json(saved);
        Assert.Equal(25.7m, body.GetProperty("bmi").GetDecimal());
        Assert.Equal("OVERWEIGHT", body.GetProperty("bmiCategory").GetString());
        Assert.True(body.GetProperty("isComplete").GetBoolean());
        Assert.Equal(1, body.GetProperty("recentMeasurements").GetArrayLength());

        // Cùng số đo: không thêm dòng lịch sử. Đổi cân nặng: thêm một dòng.
        await client.PutAsJsonAsync("api/members/me/training-profile", ValidProfile());
        var changed = await Json(await client.PutAsJsonAsync("api/members/me/training-profile", ValidProfile(68.5m)));
        Assert.Equal(2, changed.GetProperty("recentMeasurements").GetArrayLength());
        Assert.Equal(25.2m, changed.GetProperty("bmi").GetDecimal());
    }

    [Fact]
    public async Task Profile_rejects_missing_required_fields_underage_dates_and_unsafe_targets()
    {
        var member = await factory.SeedUserAsync($"profile-bad-{Guid.NewGuid():N}@example.com", null);
        var client = As(member.UserId, UserRole.Member);

        var missing = await client.PutAsJsonAsync("api/members/me/training-profile", new { goal = "Get fitter" });
        Assert.Equal(HttpStatusCode.BadRequest, missing.StatusCode);

        var underage = ValidProfile();
        var tooYoung = JsonSerializer.SerializeToElement(underage);
        var payload = JsonSerializer.Deserialize<Dictionary<string, object?>>(tooYoung.GetRawText())!;
        payload["dateOfBirth"] = DateOnly.FromDateTime(DateTime.UtcNow.AddYears(-10)).ToString("yyyy-MM-dd");
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PutAsJsonAsync("api/members/me/training-profile", payload)).StatusCode);

        // 165 cm / 45 kg cho BMI 16.5, dưới ngưỡng thiếu cân nên mục tiêu bị từ chối.
        var unsafeTarget = await client.PutAsJsonAsync("api/members/me/training-profile", ValidProfile(70m, 45m));
        Assert.Equal(HttpStatusCode.BadRequest, unsafeTarget.StatusCode);
        Assert.Equal("target_weight_unsafe", (await Json(unsafeTarget)).GetProperty("error").GetString());
    }

    [Fact]
    public async Task Health_profile_is_readable_only_by_manager_and_a_coach_of_an_active_class()
    {
        var member = await factory.SeedUserAsync($"profile-scope-{Guid.NewGuid():N}@example.com", null);
        var assignedCoach = await factory.SeedUserAsync($"coach-yes-{Guid.NewGuid():N}@example.com", null, role: UserRole.Coach);
        var otherCoach = await factory.SeedUserAsync($"coach-no-{Guid.NewGuid():N}@example.com", null, role: UserRole.Coach);
        var manager = await factory.SeedUserAsync($"manager-{Guid.NewGuid():N}@example.com", null, role: UserRole.CenterManager);
        var receptionist = await factory.SeedUserAsync($"desk-{Guid.NewGuid():N}@example.com", null, role: UserRole.Receptionist);

        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<SportHubDbContext>();
            db.Set<CoachMemberRelationship>().Add(new CoachMemberRelationship
            {
                RelationshipId = Guid.NewGuid(), CoachId = assignedCoach.UserId, MemberId = member.UserId,
                SourceType = RelationshipSourceType.AssignedByManager,
                Status = RelationshipStatus.Active, StartedAt = DateTime.UtcNow
            });
            await db.SaveChangesAsync();
        }

        await As(member.UserId, UserRole.Member).PutAsJsonAsync("api/members/me/training-profile", ValidProfile());
        await CoachClassScopeData.AssignAsync(factory, assignedCoach.UserId, member.UserId);
        var path = $"api/members/{member.UserId}/training-profile";

        Assert.Equal(HttpStatusCode.OK, (await As(manager.UserId, UserRole.CenterManager).GetAsync(path)).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await As(assignedCoach.UserId, UserRole.Coach).GetAsync(path)).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await As(otherCoach.UserId, UserRole.Coach).GetAsync(path)).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await As(receptionist.UserId, UserRole.Receptionist).GetAsync(path)).StatusCode);
    }
}
