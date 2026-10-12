using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SportHub.API.Persistence;
using SportHub.BuildingBlocks.Abstractions.Identity;
using SportHub.Identity.Domain.Entities;
using SportHub.Identity.Domain.Enums;

namespace SportHub.Security.Tests.Integration;

/// <summary>BR-96 — chuyên môn theo môn thay CoachCategory: Manager quản lý Coach, guard PT dựa trên qualification dịch vụ PT của Gym.</summary>
[Collection(nameof(SportHubApiCollection))]
public class CoachSpecialtyAuthorizationTests(SportHubApiFactory factory)
{
    private const string Password = "Coach-Strong-Pass-1!";
    private const int PersonalTrainingSportId = 1; // Gym: PT là dịch vụ của Gym (offering 2 trong seed)
    private const int PersonalTrainingOfferingId = 2;
    private const int BadmintonSportId = 3;        // GroupCourse

    private static int _ip = 40;

    private HttpClient Client(Guid? userId = null, UserRole? role = null)
    {
        var client = factory.CreateApiClient();
        var n = Interlocked.Increment(ref _ip);
        client.DefaultRequestHeaders.Add(SportHubApiFactory.ClientIpHeader, $"10.80.{n / 250}.{n % 250}");
        if (userId is not null && role is not null)
        {
            client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", factory.IssueToken(userId.Value, role.Value));
        }

        return client;
    }

    private static string NewEmail() => $"coach-{Guid.NewGuid():N}@example.com";

    private static async Task<JsonElement> Json(HttpResponseMessage r) => JsonDocument.Parse(await r.Content.ReadAsStringAsync()).RootElement;

    private static async Task<string> ErrorOf(HttpResponseMessage r) => (await Json(r)).GetProperty("error").GetString()!;

    private async Task<HttpClient> ManagerClientAsync()
    {
        var manager = await factory.SeedUserAsync(NewEmail(), Password, role: UserRole.CenterManager);
        return Client(manager.UserId, UserRole.CenterManager);
    }

    private async Task<Guid> CreateCoachAsync(params int[] sportIds)
    {
        var coach = await factory.SeedUserAsync(NewEmail(), Password, role: UserRole.Coach, fullName: "Tran Huan Luyen");
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SportHubDbContext>();
        db.CoachProfiles.Add(new CoachProfile { UserId = coach.UserId });
        db.UserSportSpecialties.AddRange(sportIds.Distinct().Select(id => new UserSportSpecialty { UserId = coach.UserId, SportId = id }));
        await db.SaveChangesAsync();
        return coach.UserId;
    }

    [Fact]
    public async Task Manager_cannot_create_a_coach_because_only_the_administrator_creates_staff_accounts()
    {
        var manager = await ManagerClientAsync();

        var response = await manager.PostAsJsonAsync("api/manager/coaches", new
        {
            email = NewEmail(), fullName = "Le Van Coach", sportIds = new[] { BadmintonSportId }
        });

        Assert.Equal(HttpStatusCode.MethodNotAllowed, response.StatusCode);
    }

    [Fact]
    public async Task Only_the_manager_manages_coaches_and_cannot_create_an_administrator()
    {
        var admin = await factory.SeedUserAsync(NewEmail(), Password, role: UserRole.SystemAdministrator);
        var receptionist = await factory.SeedUserAsync(NewEmail(), Password, role: UserRole.Receptionist);
        var manager = await factory.SeedUserAsync(NewEmail(), Password, role: UserRole.CenterManager);
        var coachId = await CreateCoachAsync(BadmintonSportId);

        Assert.Equal(HttpStatusCode.Forbidden,
            (await Client(admin.UserId, UserRole.SystemAdministrator).GetAsync($"api/manager/coaches/{coachId}")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden,
            (await Client(receptionist.UserId, UserRole.Receptionist).GetAsync($"api/manager/coaches/{coachId}")).StatusCode);

        var managerClient = Client(manager.UserId, UserRole.CenterManager);
        Assert.Equal(HttpStatusCode.OK, (await managerClient.GetAsync($"api/manager/coaches/{coachId}")).StatusCode);

        // Manager không có đường tạo tài khoản staff: POST api/users/admin/staff chỉ dành cho SystemAdministrator.
        Assert.Equal(HttpStatusCode.Forbidden,
            (await managerClient.PostAsJsonAsync("api/users/admin/staff", new
            {
                email = NewEmail(), fullName = "Ad Min", roleId = 5
            })).StatusCode);
    }

    [Fact]
    public async Task Manager_replaces_specialties_and_the_change_is_audited()
    {
        var manager = await ManagerClientAsync();
        var coachId = await CreateCoachAsync(BadmintonSportId);

        var update = await manager.PutAsJsonAsync($"api/manager/coaches/{coachId}", new { sportIds = new[] { PersonalTrainingSportId }, bio = "Chuyển sang PT" });
        Assert.Equal(HttpStatusCode.OK, update.StatusCode);
        Assert.Equal(new[] { PersonalTrainingSportId },
            (await Json(update)).GetProperty("sportIds").EnumerateArray().Select(e => e.GetInt32()).ToArray());

        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SportHubDbContext>();
        Assert.Contains("UPDATE_COACH_SPECIALTIES", await db.AuditLogs.Where(a => a.TargetId == coachId.ToString()).Select(a => a.Action).ToListAsync());

        // Không cập nhật được tài khoản không phải Coach.
        var member = await factory.SeedUserAsync(NewEmail(), Password);
        Assert.Equal(HttpStatusCode.NotFound,
            (await manager.PutAsJsonAsync($"api/manager/coaches/{member.UserId}", new { sportIds = new[] { BadmintonSportId } })).StatusCode);
    }

    [Fact]
    public async Task System_administrator_creating_a_coach_must_provide_specialties()
    {
        var admin = await factory.SeedUserAsync(NewEmail(), Password, role: UserRole.SystemAdministrator);
        var client = Client(admin.UserId, UserRole.SystemAdministrator);

        var missing = await client.PostAsJsonAsync("api/users/admin/staff", new { email = NewEmail(), fullName = "Le Van Coach", roleId = 2 });
        Assert.Equal("coach_specialty_required", await ErrorOf(missing));
        Assert.Equal("invalid_sport", await ErrorOf(await client.PostAsJsonAsync("api/users/admin/staff", new
        {
            email = NewEmail(), fullName = "Le Van Coach", roleId = 2, specialties = new[] { 9999 }
        })));

        var withSports = await client.PostAsJsonAsync("api/users/admin/staff", new
        {
            email = NewEmail(), fullName = "Le Van Coach", roleId = 2, specialties = new[] { PersonalTrainingSportId }
        });
        Assert.Equal(HttpStatusCode.Created, withSports.StatusCode);
        Assert.Equal(PersonalTrainingSportId, (await Json(withSports)).GetProperty("sportIds")[0].GetInt32());

        var notCoach = await client.PostAsJsonAsync("api/users/admin/staff", new
        {
            email = NewEmail(), fullName = "Le Tan", roleId = 4, specialties = new[] { BadmintonSportId }
        });
        Assert.Equal("sport_ids_not_applicable", await ErrorOf(notCoach));
    }

    [Fact]
    public async Task Personal_trainer_guard_follows_one_on_one_specialty_role_status_and_sport_state()
    {
        var manager = await ManagerClientAsync();
        var trainerId = await CreateCoachAsync(PersonalTrainingSportId);
        var instructorId = await CreateCoachAsync(BadmintonSportId);

        using var scope = factory.Services.CreateScope();
        var reader = scope.ServiceProvider.GetRequiredService<ICoachSpecialtyReader>();

        // Chỉ có chuyên môn Gym thì chưa phải PT: quyền PT đến từ qualification dịch vụ PT.
        Assert.False(await reader.IsPersonalTrainerAsync(trainerId));
        var qualify = await manager.PutAsJsonAsync($"api/manager/coaches/{trainerId}/service-qualifications",
            new { offeringIds = new[] { PersonalTrainingOfferingId } });
        Assert.Equal(HttpStatusCode.OK, qualify.StatusCode);
        // Coach không có chuyên môn Gym không được cấp qualification PT.
        var rejected = await manager.PutAsJsonAsync($"api/manager/coaches/{instructorId}/service-qualifications",
            new { offeringIds = new[] { PersonalTrainingOfferingId } });
        Assert.Equal("coach_missing_sport_specialty", await ErrorOf(rejected));

        Assert.True(await reader.IsPersonalTrainerAsync(trainerId));
        Assert.False(await reader.IsPersonalTrainerAsync(instructorId)); // chỉ môn nhóm
        Assert.False(await reader.IsPersonalTrainerAsync(Guid.NewGuid())); // không tồn tại

        // HTTP: endpoint dành cho PT chặn Coach không có chuyên môn 1-1, cho qua Coach có.
        Assert.Equal(HttpStatusCode.Forbidden,
            (await Client(instructorId, UserRole.Coach).GetAsync("api/coaches/me/workout-plans")).StatusCode);
        Assert.Equal(HttpStatusCode.OK,
            (await Client(trainerId, UserRole.Coach).GetAsync("api/coaches/me/workout-plans")).StatusCode);

        // Tài khoản bị khóa không còn là PT.
        await factory.SetStatusAsync(trainerId, UserStatus.Banned);
        Assert.False(await reader.IsPersonalTrainerAsync(trainerId));
        await factory.SetStatusAsync(trainerId, UserStatus.Active);
        Assert.True(await reader.IsPersonalTrainerAsync(trainerId));

        // Có chuyên môn Gym nhưng không còn role Coach thì không phải PT (chuyên môn chỉ hiệu lực với role Coach).
        var member = await factory.SeedUserAsync(NewEmail(), Password);
        var db = scope.ServiceProvider.GetRequiredService<SportHubDbContext>();
        db.UserSportSpecialties.Add(new UserSportSpecialty { UserId = member.UserId, SportId = PersonalTrainingSportId });
        await db.SaveChangesAsync();
        Assert.False(await reader.IsPersonalTrainerAsync(member.UserId));

        // Môn Gym (chứa dịch vụ PT) ngừng hoạt động thì không ai được coi là PT.
        var sports = scope.ServiceProvider.GetRequiredService<SportHub.Scheduling.Catalog.Application.SportCatalogService>();
        var actor = (await factory.SeedUserAsync(NewEmail(), Password, role: UserRole.CenterManager)).UserId;
        await sports.DeactivateAsync(PersonalTrainingSportId, actor);
        try
        {
            Assert.False(await reader.IsPersonalTrainerAsync(trainerId));
        }
        finally
        {
            await sports.ActivateAsync(PersonalTrainingSportId, actor);
        }
    }
}
