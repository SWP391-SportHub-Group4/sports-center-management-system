using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SportHub.API.Persistence;
using SportHub.Identity.Domain.Entities;
using SportHub.Identity.Domain.Enums;

namespace SportHub.Security.Tests.Integration;

/// <summary>
/// Member và Staff là hai loại tài khoản tách biệt: không đổi qua lại (409). Đổi giữa các role staff vẫn được;
/// Coach rời vai trò bị chặn khi còn lớp/lịch/quan hệ huấn luyện và được gỡ chuyên môn khi đổi thành công.
/// </summary>
[Collection(nameof(SportHubApiCollection))]
public class RoleChangeValidationTests(SportHubApiFactory factory)
{
    private const string Password = "Role-Change-Pass-1!";
    private const int GymSportId = 1;
    private static int _ip = 10;

    private static string NewEmail() => $"rc-{Guid.NewGuid():N}@example.com";

    private async Task<HttpClient> AdminAsync()
    {
        var admin = await factory.SeedUserAsync(NewEmail(), Password, role: UserRole.SystemAdministrator);
        var client = factory.CreateApiClient();
        var n = Interlocked.Increment(ref _ip);
        client.DefaultRequestHeaders.Add(SportHubApiFactory.ClientIpHeader, $"10.90.{n / 250}.{n % 250}");
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer",
            factory.IssueToken(admin.UserId, UserRole.SystemAdministrator));
        return client;
    }

    private static async Task<JsonElement> Json(HttpResponseMessage r) => JsonDocument.Parse(await r.Content.ReadAsStringAsync()).RootElement;

    private async Task<Guid> SeedCoachAsync()
    {
        var coach = await factory.SeedUserAsync(NewEmail(), Password, role: UserRole.Coach);
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SportHubDbContext>();
        db.Set<CoachProfile>().Add(new CoachProfile { UserId = coach.UserId });
        db.Set<UserSportSpecialty>().Add(new UserSportSpecialty { UserId = coach.UserId, SportId = GymSportId });
        await db.SaveChangesAsync();
        return coach.UserId;
    }

    private static async Task AssertNotConvertibleAsync(HttpResponseMessage response)
    {
        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        Assert.Equal("member_staff_role_change_not_allowed", (await Json(response)).GetProperty("error").GetString());
    }

    [Theory]
    [InlineData("Receptionist")]
    [InlineData("CenterManager")]
    [InlineData("SystemAdministrator")]
    public async Task Member_cannot_be_converted_to_any_staff_role(string target)
    {
        var admin = await AdminAsync();
        var member = await factory.SeedUserAsync(NewEmail(), Password);

        await AssertNotConvertibleAsync(await admin.PutAsJsonAsync(
            $"api/users/{member.UserId}/role", new { role = target, reason = "Promote member" }));
    }

    [Fact]
    public async Task Member_cannot_be_converted_to_coach()
    {
        var admin = await AdminAsync();
        var member = await factory.SeedUserAsync(NewEmail(), Password);

        await AssertNotConvertibleAsync(await admin.PutAsJsonAsync(
            $"api/users/{member.UserId}/role", new { role = "Coach", reason = "Promote member", sportIds = new[] { GymSportId } }));
    }

    [Theory]
    [InlineData(UserRole.Receptionist)]
    [InlineData(UserRole.CenterManager)]
    [InlineData(UserRole.Coach)]
    public async Task Staff_cannot_be_converted_to_member(UserRole current)
    {
        var admin = await AdminAsync();
        var staff = await factory.SeedUserAsync(NewEmail(), Password, role: current);

        await AssertNotConvertibleAsync(await admin.PutAsJsonAsync(
            $"api/users/{staff.UserId}/role", new { role = "Member", reason = "Demote staff" }));
    }

    [Fact]
    public async Task Staff_can_change_between_staff_roles()
    {
        var admin = await AdminAsync();
        var staff = await factory.SeedUserAsync(NewEmail(), Password, role: UserRole.Receptionist);

        var response = await admin.PutAsJsonAsync($"api/users/{staff.UserId}/role", new { role = "CenterManager", reason = "Promoted" });

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    [Theory]
    [InlineData(true, "Receptionist")]
    [InlineData(true, "CenterManager")]
    [InlineData(true, "Coach")]
    [InlineData(true, "Member")]
    [InlineData(false, "Receptionist")]
    [InlineData(false, "CenterManager")]
    [InlineData(false, "Coach")]
    [InlineData(false, "Member")]
    public async Task Administrator_cannot_change_own_or_another_administrators_role(bool self, string targetRole)
    {
        var actor = await factory.SeedUserAsync(NewEmail(), Password, role: UserRole.SystemAdministrator);
        // Another active Admin exists even when testing self-demotion: this is not the old last-Admin guard.
        var other = await factory.SeedUserAsync(NewEmail(), Password, role: UserRole.SystemAdministrator);
        var target = self ? actor : other;
        using var client = factory.CreateApiClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer",
            factory.IssueToken(actor.UserId, UserRole.SystemAdministrator));

        var response = await client.PutAsJsonAsync($"api/users/{target.UserId}/role", new
        {
            role = targetRole, reason = "Attempt to change Administrator role",
            sportIds = targetRole == "Coach" ? new[] { GymSportId } : Array.Empty<int>()
        });

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        Assert.Equal("administrator_role_change_not_allowed", (await Json(response)).GetProperty("error").GetString());
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SportHubDbContext>();
        var persisted = await db.UserAccounts.Include(u => u.Role).SingleAsync(u => u.UserId == target.UserId);
        Assert.Equal(UserRole.SystemAdministrator, persisted.Role!.RoleName);
        Assert.Equal(target.SecurityStamp, persisted.SecurityStamp);
        Assert.False(await db.AuditLogs.AnyAsync(a => a.Action == "CHANGE_USER_ROLE" && a.TargetId == target.UserId.ToString()));
    }

    [Theory]
    [InlineData(UserStatus.Banned)]
    [InlineData(UserStatus.Deactivated)]
    public async Task Inactive_administrators_roles_are_also_protected(UserStatus status)
    {
        using var admin = await AdminAsync();
        var target = await factory.SeedUserAsync(NewEmail(), Password, status: status, role: UserRole.SystemAdministrator);
        var response = await admin.PutAsJsonAsync($"api/users/{target.UserId}/role",
            new { role = "Receptionist", reason = "Change inactive Administrator" });
        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        Assert.Equal("administrator_role_change_not_allowed", (await Json(response)).GetProperty("error").GetString());
    }

    [Fact]
    public async Task Staff_can_be_promoted_to_administrator_and_is_then_protected()
    {
        using var admin = await AdminAsync();
        var staff = await factory.SeedUserAsync(NewEmail(), Password, role: UserRole.Receptionist);
        var promoted = await admin.PutAsJsonAsync($"api/users/{staff.UserId}/role",
            new { role = "SystemAdministrator", reason = "Promote staff to Administrator" });
        Assert.Equal(HttpStatusCode.OK, promoted.StatusCode);
        var demoted = await admin.PutAsJsonAsync($"api/users/{staff.UserId}/role",
            new { role = "Receptionist", reason = "Try to undo Administrator promotion" });
        Assert.Equal(HttpStatusCode.Conflict, demoted.StatusCode);
        Assert.Equal("administrator_role_change_not_allowed", (await Json(demoted)).GetProperty("error").GetString());
    }

    [Fact]
    public async Task Coach_leaving_for_another_staff_role_loses_specialties_and_keeps_profile()
    {
        var admin = await AdminAsync();
        var coachId = await SeedCoachAsync();

        var changed = await admin.PutAsJsonAsync($"api/users/{coachId}/role", new { role = "Receptionist", reason = "Moved to front desk" });
        Assert.Equal(HttpStatusCode.OK, changed.StatusCode);

        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SportHubDbContext>();
        Assert.False(await db.Set<UserSportSpecialty>().AnyAsync(x => x.UserId == coachId));
        Assert.True(await db.Set<CoachProfile>().AnyAsync(x => x.UserId == coachId));
    }

    [Fact]
    public async Task Coach_with_upcoming_assignments_or_active_relationships_is_blocked()
    {
        var admin = await AdminAsync();
        var coachId = await SeedCoachAsync();
        var member = await factory.SeedUserAsync(NewEmail(), Password);
        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<SportHubDbContext>();
            db.Set<SportHub.Scheduling.Occupancy.Domain.CoachOccupancy>().Add(new SportHub.Scheduling.Occupancy.Domain.CoachOccupancy
            {
                OccupancyId = Guid.NewGuid(), CoachId = coachId, SourceType = SportHub.Scheduling.Occupancy.Domain.OccupancySourceType.ReservedLegacySource,
                SourceId = Guid.NewGuid(), StartAtUtc = DateTime.UtcNow.AddDays(2), EndAtUtc = DateTime.UtcNow.AddDays(2).AddMinutes(90)
            });
            db.Set<SportHub.Training.Domain.Entities.CoachMemberRelationship>().Add(new SportHub.Training.Domain.Entities.CoachMemberRelationship
            {
                RelationshipId = Guid.NewGuid(), CoachId = coachId, MemberId = member.UserId,
                SourceType = SportHub.Training.Domain.Enums.RelationshipSourceType.AssignedByManager,
                Status = SportHub.Training.Domain.Enums.RelationshipStatus.Active, StartedAt = DateTime.UtcNow
            });
            await db.SaveChangesAsync();
        }

        var response = await admin.PutAsJsonAsync($"api/users/{coachId}/role", new { role = "Receptionist", reason = "Moved to front desk" });

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        var json = await Json(response);
        Assert.Equal("role_change_blocked", json.GetProperty("error").GetString());
        var reasons = json.GetProperty("reasons").EnumerateArray().Select(r => r.GetString()!).ToArray();
        Assert.Contains(reasons, r => r.Contains("session", StringComparison.OrdinalIgnoreCase));
        Assert.Contains(reasons, r => r.Contains("relationship", StringComparison.OrdinalIgnoreCase));
    }

    [Fact]
    public async Task Locking_coach_is_immediate_and_creates_a_manager_coverage_task()
    {
        using var admin = await AdminAsync();
        var manager = await factory.SeedUserAsync(NewEmail(), Password, role: UserRole.CenterManager);
        var coachId = await SeedCoachAsync();
        var member = await factory.SeedUserAsync(NewEmail(), Password);
        var originalStamp = factory.StampOf(coachId);
        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<SportHubDbContext>();
            db.Set<SportHub.Training.Domain.Entities.CoachMemberRelationship>().Add(new()
            {
                RelationshipId = Guid.NewGuid(), CoachId = coachId, MemberId = member.UserId,
                SourceType = SportHub.Training.Domain.Enums.RelationshipSourceType.AssignedByManager,
                Status = SportHub.Training.Domain.Enums.RelationshipStatus.Active, StartedAt = DateTime.UtcNow
            });
            await db.SaveChangesAsync();
        }

        var result = await admin.PostAsJsonAsync($"api/users/{coachId}/lock", new { reason = "Emergency suspension" });
        Assert.Equal(HttpStatusCode.OK, result.StatusCode);
        Assert.NotEqual(originalStamp, factory.StampOf(coachId));

        using var managerClient = factory.CreateApiClient();
        managerClient.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer",
            factory.IssueToken(manager.UserId, UserRole.CenterManager));
        var coverage = await Json(await managerClient.GetAsync("api/manager/coach-coverage"));
        Assert.Contains(coverage.EnumerateArray(), item => item.GetProperty("coachId").GetGuid() == coachId
            && item.GetProperty("activeRelationships").GetInt32() == 1);
        using var verify = factory.Services.CreateScope();
        var dbCheck = verify.ServiceProvider.GetRequiredService<SportHubDbContext>();
        var statusAudit = await dbCheck.Set<SportHub.Audit.Domain.Entities.AuditLog>()
            .SingleAsync(x => x.TargetEntity == nameof(UserAccount)
                && x.TargetId == coachId.ToString() && x.Action == "LOCK_USER_ACCOUNT");
        using var statusChange = JsonDocument.Parse(statusAudit.NewValue!);
        var transitionId = statusChange.RootElement.GetProperty("transitionId").GetGuid();
        Assert.NotEqual(Guid.Empty, transitionId);
        Assert.True(await dbCheck.Notifications.AnyAsync(x => x.UserId == manager.UserId
            && x.SourceEventType == SportHub.Notification.Domain.Enums.NotificationSourceEventType.CoachCoverageRequired
            && x.SourceEntityId == transitionId));
    }
}
