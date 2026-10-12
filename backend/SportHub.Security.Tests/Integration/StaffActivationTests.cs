using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SportHub.API.Persistence;
using SportHub.Identity.Application.Services;
using SportHub.Identity.Domain.Enums;
using SportHub.Notification.Domain.Enums;

namespace SportHub.Security.Tests.Integration;

[Collection(nameof(SportHubApiCollection))]
public sealed class StaffActivationTests(SportHubApiFactory factory)
{
    private const string NewPassword = "New-Staff-Pass-12!";
    private static int _ipCounter = 20;

    private async Task<HttpResponseMessage> PostAnonymousAsync<T>(string path, T body)
    {
        using var client = factory.CreateApiClient();
        var ip = Interlocked.Increment(ref _ipCounter);
        client.DefaultRequestHeaders.Add(SportHubApiFactory.ClientIpHeader, $"10.91.{ip / 250}.{ip % 250}");
        return await client.PostAsJsonAsync(path, body);
    }

    [Theory]
    [InlineData(1, UserRole.CenterManager)]
    [InlineData(2, UserRole.Coach)]
    [InlineData(4, UserRole.Receptionist)]
    [InlineData(5, UserRole.SystemAdministrator)]
    public async Task Admin_creates_staff_without_password_and_staff_activates_through_email_link(int roleId, UserRole role)
    {
        var admin = await factory.SeedUserAsync($"inviter-{Guid.NewGuid():N}@example.com", null,
            role: UserRole.SystemAdministrator);
        var email = $"staff-{Guid.NewGuid():N}@example.com";
        using var client = factory.CreateApiClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue(
            "Bearer", factory.IssueToken(admin.UserId, UserRole.SystemAdministrator));

        var created = await client.PostAsJsonAsync("api/users/admin/staff", new
        {
            email,
            fullName = "New Staff Member",
            phone = (string?)null,
            roleId,
            specialties = role == UserRole.Coach ? new[] { 1 } : Array.Empty<int>()
        });
        Assert.Equal(HttpStatusCode.Created, created.StatusCode);

        var token = factory.Emails.LatestResetTokenFor(email);
        Assert.Matches("^[A-Za-z0-9_-]{43}$", token);
        var mail = Assert.Single(factory.Emails.Sent, x => x.To == email && x.Subject == StaffActivationEmail.Subject);
        Assert.Contains("setup=staff", mail.Body);
        Assert.DoesNotContain(NewPassword, mail.Body);

        Guid userId;
        Guid originalStamp;
        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<SportHubDbContext>();
            var user = await db.UserAccounts.Include(x => x.Credential).SingleAsync(x => x.Email == email);
            userId = user.UserId;
            originalStamp = user.SecurityStamp;
            Assert.Equal(roleId, user.RoleId);
            Assert.Equal(UserStatus.Active, user.Status);
            Assert.NotNull(user.Credential);
            Assert.Null(user.Credential.PasswordHash);

            var otp = await db.EmailOtps.SingleAsync(x => x.Email == email && x.Purpose == EmailOtpPurpose.ResetPassword);
            Assert.Equal(OtpCodes.Hash(token), otp.CodeHash);
            Assert.Null(otp.ConsumedAt);
            Assert.InRange((otp.ExpiresAt - otp.CreatedAt).TotalHours, 23.99, 24.01);

            var outbox = await db.Notifications.SingleAsync(x => x.RecipientAddress == email
                && x.SourceEventType == NotificationSourceEventType.PasswordResetOtpRequested);
            Assert.Equal(NotificationChannel.Email, outbox.Channel);
            Assert.Equal(NotificationStatus.Pending, outbox.Status);
            Assert.NotNull(outbox.ProtectedEmailPayload);
            Assert.DoesNotContain(token, outbox.ProtectedEmailPayload);

            var audit = await db.AuditLogs.SingleAsync(x => x.Action == "CREATE_STAFF_ACCOUNT" && x.TargetId == userId.ToString());
            Assert.Equal(admin.UserId, audit.UserId);

            if (role == UserRole.Coach)
                Assert.Equal(1, await db.UserSportSpecialties.CountAsync(x => x.UserId == userId && x.SportId == 1));
        }

        var before = await PostAnonymousAsync("api/auth/login", new { email, password = NewPassword });
        Assert.Equal(HttpStatusCode.Unauthorized, before.StatusCode);
        var googleBefore = await PostAnonymousAsync("api/auth/google", new
        {
            idToken = FakeGoogleTokenVerifier.Token($"staff-{Guid.NewGuid():N}", email, "New Staff Member")
        });
        Assert.Equal(HttpStatusCode.Unauthorized, googleBefore.StatusCode);

        var reset = await PostAnonymousAsync("api/auth/password/reset", new
        {
            email, token, newPassword = NewPassword, confirmNewPassword = NewPassword
        });
        Assert.Equal(HttpStatusCode.NoContent, reset.StatusCode);

        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<SportHubDbContext>();
            var user = await db.UserAccounts.Include(x => x.Credential).SingleAsync(x => x.UserId == userId);
            Assert.NotNull(user.Credential?.PasswordHash);
            Assert.NotEqual(originalStamp, user.SecurityStamp);
            Assert.NotNull((await db.EmailOtps.SingleAsync(x => x.Email == email && x.Purpose == EmailOtpPurpose.ResetPassword)).ConsumedAt);
        }

        Assert.Single(factory.Emails.Sent, x => x.To == email && x.Subject == StaffActivationCompleteEmail.Subject);
        Assert.Equal(HttpStatusCode.OK,
            (await PostAnonymousAsync("api/auth/login", new { email, password = NewPassword })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest,
            (await PostAnonymousAsync("api/auth/password/reset", new
            {
                email, token, newPassword = "Another-New-Staff-12!", confirmNewPassword = "Another-New-Staff-12!"
            })).StatusCode);
    }
}
