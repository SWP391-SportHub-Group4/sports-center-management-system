using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SportHub.API.Persistence;
using SportHub.BuildingBlocks.Abstractions.Identity;
using SportHub.Identity.Domain.Enums;

namespace SportHub.Security.Tests.Integration;

/// <summary>BR-105 — ExternalCoach tự đăng ký, Manager duyệt; RBAC và ranh giới quyền.</summary>
[Collection(nameof(SportHubApiCollection))]
public class ExternalCoachApprovalTests(SportHubApiFactory factory)
{
    private const string Password = "Coach-Strong-Pass-1!";
    private const int BadmintonSportId = 3; // seed trong migration MultiSportIdentityCatalog
    private const int BasketballSportId = 4;

    private static int _ip = 10;

    private HttpClient Client(string? token = null)
    {
        var client = factory.CreateApiClient();
        var n = Interlocked.Increment(ref _ip);
        client.DefaultRequestHeaders.Add(SportHubApiFactory.ClientIpHeader, $"10.70.{n / 250}.{n % 250}");
        if (token is not null)
        {
            client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);
        }

        return client;
    }

    private static string NewEmail() => $"ext-{Guid.NewGuid():N}@example.com";

    private static async Task<JsonElement> Json(HttpResponseMessage r)
        => JsonDocument.Parse(await r.Content.ReadAsStringAsync()).RootElement;

    private async Task<Guid> RegisterAsync(string email, int[]? sportIds = null, object? extra = null)
    {
        var otpResponse = await Client().PostAsync("api/auth/external-coach/otp", JsonContent.Create(new { email }));
        Assert.Equal(HttpStatusCode.NoContent, otpResponse.StatusCode);
        var otp = factory.Emails.LatestOtpFor(email);

        var body = new Dictionary<string, object?>
        {
            ["email"] = email,
            ["password"] = Password,
            ["confirmPassword"] = Password,
            ["fullName"] = "Le Van Ngoai",
            ["otpCode"] = otp,
            ["bio"] = "HLV cầu lông",
            ["sportIds"] = sportIds ?? [BadmintonSportId]
        };

        if (extra is not null)
        {
            foreach (var p in extra.GetType().GetProperties())
            {
                body[p.Name] = p.GetValue(extra);
            }
        }

        var response = await Client().PostAsync("api/auth/external-coach/register", JsonContent.Create(body));
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        return (await Json(response)).GetProperty("user").GetProperty("userId").GetGuid();
    }

    private async Task<Guid> SeedRoleAsync(UserRole role)
        => (await factory.SeedUserAsync(NewEmail(), Password, role: role)).UserId;

    private async Task<HttpResponseMessage> Review(Guid managerId, Guid coachId, string action, string? note = null)
        => await Client(factory.IssueToken(managerId, UserRole.CenterManager))
            .PostAsync($"api/manager/external-coaches/{coachId}/{action}", JsonContent.Create(new { note }));

    [Fact]
    public async Task Register_creates_a_pending_external_coach_and_ignores_any_role_in_the_body()
    {
        var email = NewEmail();
        var userId = await RegisterAsync(email, extra: new { role = "SystemAdministrator", roleId = 5 });

        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SportHubDbContext>();
        var user = await db.UserAccounts.Include(u => u.Role).SingleAsync(u => u.UserId == userId);
        var profile = await db.ExternalCoachProfiles.SingleAsync(p => p.UserId == userId);

        Assert.Equal(UserRole.ExternalCoach, user.Role!.RoleName);
        Assert.Equal(ExternalCoachApprovalStatus.PendingApproval, profile.ApprovalStatus);
        Assert.Equal([BadmintonSportId], await db.UserSportSpecialties.Where(s => s.UserId == userId).Select(s => s.SportId).ToListAsync());
    }

    [Fact]
    public async Task Register_rejects_unknown_sport_weak_password_and_reused_otp()
    {
        var email = NewEmail();
        await Client().PostAsync("api/auth/external-coach/otp", JsonContent.Create(new { email }));
        var otp = factory.Emails.LatestOtpFor(email);

        object Body(string password, int sport) => new
        {
            email, password, confirmPassword = password, fullName = "Le Van Ngoai", otpCode = otp, sportIds = new[] { sport }
        };

        var badSport = await Client().PostAsync("api/auth/external-coach/register", JsonContent.Create(Body(Password, 9999)));
        Assert.Equal("invalid_sport", (await Json(badSport)).GetProperty("error").GetString());

        var weak = await Client().PostAsync("api/auth/external-coach/register", JsonContent.Create(Body("weakpass", BadmintonSportId)));
        Assert.Equal("password_missing_character_groups", (await Json(weak)).GetProperty("error").GetString());

        // Hai lần lỗi trên chưa tiêu OTP: đăng ký đúng vẫn thành công một lần, lần hai bị chặn.
        var ok = await Client().PostAsync("api/auth/external-coach/register", JsonContent.Create(Body(Password, BadmintonSportId)));
        Assert.Equal(HttpStatusCode.Created, ok.StatusCode);

        var again = await Client().PostAsync("api/auth/external-coach/register", JsonContent.Create(Body(Password, BadmintonSportId)));
        Assert.Equal(HttpStatusCode.BadRequest, again.StatusCode);
        Assert.Equal("otp_already_used", (await Json(again)).GetProperty("error").GetString());
    }

    [Fact]
    public async Task Otp_request_for_an_existing_email_is_409()
    {
        var email = NewEmail();
        await factory.SeedUserAsync(email, Password);

        var response = await Client().PostAsync("api/auth/external-coach/otp", JsonContent.Create(new { email }));

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
    }

    [Fact]
    public async Task Pending_external_coach_sees_own_profile_but_no_operational_data()
    {
        var coachId = await RegisterAsync(NewEmail());
        var token = factory.IssueToken(coachId, UserRole.ExternalCoach);

        var me = await Client(token).GetAsync("api/external-coaches/me");
        Assert.Equal(HttpStatusCode.OK, me.StatusCode);
        Assert.Equal("PENDING_APPROVAL", (await Json(me)).GetProperty("approvalStatus").GetString());

        // Không xem được danh sách người dùng/hội viên, không vào khu Manager.
        Assert.Equal(HttpStatusCode.Forbidden, (await Client(token).GetAsync("api/users")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await Client(token).GetAsync("api/manager/external-coaches")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await Client(token).GetAsync("api/payment-adjustments")).StatusCode);
    }

    [Fact]
    public async Task Manager_reviews_through_the_state_machine_and_rental_access_follows_status()
    {
        var managerId = await SeedRoleAsync(UserRole.CenterManager);
        var coachId = await RegisterAsync(NewEmail(), [BadmintonSportId]);

        using var scope = factory.Services.CreateScope();
        var access = scope.ServiceProvider.GetRequiredService<IExternalCoachAccessReader>();

        Assert.False(await access.CanRentForSportAsync(coachId, BadmintonSportId));

        // Từ chối/đình chỉ bắt buộc có lý do.
        Assert.Equal("review_note_required", (await Json(await Review(managerId, coachId, "reject"))).GetProperty("error").GetString());

        // Approved -> Suspended chỉ hợp lệ sau khi Approved.
        Assert.Equal(HttpStatusCode.Conflict, (await Review(managerId, coachId, "suspend", "vi phạm quy định")).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, (await Review(managerId, coachId, "reactivate")).StatusCode);

        Assert.Equal(HttpStatusCode.OK, (await Review(managerId, coachId, "approve")).StatusCode);
        Assert.True(await access.CanRentForSportAsync(coachId, BadmintonSportId));
        Assert.False(await access.CanRentForSportAsync(coachId, BasketballSportId)); // môn ngoài hồ sơ

        // Đã Approved thì approve/reject lại bị 409 (không ghi đè quyết định).
        Assert.Equal(HttpStatusCode.Conflict, (await Review(managerId, coachId, "approve")).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, (await Review(managerId, coachId, "reject", "không đạt yêu cầu")).StatusCode);

        Assert.Equal(HttpStatusCode.OK, (await Review(managerId, coachId, "suspend", "vi phạm quy định")).StatusCode);
        Assert.False(await access.CanRentForSportAsync(coachId, BadmintonSportId));

        // Suspended vẫn xem được hồ sơ và lý do của mình.
        var me = await Client(factory.IssueToken(coachId, UserRole.ExternalCoach)).GetAsync("api/external-coaches/me");
        var json = await Json(me);
        Assert.Equal("SUSPENDED", json.GetProperty("approvalStatus").GetString());
        Assert.Equal("vi phạm quy định", json.GetProperty("reviewNote").GetString());

        Assert.Equal(HttpStatusCode.OK, (await Review(managerId, coachId, "reactivate")).StatusCode);
        Assert.True(await access.CanRentForSportAsync(coachId, BadmintonSportId));

        var db = scope.ServiceProvider.GetRequiredService<SportHubDbContext>();
        var actions = await db.AuditLogs.Where(a => a.TargetId == coachId.ToString()).Select(a => a.Action).ToListAsync();
        Assert.Contains("APPROVE_EXTERNAL_COACH", actions);
        Assert.Contains("SUSPEND_EXTERNAL_COACH", actions);
        Assert.Contains("REACTIVATE_EXTERNAL_COACH", actions);
    }

    [Fact]
    public async Task Rejected_external_coach_cannot_rent_and_keeps_the_note()
    {
        var managerId = await SeedRoleAsync(UserRole.CenterManager);
        var coachId = await RegisterAsync(NewEmail());

        Assert.Equal(HttpStatusCode.OK, (await Review(managerId, coachId, "reject", "thiếu chứng chỉ")).StatusCode);

        using var scope = factory.Services.CreateScope();
        var access = scope.ServiceProvider.GetRequiredService<IExternalCoachAccessReader>();
        Assert.False(await access.CanRentForSportAsync(coachId, BadmintonSportId));

        var detail = await Json(await Client(factory.IssueToken(managerId, UserRole.CenterManager))
            .GetAsync($"api/manager/external-coaches/{coachId}"));
        Assert.Equal("REJECTED", detail.GetProperty("approvalStatus").GetString());
    }

    [Fact]
    public async Task Only_the_manager_can_review_not_the_system_administrator_or_other_roles()
    {
        var coachId = await RegisterAsync(NewEmail());
        var adminId = await SeedRoleAsync(UserRole.SystemAdministrator);
        var memberId = await SeedRoleAsync(UserRole.Member);
        var receptionistId = await SeedRoleAsync(UserRole.Receptionist);

        foreach (var (id, role) in new[]
                 {
                     (adminId, UserRole.SystemAdministrator), (memberId, UserRole.Member), (receptionistId, UserRole.Receptionist)
                 })
        {
            var response = await Client(factory.IssueToken(id, role))
                .PostAsync($"api/manager/external-coaches/{coachId}/approve", JsonContent.Create(new { }));

            Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
        }
    }

    [Fact]
    public async Task System_administrator_cannot_create_or_assign_the_external_coach_role()
    {
        var adminId = await SeedRoleAsync(UserRole.SystemAdministrator);
        var adminToken = factory.IssueToken(adminId, UserRole.SystemAdministrator);

        var create = await Client(adminToken).PostAsync("api/users", JsonContent.Create(new
        {
            email = NewEmail(), password = Password, fullName = "Nhan Vien", role = "ExternalCoach"
        }));
        Assert.Equal("external_coach_managed_separately", (await Json(create)).GetProperty("error").GetString());

        var memberId = await SeedRoleAsync(UserRole.Member);
        var assign = await Client(adminToken).PutAsync($"api/users/{memberId}/role",
            JsonContent.Create(new { role = "ExternalCoach", reason = "thử gán" }));
        Assert.Equal(HttpStatusCode.BadRequest, assign.StatusCode);

        // Admin cũng không tạo được nhân sự bằng mật khẩu yếu.
        var weak = await Client(adminToken).PostAsync("api/users", JsonContent.Create(new
        {
            email = NewEmail(), password = "12345678", fullName = "Nhan Vien", role = "Receptionist"
        }));
        Assert.Equal("password_missing_character_groups", (await Json(weak)).GetProperty("error").GetString());
    }

    [Fact]
    public async Task Changing_a_role_invalidates_the_old_token_immediately()
    {
        var adminId = await SeedRoleAsync(UserRole.SystemAdministrator);
        var receptionist = await factory.SeedUserAsync(NewEmail(), Password, role: UserRole.Receptionist);
        var oldToken = factory.IssueToken(receptionist.UserId, UserRole.Receptionist);

        Assert.Equal(HttpStatusCode.OK, (await Client(oldToken).GetAsync("api/__tests/protected")).StatusCode);

        var change = await Client(factory.IssueToken(adminId, UserRole.SystemAdministrator)).PutAsync(
            $"api/users/{receptionist.UserId}/role",
            JsonContent.Create(new { role = "CenterManager", reason = "thăng chức" }));
        Assert.Equal(HttpStatusCode.OK, change.StatusCode);

        Assert.Equal(HttpStatusCode.Unauthorized, (await Client(oldToken).GetAsync("api/__tests/protected")).StatusCode);
        Assert.Equal(HttpStatusCode.OK,
            (await Client(factory.IssueToken(receptionist.UserId, UserRole.CenterManager)).GetAsync("api/__tests/protected")).StatusCode);
    }

    [Fact]
    public async Task Specialty_reader_uses_user_sport_specialties_for_internal_coaches()
    {
        var coach = await factory.SeedUserAsync(NewEmail(), Password, role: UserRole.Coach);
        var member = await factory.SeedUserAsync(NewEmail(), Password, role: UserRole.Member);

        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SportHubDbContext>();
        db.UserSportSpecialties.AddRange(
            new SportHub.Identity.Domain.Entities.UserSportSpecialty { UserId = coach.UserId, SportId = BadmintonSportId },
            new SportHub.Identity.Domain.Entities.UserSportSpecialty { UserId = member.UserId, SportId = BadmintonSportId });
        await db.SaveChangesAsync();

        var reader = scope.ServiceProvider.GetRequiredService<ICoachSpecialtyReader>();

        Assert.True(await reader.IsActiveInternalCoachAsync(coach.UserId));
        Assert.False(await reader.IsActiveInternalCoachAsync(member.UserId)); // không phải Coach dù có dòng chuyên môn
        Assert.True(await reader.HasSportAsync(coach.UserId, BadmintonSportId));
        Assert.False(await reader.HasSportAsync(coach.UserId, BasketballSportId));
        Assert.Equal([BadmintonSportId], await reader.GetSportIdsAsync(coach.UserId));

        await factory.SetStatusAsync(coach.UserId, UserStatus.Banned);
        Assert.False(await reader.IsActiveInternalCoachAsync(coach.UserId));
    }
}
