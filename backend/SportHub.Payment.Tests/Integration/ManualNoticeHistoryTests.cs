using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using SportHub.API.Migrations;
using SportHub.Audit.Domain.Entities;
using SportHub.Identity.Domain.Enums;
using SportHub.Notification.Domain.Entities;
using SportHub.Notification.Domain.Enums;
using NotificationEntity = SportHub.Notification.Domain.Entities.Notification;

namespace SportHub.Payment.Tests.Integration;

[Collection(nameof(PaymentApiCollection))]
public sealed class ManualNoticeHistoryTests(PaymentApiFactory factory)
{
    [Fact]
    public async Task History_is_private_filterable_and_paged_and_keeps_send_time_recipients_with_live_channel_status()
    {
        var manager = await factory.SeedUserAsync(UserRole.CenterManager);
        var other = await factory.SeedUserAsync(UserRole.CenterManager);
        var first = await factory.SeedUserAsync(UserRole.Member);
        var second = await factory.SeedUserAsync(UserRole.Member);
        using var client = factory.CreateApiClient(manager.UserId, UserRole.CenterManager);
        using var stranger = factory.CreateApiClient(other.UserId, UserRole.CenterManager);
        using var member = factory.CreateApiClient(first.UserId, UserRole.Member);
        var body = new { subject = "Schedule announcement", message = "Original message\n<script>plain text</script>",
            recipientUserIds = new[] { first.UserId, second.UserId, first.UserId }, sendInApp = true, sendEmail = true };
        client.DefaultRequestHeaders.Add("Idempotency-Key", Guid.NewGuid().ToString());
        var sent = await client.PostAsJsonAsync("/api/manager/notices", body);
        sent.EnsureSuccessStatusCode();
        var id = (await sent.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("noticeId").GetGuid();
        var retry = await client.PostAsJsonAsync("/api/manager/notices", body);
        retry.EnsureSuccessStatusCode();
        Assert.Equal(id, (await retry.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("noticeId").GetGuid());
        Assert.Equal(1, await factory.QueryAsync(db => db.Set<ManualNoticeRecord>().CountAsync(x => x.NoticeId == id)));
        Assert.Equal(4, await factory.QueryAsync(db => db.Notifications.CountAsync(x => x.SourceEntityId == id)));
        client.DefaultRequestHeaders.Remove("Idempotency-Key");
        var another = await client.PostAsJsonAsync("/api/manager/notices", body);
        another.EnsureSuccessStatusCode();
        var secondId = (await another.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("noticeId").GetGuid();
        (await stranger.PostAsJsonAsync("/api/manager/notices", body)).EnsureSuccessStatusCode();
        await factory.QueryAsync(async db =>
        {
            await db.Set<ManualNoticeRecord>().Where(x => x.NoticeId == id).ExecuteUpdateAsync(s =>
                s.SetProperty(x => x.CreatedAtUtc, new DateTime(2026, 10, 17, 17, 30, 0, DateTimeKind.Utc)));
            await db.Set<ManualNoticeRecord>().Where(x => x.NoticeId == secondId).ExecuteUpdateAsync(s =>
                s.SetProperty(x => x.CreatedAtUtc, new DateTime(2026, 10, 17, 16, 30, 0, DateTimeKind.Utc)));
            return 0;
        });
        var page1 = await client.GetFromJsonAsync<JsonElement>("/api/manager/notices?search=SCHEDULE&pageSize=1");
        var page2 = await client.GetFromJsonAsync<JsonElement>("/api/manager/notices?search=SCHEDULE&pageSize=1&page=2");
        Assert.Equal(2, page1.GetProperty("totalCount").GetInt32());
        Assert.Equal(id, page1.GetProperty("items")[0].GetProperty("noticeId").GetGuid());
        Assert.Equal(secondId, page2.GetProperty("items")[0].GetProperty("noticeId").GetGuid());
        var filtered = await client.GetFromJsonAsync<JsonElement>("/api/manager/notices?fromDate=2026-10-18&toDate=2026-10-18");
        Assert.Equal(1, filtered.GetProperty("totalCount").GetInt32());
        Assert.Equal(id, filtered.GetProperty("items")[0].GetProperty("noticeId").GetGuid());
        Assert.Equal(HttpStatusCode.BadRequest, (await client.GetAsync("/api/manager/notices?fromDate=2026-10-19&toDate=2026-10-18")).StatusCode);
        var before = await client.GetFromJsonAsync<JsonElement>($"/api/manager/notices/{id}/recipients");
        var original = before.GetProperty("items").EnumerateArray().Single(x => x.GetProperty("userId").GetGuid() == first.UserId);
        var oldName = original.GetProperty("name").GetString();
        var oldEmail = original.GetProperty("email").GetString();
        await factory.QueryAsync(async db =>
        {
            await db.UserProfiles.Where(x => x.UserId == first.UserId).ExecuteUpdateAsync(s => s.SetProperty(x => x.FullName, "Changed later"));
            await db.UserAccounts.Where(x => x.UserId == first.UserId).ExecuteUpdateAsync(s =>
                s.SetProperty(x => x.Email, $"changed-{Guid.NewGuid():N}@example.com"));
            await db.Notifications.Where(x => x.SourceEntityId == id && x.UserId == first.UserId && x.Channel == NotificationChannel.InApp)
                .ExecuteUpdateAsync(s => s.SetProperty(x => x.Status, NotificationStatus.Read));
            await db.Notifications.Where(x => x.SourceEntityId == id && x.UserId == first.UserId && x.Channel == NotificationChannel.Email)
                .ExecuteUpdateAsync(s => s.SetProperty(x => x.Status, NotificationStatus.Failed).SetProperty(x => x.RetryCount, 2));
            return 0;
        });
        var recipients = await client.GetFromJsonAsync<JsonElement>($"/api/manager/notices/{id}/recipients?pageSize=1");
        Assert.Equal(2, recipients.GetProperty("totalCount").GetInt32());
        Assert.Equal(1, recipients.GetProperty("items").GetArrayLength());
        var all = await client.GetFromJsonAsync<JsonElement>($"/api/manager/notices/{id}/recipients");
        var saved = all.GetProperty("items").EnumerateArray().Single(x => x.GetProperty("userId").GetGuid() == first.UserId);
        Assert.Equal(oldName, saved.GetProperty("name").GetString());
        Assert.Equal(oldEmail, saved.GetProperty("email").GetString());
        Assert.Equal("READ", saved.GetProperty("inApp").GetProperty("status").GetString());
        Assert.Equal("FAILED", saved.GetProperty("emailDelivery").GetProperty("status").GetString());
        var details = await client.GetFromJsonAsync<JsonElement>($"/api/manager/notices/{id}");
        Assert.Equal(body.message, details.GetProperty("message").GetString());
        Assert.Equal(2, details.GetProperty("recipientCount").GetInt32());
        Assert.Equal(4, details.GetProperty("delivery").GetProperty("total").GetInt32());
        Assert.Equal(1, details.GetProperty("delivery").GetProperty("failed").GetInt32());
        Assert.Equal(1, details.GetProperty("delivery").GetProperty("read").GetInt32());
        Assert.DoesNotContain("protectedEmailPayload", details.ToString());
        foreach (var path in new[] { $"/api/manager/notices/{id}", $"/api/manager/notices/{id}/recipients" })
            Assert.Equal(HttpStatusCode.NotFound, (await stranger.GetAsync(path)).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await member.GetAsync("/api/manager/notices")).StatusCode);
    }

    [Theory]
    [InlineData(true, false)]
    [InlineData(false, true)]
    public async Task Single_channel_notices_keep_the_original_message_and_do_not_invent_another_delivery(bool inApp, bool email)
    {
        var manager = await factory.SeedUserAsync(UserRole.CenterManager);
        var recipient = await factory.SeedUserAsync(UserRole.Member);
        using var client = factory.CreateApiClient(manager.UserId, UserRole.CenterManager);
        var sent = await client.PostAsJsonAsync("/api/manager/notices", new { subject = "Single channel",
            message = "The original message is retained even for email-only notices.",
            recipientUserIds = new[] { recipient.UserId }, sendInApp = inApp, sendEmail = email });
        sent.EnsureSuccessStatusCode();
        var id = (await sent.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("noticeId").GetGuid();
        var details = await client.GetFromJsonAsync<JsonElement>($"/api/manager/notices/{id}");
        Assert.Equal("The original message is retained even for email-only notices.", details.GetProperty("message").GetString());
        Assert.Equal(1, details.GetProperty("delivery").GetProperty("total").GetInt32());
        var recipients = await client.GetFromJsonAsync<JsonElement>($"/api/manager/notices/{id}/recipients");
        var row = recipients.GetProperty("items")[0];
        Assert.Equal(inApp ? JsonValueKind.Object : JsonValueKind.Null, row.GetProperty("inApp").ValueKind);
        Assert.Equal(email ? JsonValueKind.Object : JsonValueKind.Null, row.GetProperty("emailDelivery").ValueKind);
    }

    [Fact]
    public async Task Rejected_send_does_not_create_a_history_record_or_outbox_rows()
    {
        var manager = await factory.SeedUserAsync(UserRole.CenterManager);
        var recipient = await factory.SeedUserAsync(UserRole.Member);
        using var client = factory.CreateApiClient(manager.UserId, UserRole.CenterManager);
        var noChannels = await client.PostAsJsonAsync("/api/manager/notices", new { subject = "Invalid send",
            message = "No channels were selected", recipientUserIds = new[] { recipient.UserId }, sendInApp = false, sendEmail = false });
        Assert.Equal(HttpStatusCode.BadRequest, noChannels.StatusCode);
        var invalidRecipient = await client.PostAsJsonAsync("/api/manager/notices", new { subject = "Invalid send",
            message = "This recipient does not exist", recipientUserIds = new[] { Guid.NewGuid() }, sendInApp = true, sendEmail = true });
        Assert.Equal(HttpStatusCode.BadRequest, invalidRecipient.StatusCode);
        Assert.Equal(0, await factory.QueryAsync(db => db.Set<ManualNoticeRecord>().CountAsync(x => x.ManagerId == manager.UserId)));
        Assert.Equal(0, await factory.QueryAsync(db => db.Notifications.CountAsync(x => x.UserId == recipient.UserId)));
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task Legacy_backfill_keeps_available_content_and_never_exposes_or_decrypts_email_payloads(bool emailOnly)
    {
        var manager = await factory.SeedUserAsync(UserRole.CenterManager);
        var member = await factory.SeedUserAsync(UserRole.Member);
        var id = Guid.NewGuid();
        await factory.QueryAsync(async db =>
        {
            db.AuditLogs.Add(new AuditLog { AuditId = Guid.NewGuid(), UserId = manager.UserId,
                Action = "SEND_MANUAL_NOTICE", TargetEntity = "Notification", TargetId = id.ToString(), Timestamp = DateTime.UtcNow,
                NewValue = JsonSerializer.Serialize(new { subject = "Legacy subject", recipientCount = 1, SendEmail = true, SendInApp = !emailOnly }) });
            db.Notifications.Add(new NotificationEntity { NotificationId = Guid.NewGuid(), UserId = member.UserId,
                SourceEventType = NotificationSourceEventType.ManualNotice, SourceEntityId = id, Channel = NotificationChannel.Email,
                Status = NotificationStatus.Sent, RecipientAddress = member.Email, ProtectedEmailPayload = "encrypted-content-never-returned" });
            if (!emailOnly) db.Notifications.Add(new NotificationEntity { NotificationId = Guid.NewGuid(), UserId = member.UserId,
                SourceEventType = NotificationSourceEventType.ManualNotice, SourceEntityId = id, Channel = NotificationChannel.InApp,
                Status = NotificationStatus.Read, Message = "Original legacy text" });
            await db.SaveChangesAsync();
            var backfill = AddManualNoticeHistory.LegacyBackfillSql.Replace("{", "{{").Replace("}", "}}");
            await db.Database.ExecuteSqlRawAsync(backfill);
            await db.Database.ExecuteSqlRawAsync(backfill);
            return 0;
        });
        using var client = factory.CreateApiClient(manager.UserId, UserRole.CenterManager);
        var response = await client.GetAsync($"/api/manager/notices/{id}");
        response.EnsureSuccessStatusCode();
        var text = await response.Content.ReadAsStringAsync();
        Assert.DoesNotContain("encrypted-content-never-returned", text);
        using var details = JsonDocument.Parse(text);
        Assert.True(details.RootElement.GetProperty("isLegacy").GetBoolean());
        Assert.Equal(emailOnly ? null : "Original legacy text", details.RootElement.GetProperty("message").GetString());
        var recipients = await client.GetFromJsonAsync<JsonElement>($"/api/manager/notices/{id}/recipients");
        Assert.Equal(1, recipients.GetProperty("totalCount").GetInt32());
        Assert.Equal(member.Email, recipients.GetProperty("items")[0].GetProperty("email").GetString());
        Assert.Equal(1, await factory.QueryAsync(db => db.Set<ManualNoticeRecord>().CountAsync(x => x.NoticeId == id)));
    }
}
