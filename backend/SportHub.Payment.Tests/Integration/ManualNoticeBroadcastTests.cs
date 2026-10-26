using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using SportHub.Identity.Domain.Entities;
using SportHub.Identity.Domain.Enums;
using SportHub.Notification.Domain.Entities;
using SportHub.Notification.Domain.Enums;

namespace SportHub.Payment.Tests.Integration;

[Collection(nameof(PaymentApiCollection))]
public sealed class ManualNoticeBroadcastTests(PaymentApiFactory factory)
{
    [Fact]
    public async Task Role_broadcast_combines_all_active_role_accounts_and_individuals_without_duplicates()
    {
        var manager = await factory.SeedUserAsync(UserRole.CenterManager);
        var coach = await factory.SeedUserAsync(UserRole.Coach);
        var member = await factory.SeedUserAsync(UserRole.Member);
        var inactive = await factory.SeedUserAsync(UserRole.Member, UserStatus.Deactivated);
        var expected = await factory.QueryAsync(async db =>
        {
            db.UserAccounts.AddRange(Enumerable.Range(0, 201).Select(index => new UserAccount {
                UserId = Guid.NewGuid(), Email = $"role-broadcast-{Guid.NewGuid():N}@example.test", RoleId = member.RoleId,
                Status = UserStatus.Active, CreatedAt = DateTime.UtcNow,
                Profile = new UserProfile { FullName = $"Role broadcast member {index}" }
            }));
            await db.SaveChangesAsync();
            return await db.UserAccounts.Where(u => u.Status == UserStatus.Active
                && (u.Role!.RoleName == UserRole.Member || u.UserId == coach.UserId))
                .Select(u => u.UserId).ToListAsync();
        });
        Assert.True(expected.Count > 200);
        using var client = factory.CreateApiClient(manager.UserId, UserRole.CenterManager);
        client.DefaultRequestHeaders.Add("Idempotency-Key", Guid.NewGuid().ToString());
        var body = new { subject = "Role announcement", message = "All members and one selected coach.",
            recipientUserIds = new[] { coach.UserId, member.UserId }, sendToRoles = new[] { "MEMBER" }, sendInApp = true, sendEmail = false };
        var sent = await client.PostAsJsonAsync("/api/manager/notices", body);
        sent.EnsureSuccessStatusCode();
        var id = (await sent.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("noticeId").GetGuid();
        await factory.QueryAsync(async db =>
        {
            var actual = await db.Notifications.Where(n => n.SourceEntityId == id).Select(n => n.UserId ?? Guid.Empty).ToListAsync();
            Assert.Equal(expected.Order(), actual.Order());
            Assert.Equal(actual.Count, actual.Distinct().Count());
            Assert.DoesNotContain(manager.UserId, actual);
            Assert.DoesNotContain(inactive.UserId, actual);
            return 0;
        });
        var later = await factory.SeedUserAsync(UserRole.Member);
        var retry = await client.PostAsJsonAsync("/api/manager/notices", body);
        retry.EnsureSuccessStatusCode();
        Assert.Equal(id, (await retry.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("noticeId").GetGuid());
        Assert.False(await factory.QueryAsync(db => db.Notifications.AnyAsync(n => n.SourceEntityId == id && n.UserId == later.UserId)));
        using var fresh = factory.CreateApiClient(manager.UserId, UserRole.CenterManager);
        Assert.Equal(HttpStatusCode.BadRequest, (await fresh.PostAsJsonAsync("/api/manager/notices", new {
            body.subject, body.message, recipientUserIds = Array.Empty<Guid>(), sendToRoles = new[] { "INVALID" }
        })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await fresh.PostAsJsonAsync("/api/manager/notices", new {
            body.subject, body.message, recipientUserIds = Array.Empty<Guid>(), sendToAll = true, body.sendToRoles
        })).StatusCode);
    }

    [Fact]
    public async Task Broadcast_includes_all_active_roles_beyond_200_and_retries_keep_the_original_audience()
    {
        var manager = await factory.SeedUserAsync(UserRole.CenterManager);
        var admin = await factory.SeedUserAsync(UserRole.SystemAdministrator);
        var desk = await factory.SeedUserAsync(UserRole.Receptionist);
        var coach = await factory.SeedUserAsync(UserRole.Coach);
        var member = await factory.SeedUserAsync(UserRole.Member);
        var inactive = await factory.SeedUserAsync(UserRole.Member, UserStatus.Deactivated);
        var expected = await factory.QueryAsync(async db =>
        {
            db.UserAccounts.AddRange(Enumerable.Range(0, 201).Select(index => new UserAccount {
                UserId = Guid.NewGuid(), Email = $"broadcast-{Guid.NewGuid():N}@example.test", RoleId = member.RoleId,
                Status = UserStatus.Active, CreatedAt = DateTime.UtcNow,
                Profile = new UserProfile { FullName = $"Broadcast member {index}" }
            }));
            await db.SaveChangesAsync();
            return await db.UserAccounts.CountAsync(u => u.Status == UserStatus.Active);
        });
        Assert.True(expected > 200);
        using var client = factory.CreateApiClient(manager.UserId, UserRole.CenterManager);
        client.DefaultRequestHeaders.Add("Idempotency-Key", Guid.NewGuid().ToString());
        var body = new { subject = "System announcement", message = "An announcement for every active account.",
            recipientUserIds = Array.Empty<Guid>(), sendToAll = true, sendInApp = true, sendEmail = false };
        var sent = await client.PostAsJsonAsync("/api/manager/notices", body);
        sent.EnsureSuccessStatusCode();
        var id = (await sent.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("noticeId").GetGuid();
        await factory.QueryAsync(async db =>
        {
            var record = await db.Set<ManualNoticeRecord>().SingleAsync(r => r.NoticeId == id);
            Assert.Equal(expected, record.RecipientCount);
            var recipients = await db.Notifications.Where(n => n.SourceEntityId == id && n.Channel == NotificationChannel.InApp)
                .Select(n => n.UserId).ToListAsync();
            Assert.Equal(expected, recipients.Count);
            foreach (var userId in new[] { manager.UserId, admin.UserId, desk.UserId, coach.UserId, member.UserId })
                Assert.Contains(userId, recipients);
            Assert.DoesNotContain(inactive.UserId, recipients);
            return 0;
        });
        var later = await factory.SeedUserAsync(UserRole.Member);
        var retry = await client.PostAsJsonAsync("/api/manager/notices", body);
        retry.EnsureSuccessStatusCode();
        Assert.Equal(id, (await retry.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("noticeId").GetGuid());
        await factory.QueryAsync(async db =>
        {
            Assert.Equal(1, await db.Set<ManualNoticeRecord>().CountAsync(r => r.NoticeId == id));
            Assert.Equal(expected, await db.Notifications.CountAsync(n => n.SourceEntityId == id));
            Assert.False(await db.Notifications.AnyAsync(n => n.SourceEntityId == id && n.UserId == later.UserId));
            return 0;
        });
        var changed = await client.PostAsJsonAsync("/api/manager/notices", new { body.subject, body.message,
            recipientUserIds = new[] { member.UserId }, sendToAll = false, body.sendInApp, body.sendEmail });
        Assert.Equal(HttpStatusCode.Conflict, changed.StatusCode);
        using var fresh = factory.CreateApiClient(manager.UserId, UserRole.CenterManager);
        Assert.Equal(HttpStatusCode.BadRequest, (await fresh.PostAsJsonAsync("/api/manager/notices", new {
            body.subject, body.message, recipientUserIds = new[] { member.UserId }, sendToAll = true
        })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await fresh.PostAsJsonAsync("/api/manager/notices", new {
            body.subject, body.message, recipientUserIds = Array.Empty<Guid>(), sendToAll = false
        })).StatusCode);
        using var memberClient = factory.CreateApiClient(member.UserId, UserRole.Member);
        Assert.Equal(HttpStatusCode.Forbidden, (await memberClient.PostAsJsonAsync("/api/manager/notices", body)).StatusCode);
    }
}
