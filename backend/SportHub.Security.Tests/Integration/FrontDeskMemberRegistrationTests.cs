using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SportHub.API.Persistence;
using SportHub.Identity.Application.Services;
using SportHub.Identity.Domain.Enums;
using SportHub.Payment.Wallet.Domain;

namespace SportHub.Security.Tests.Integration;

/// <summary>
/// Receptionist (và Manager) đăng ký Member mới tại quầy: Member không mật khẩu, email kích hoạt, ví 0 điểm, chỉ tạo role Member.
/// Chờ kích hoạt thì gửi lại link được (cooldown 60 giây), sửa email gõ sai được (link cũ vô hiệu); đã kích hoạt thì không.
/// </summary>
[Collection(nameof(SportHubApiCollection))]
public sealed class FrontDeskMemberRegistrationTests(SportHubApiFactory factory)
{
    private const string NewPassword = "New-Member-Pass-12!";
    private static int _ip = 80;

    private HttpClient Client(Guid? userId = null, UserRole? role = null)
    {
        var client = factory.CreateApiClient();
        var n = Interlocked.Increment(ref _ip);
        client.DefaultRequestHeaders.Add(SportHubApiFactory.ClientIpHeader, $"10.93.{n / 250}.{n % 250}");
        if (userId is not null && role is not null)
            client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", factory.IssueToken(userId.Value, role.Value));
        return client;
    }

    private static async Task<JsonElement> Json(HttpResponseMessage r) => JsonDocument.Parse(await r.Content.ReadAsStringAsync()).RootElement;

    private async Task<HttpClient> ReceptionistAsync()
    {
        var staff = await factory.SeedUserAsync($"desk-{Guid.NewGuid():N}@example.com", null, role: UserRole.Receptionist);
        return Client(staff.UserId, UserRole.Receptionist);
    }

    private static object Body(string email, string? confirm = null, string name = "Walk In Member", string? phone = null)
        => new { email, confirmEmail = confirm ?? email, fullName = name, phone };

    private async Task<(HttpClient Desk, Guid MemberId, string Email)> RegisterAsync()
    {
        var desk = await ReceptionistAsync();
        var email = $"walkin-{Guid.NewGuid():N}@example.com";
        var created = await desk.PostAsJsonAsync("api/members/front-desk", Body(email));
        Assert.Equal(HttpStatusCode.Created, created.StatusCode);
        return (desk, (await Json(created)).GetProperty("userId").GetGuid(), email);
    }

    private async Task AgeOtpAsync(string email)
    {
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SportHubDbContext>();
        var otp = await db.EmailOtps.SingleAsync(x => x.Email == email && x.Purpose == EmailOtpPurpose.ResetPassword);
        otp.CreatedAt = otp.CreatedAt.AddMinutes(-5);
        await db.SaveChangesAsync();
    }

    [Fact]
    public async Task Receptionist_registers_a_member_who_activates_through_the_email_link()
    {
        var desk = await ReceptionistAsync();
        var email = $"walkin-{Guid.NewGuid():N}@example.com";

        var created = await desk.PostAsJsonAsync("api/members/front-desk", Body(email, phone: "0912" + Random.Shared.Next(100000, 999999)));

        Assert.Equal(HttpStatusCode.Created, created.StatusCode);
        var json = await Json(created);
        var memberId = json.GetProperty("userId").GetGuid();
        Assert.Equal("MEMBER", json.GetProperty("role").GetString());
        Assert.True(json.GetProperty("activationPending").GetBoolean());
        Assert.False(json.GetProperty("hasPassword").GetBoolean());

        var token = factory.Emails.LatestResetTokenFor(email);
        var mail = Assert.Single(factory.Emails.Sent, x => x.To == email && x.Subject == MemberActivationEmail.Subject);
        Assert.Contains("setup=member", mail.Body);

        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<SportHubDbContext>();
            var wallet = await db.Set<PointWallet>().SingleAsync(w => w.OwnerUserId == memberId);
            Assert.Equal(0, wallet.AvailablePoints);
            Assert.True(await db.AuditLogs.AnyAsync(a => a.Action == "FRONT_DESK_CREATE_MEMBER" && a.TargetId == memberId.ToString()));
        }

        // Chưa kích hoạt: chưa đăng nhập được, nhưng lễ tân vẫn tìm thấy và thấy cờ chờ kích hoạt.
        Assert.Equal(HttpStatusCode.Unauthorized,
            (await Client().PostAsJsonAsync("api/auth/login", new { email, password = NewPassword })).StatusCode);
        var search = await Json(await desk.GetAsync($"api/users?keyword={Uri.EscapeDataString(email)}&role=Member"));
        Assert.True(search.GetProperty("items")[0].GetProperty("activationPending").GetBoolean());

        Assert.Equal(HttpStatusCode.NoContent, (await Client().PostAsJsonAsync("api/auth/password/reset", new
        {
            email, token, newPassword = NewPassword, confirmNewPassword = NewPassword
        })).StatusCode);
        Assert.Contains(factory.Emails.Sent, x => x.To == email && x.Subject == MemberActivationCompleteEmail.Subject);
        Assert.Equal(HttpStatusCode.OK,
            (await Client().PostAsJsonAsync("api/auth/login", new { email, password = NewPassword })).StatusCode);
    }

    [Fact]
    public async Task Only_front_desk_roles_can_register_members()
    {
        var email = () => $"walkin-{Guid.NewGuid():N}@example.com";
        var manager = await factory.SeedUserAsync($"mgr-{Guid.NewGuid():N}@example.com", null, role: UserRole.CenterManager);
        Assert.Equal(HttpStatusCode.Created, (await Client(manager.UserId, UserRole.CenterManager)
            .PostAsJsonAsync("api/members/front-desk", Body(email()))).StatusCode);

        foreach (var role in new[] { UserRole.Member, UserRole.Coach, UserRole.SystemAdministrator })
        {
            var user = await factory.SeedUserAsync($"u-{Guid.NewGuid():N}@example.com", null, role: role);
            Assert.Equal(HttpStatusCode.Forbidden,
                (await Client(user.UserId, role).PostAsJsonAsync("api/members/front-desk", Body(email()))).StatusCode);
        }

        Assert.Equal(HttpStatusCode.Unauthorized, (await Client().PostAsJsonAsync("api/members/front-desk", Body(email()))).StatusCode);
    }

    [Fact]
    public async Task Registration_validates_confirmation_duplicates_and_cannot_create_staff()
    {
        var desk = await ReceptionistAsync();
        var email = $"walkin-{Guid.NewGuid():N}@example.com";

        var mismatch = await desk.PostAsJsonAsync("api/members/front-desk", Body(email, "other@example.com"));
        Assert.Equal(HttpStatusCode.BadRequest, mismatch.StatusCode);
        Assert.Equal("email_confirmation_mismatch", (await Json(mismatch)).GetProperty("error").GetString());
        Assert.DoesNotContain(factory.Emails.Sent, x => x.To == email);

        // Role không nhận từ body: dù gửi role staff vẫn chỉ tạo Member.
        var created = await desk.PostAsJsonAsync("api/members/front-desk", new
        {
            email, confirmEmail = email, fullName = "Walk In Member", role = "SystemAdministrator", roleId = 5
        });
        Assert.Equal(HttpStatusCode.Created, created.StatusCode);
        Assert.Equal("MEMBER", (await Json(created)).GetProperty("role").GetString());

        var duplicate = await desk.PostAsJsonAsync("api/members/front-desk", Body(email.ToUpperInvariant()));
        Assert.Equal(HttpStatusCode.Conflict, duplicate.StatusCode);
        Assert.Equal("email_already_exists", (await Json(duplicate)).GetProperty("error").GetString());
    }

    [Fact]
    public async Task Resend_is_rate_limited_then_replaces_the_old_link()
    {
        var (desk, memberId, email) = await RegisterAsync();
        var firstToken = factory.Emails.LatestResetTokenFor(email);

        var tooSoon = await desk.PostAsync($"api/members/front-desk/{memberId}/resend-activation", null);
        Assert.Equal(HttpStatusCode.TooManyRequests, tooSoon.StatusCode);

        await AgeOtpAsync(email);
        Assert.Equal(HttpStatusCode.OK, (await desk.PostAsync($"api/members/front-desk/{memberId}/resend-activation", null)).StatusCode);
        var secondToken = factory.Emails.LatestResetTokenFor(email);
        Assert.NotEqual(firstToken, secondToken);

        Assert.Equal(HttpStatusCode.BadRequest, (await Client().PostAsJsonAsync("api/auth/password/reset", new
        {
            email, token = firstToken, newPassword = NewPassword, confirmNewPassword = NewPassword
        })).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, (await Client().PostAsJsonAsync("api/auth/password/reset", new
        {
            email, token = secondToken, newPassword = NewPassword, confirmNewPassword = NewPassword
        })).StatusCode);
    }

    [Fact]
    public async Task Changing_a_wrong_email_voids_the_old_link_and_sends_a_new_one()
    {
        var (desk, memberId, wrongEmail) = await RegisterAsync();
        var wrongToken = factory.Emails.LatestResetTokenFor(wrongEmail);
        var rightEmail = $"right-{Guid.NewGuid():N}@example.com";

        var mismatch = await desk.PutAsJsonAsync($"api/members/front-desk/{memberId}/email",
            new { email = rightEmail, confirmEmail = "x@example.com", reason = "Typo in the email" });
        Assert.Equal(HttpStatusCode.BadRequest, mismatch.StatusCode);

        var changed = await desk.PutAsJsonAsync($"api/members/front-desk/{memberId}/email",
            new { email = rightEmail, confirmEmail = rightEmail, reason = "Typo in the email" });
        Assert.Equal(HttpStatusCode.OK, changed.StatusCode);
        Assert.Equal(rightEmail, (await Json(changed)).GetProperty("email").GetString());

        Assert.Equal(HttpStatusCode.BadRequest, (await Client().PostAsJsonAsync("api/auth/password/reset", new
        {
            email = wrongEmail, token = wrongToken, newPassword = NewPassword, confirmNewPassword = NewPassword
        })).StatusCode);
        var rightToken = factory.Emails.LatestResetTokenFor(rightEmail);
        Assert.Equal(HttpStatusCode.NoContent, (await Client().PostAsJsonAsync("api/auth/password/reset", new
        {
            email = rightEmail, token = rightToken, newPassword = NewPassword, confirmNewPassword = NewPassword
        })).StatusCode);

        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SportHubDbContext>();
        var audit = await db.AuditLogs.SingleAsync(a => a.Action == "CHANGE_PENDING_MEMBER_EMAIL" && a.TargetId == memberId.ToString());
        Assert.Contains(wrongEmail, audit.OldValue);
        Assert.Contains(rightEmail, audit.NewValue);
    }

    [Fact]
    public async Task Activated_members_and_staff_cannot_be_resent_or_have_the_email_changed()
    {
        var (desk, memberId, email) = await RegisterAsync();
        var token = factory.Emails.LatestResetTokenFor(email);
        Assert.Equal(HttpStatusCode.NoContent, (await Client().PostAsJsonAsync("api/auth/password/reset", new
        {
            email, token, newPassword = NewPassword, confirmNewPassword = NewPassword
        })).StatusCode);

        var activated = await desk.PostAsync($"api/members/front-desk/{memberId}/resend-activation", null);
        Assert.Equal(HttpStatusCode.Conflict, activated.StatusCode);
        Assert.Equal("account_not_pending_activation", (await Json(activated)).GetProperty("error").GetString());
        var newEmail = $"x-{Guid.NewGuid():N}@example.com";
        Assert.Equal(HttpStatusCode.Conflict, (await desk.PutAsJsonAsync($"api/members/front-desk/{memberId}/email",
            new { email = newEmail, confirmEmail = newEmail, reason = "Typo fix" })).StatusCode);

        // Endpoint của quầy không áp dụng cho staff: không tìm thấy như một Member.
        var staff = await factory.SeedUserAsync($"staff-{Guid.NewGuid():N}@example.com", null, role: UserRole.Receptionist);
        Assert.Equal(HttpStatusCode.NotFound, (await desk.PostAsync($"api/members/front-desk/{staff.UserId}/resend-activation", null)).StatusCode);
    }
}
