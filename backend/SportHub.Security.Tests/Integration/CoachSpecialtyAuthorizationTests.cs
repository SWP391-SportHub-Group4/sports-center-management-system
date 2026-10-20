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

/// <summary>BR-96 — chuyên môn theo môn: Manager quản lý Coach lớp nhóm.</summary>
[Collection(nameof(SportHubApiCollection))]
public class CoachSpecialtyAuthorizationTests(SportHubApiFactory factory)
{
    private const string Password = "Coach-Strong-Pass-1!";
    private const int GymSportId = 1;             // Gym: chỉ có Membership, không có Coach
    private const int BadmintonSportId = 3;        // GroupCourse
    private const int BasketballSportId = 4;       // GroupCourse

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

        var update = await manager.PutAsJsonAsync($"api/manager/coaches/{coachId}", new { sportIds = new[] { BasketballSportId }, bio = "Chuyển sang bóng rổ" });
        Assert.Equal(HttpStatusCode.OK, update.StatusCode);
        Assert.Equal(new[] { BasketballSportId },
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

        // Gym has no coach, so it can never be a specialty; this is data-driven (GroupCourse), not a hard-coded list.
        Assert.Equal("sport_not_coachable", await ErrorOf(await client.PostAsJsonAsync("api/users/admin/staff", new
        {
            email = NewEmail(), fullName = "Le Van Coach", roleId = 2, specialties = new[] { GymSportId }
        })));
        Assert.Equal("sport_not_coachable", await ErrorOf(await client.PostAsJsonAsync("api/users/admin/staff", new
        {
            email = NewEmail(), fullName = "Le Van Coach", roleId = 2, specialties = new[] { BadmintonSportId, GymSportId }
        })));

        // One coach may teach several sports from the moment the account is created.
        var withSports = await client.PostAsJsonAsync("api/users/admin/staff", new
        {
            email = NewEmail(), fullName = "Le Van Coach", roleId = 2, specialties = new[] { BadmintonSportId, BasketballSportId }
        });
        Assert.Equal(HttpStatusCode.Created, withSports.StatusCode);
        Assert.Equal(new[] { BadmintonSportId, BasketballSportId },
            (await Json(withSports)).GetProperty("sportIds").EnumerateArray().Select(e => e.GetInt32()).OrderBy(x => x).ToArray());

        var notCoach = await client.PostAsJsonAsync("api/users/admin/staff", new
        {
            email = NewEmail(), fullName = "Le Tan", roleId = 4, specialties = new[] { BadmintonSportId }
        });
        Assert.Equal("sport_ids_not_applicable", await ErrorOf(notCoach));
    }
}
