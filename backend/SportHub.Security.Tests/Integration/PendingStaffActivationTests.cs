using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SportHub.API.Persistence;
using SportHub.Identity.Application.Services;
using SportHub.Identity.Domain.Enums;

namespace SportHub.Security.Tests.Integration;

/// <summary>
/// Staff chưa kích hoạt: Admin thấy cờ activationPending, gửi lại link (cooldown 60 giây, link cũ vô hiệu) và sửa email
/// khi gõ sai (link cũ vô hiệu, link mới tới email mới, audit). Tài khoản đã kích hoạt/Member không dùng được các thao tác này.
/// </summary>
[Collection(nameof(SportHubApiCollection))]
public sealed class PendingStaffActivationTests(SportHubApiFactory factory)
{
    private const string NewPassword = "New-Staff-Pass-12!";
    private static int _ip = 40;

    private HttpClient Client(Guid? userId = null, UserRole? role = null)
    {
        var client = factory.CreateApiClient();
        var n = Interlocked.Increment(ref _ip);
        client.DefaultRequestHeaders.Add(SportHubApiFactory.ClientIpHeader, $"10.92.{n / 250}.{n % 250}");
        if (userId is not null && role is not null)
            client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", factory.IssueToken(userId.Value, role.Value));
        return client;
    }

    private static async Task<JsonElement> Json(HttpResponseMessage r) => JsonDocument.Parse(await r.Content.ReadAsStringAsync()).RootElement;

    private async Task<(HttpClient Admin, Guid StaffId, string Email)> CreatePendingReceptionistAsync()
    {
        var admin = await factory.SeedUserAsync($"inviter-{Guid.NewGuid():N}@example.com", null, role: UserRole.SystemAdministrator);
        var client = Client(admin.UserId, UserRole.SystemAdministrator);
        var email = $"pending-{Guid.NewGuid():N}@example.com";
        var created = await client.PostAsJsonAsync("api/users/admin/staff", new { email, fullName = "Pending Staff", roleId = 4 });
        Assert.Equal(HttpStatusCode.Created, created.StatusCode);
        var json = await Json(created);
        Assert.True(json.GetProperty("activationPending").GetBoolean());
        return (client, json.GetProperty("userId").GetGuid(), email);
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
    public async Task Resend_is_rate_limited_then_replaces_the_old_link()
    {
        var (admin, staffId, email) = await CreatePendingReceptionistAsync();
        var firstToken = factory.Emails.LatestResetTokenFor(email);

        var tooSoon = await admin.PostAsync($"api/users/{staffId}/resend-activation", null);
        Assert.Equal(HttpStatusCode.TooManyRequests, tooSoon.StatusCode);
        Assert.Equal("activation_resend_too_soon", (await Json(tooSoon)).GetProperty("error").GetString());

        await AgeOtpAsync(email);
        var resent = await admin.PostAsync($"api/users/{staffId}/resend-activation", null);
        Assert.Equal(HttpStatusCode.OK, resent.StatusCode);
        var secondToken = factory.Emails.LatestResetTokenFor(email);
        Assert.NotEqual(firstToken, secondToken);

        var oldLink = await Client().PostAsJsonAsync("api/auth/password/reset", new
        {
            email, token = firstToken, newPassword = NewPassword, confirmNewPassword = NewPassword
        });
        Assert.Equal(HttpStatusCode.BadRequest, oldLink.StatusCode);
        var newLink = await Client().PostAsJsonAsync("api/auth/password/reset", new
        {
            email, token = secondToken, newPassword = NewPassword, confirmNewPassword = NewPassword
        });
        Assert.Equal(HttpStatusCode.NoContent, newLink.StatusCode);

        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SportHubDbContext>();
        Assert.True(await db.AuditLogs.AnyAsync(a => a.Action == "RESEND_STAFF_ACTIVATION" && a.TargetId == staffId.ToString()));
    }

    [Fact]
    public async Task Activated_staff_and_members_cannot_be_resent_or_have_the_email_changed()
    {
        var (admin, staffId, email) = await CreatePendingReceptionistAsync();
        var token = factory.Emails.LatestResetTokenFor(email);
        Assert.Equal(HttpStatusCode.NoContent, (await Client().PostAsJsonAsync("api/auth/password/reset", new
        {
            email, token, newPassword = NewPassword, confirmNewPassword = NewPassword
        })).StatusCode);

        var activated = await admin.PostAsync($"api/users/{staffId}/resend-activation", null);
        Assert.Equal(HttpStatusCode.Conflict, activated.StatusCode);
        Assert.Equal("account_not_pending_activation", (await Json(activated)).GetProperty("error").GetString());
        Assert.Equal(HttpStatusCode.Conflict, (await admin.PutAsJsonAsync($"api/users/{staffId}/email",
            new { email = $"other-{Guid.NewGuid():N}@example.com", reason = "Typo fix" })).StatusCode);

        var member = await factory.SeedUserAsync($"member-{Guid.NewGuid():N}@example.com", null);
        Assert.Equal(HttpStatusCode.Conflict, (await admin.PostAsync($"api/users/{member.UserId}/resend-activation", null)).StatusCode);
    }

    [Fact]
    public async Task Changing_a_wrong_email_voids_the_old_link_and_sends_a_new_one()
    {
        var (admin, staffId, wrongEmail) = await CreatePendingReceptionistAsync();
        var wrongToken = factory.Emails.LatestResetTokenFor(wrongEmail);
        var rightEmail = $"right-{Guid.NewGuid():N}@example.com";

        var changed = await admin.PutAsJsonAsync($"api/users/{staffId}/email", new { email = rightEmail, reason = "Typo in the original email" });

        Assert.Equal(HttpStatusCode.OK, changed.StatusCode);
        var json = await Json(changed);
        Assert.Equal(rightEmail, json.GetProperty("email").GetString());
        Assert.True(json.GetProperty("activationPending").GetBoolean());

        // Người nhận nhầm đang giữ link cũ không kích hoạt được.
        var stolen = await Client().PostAsJsonAsync("api/auth/password/reset", new
        {
            email = wrongEmail, token = wrongToken, newPassword = NewPassword, confirmNewPassword = NewPassword
        });
        Assert.Equal(HttpStatusCode.BadRequest, stolen.StatusCode);

        var rightToken = factory.Emails.LatestResetTokenFor(rightEmail);
        Assert.Contains(factory.Emails.Sent, x => x.To == rightEmail && x.Subject == StaffActivationEmail.Subject);
        Assert.Equal(HttpStatusCode.NoContent, (await Client().PostAsJsonAsync("api/auth/password/reset", new
        {
            email = rightEmail, token = rightToken, newPassword = NewPassword, confirmNewPassword = NewPassword
        })).StatusCode);
        Assert.Equal(HttpStatusCode.OK,
            (await Client().PostAsJsonAsync("api/auth/login", new { email = rightEmail, password = NewPassword })).StatusCode);

        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SportHubDbContext>();
        var audit = await db.AuditLogs.SingleAsync(a => a.Action == "CHANGE_PENDING_STAFF_EMAIL" && a.TargetId == staffId.ToString());
        Assert.Contains("Typo in the original email", audit.NewValue);
        Assert.Contains(wrongEmail, audit.OldValue);
        Assert.Contains(rightEmail, audit.NewValue);
    }

    [Fact]
    public async Task Changing_the_email_rejects_duplicates_unchanged_values_and_non_admins()
    {
        var (admin, staffId, email) = await CreatePendingReceptionistAsync();
        var taken = await factory.SeedUserAsync($"taken-{Guid.NewGuid():N}@example.com", null);

        Assert.Equal(HttpStatusCode.Conflict, (await admin.PutAsJsonAsync($"api/users/{staffId}/email",
            new { email = taken.Email.ToUpperInvariant(), reason = "Typo fix" })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await admin.PutAsJsonAsync($"api/users/{staffId}/email",
            new { email = email.ToUpperInvariant(), reason = "Typo fix" })).StatusCode);

        var manager = await factory.SeedUserAsync($"mgr-{Guid.NewGuid():N}@example.com", null, role: UserRole.CenterManager);
        var managerClient = Client(manager.UserId, UserRole.CenterManager);
        Assert.Equal(HttpStatusCode.Forbidden, (await managerClient.PutAsJsonAsync($"api/users/{staffId}/email",
            new { email = $"x-{Guid.NewGuid():N}@example.com", reason = "Typo fix" })).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await managerClient.PostAsync($"api/users/{staffId}/resend-activation", null)).StatusCode);
    }
}
