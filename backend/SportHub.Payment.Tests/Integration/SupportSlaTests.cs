using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SportHub.Identity.Application.Services;
using SportHub.Identity.Domain.Entities;
using SportHub.Identity.Domain.Enums;
using SportHub.BuildingBlocks.Abstractions.Configuration;

namespace SportHub.Payment.Tests.Integration;

[Collection(nameof(PaymentApiCollection))]
public sealed class SupportSlaTests(PaymentApiFactory factory)
{
    private async Task<Guid> RequestAsync(Guid memberId, Guid? assigneeId, DateTime dueAt)
    {
        var id = Guid.NewGuid();
        await factory.QueryAsync(async db =>
        {
            db.Set<MemberSupportRequest>().Add(new MemberSupportRequest
            {
                RequestId = id, MemberId = memberId, RecordedByUserId = memberId,
                Category = "GENERAL", Subject = "Help with booking", Description = "Please review my booking",
                Status = assigneeId is null ? "OPEN" : "ASSIGNED", AssignedToUserId = assigneeId,
                Channel = "ONLINE", CreatedAt = dueAt.AddHours(-48), SlaDueAtUtc = dueAt
            });
            await db.SaveChangesAsync();
            return 0;
        });
        return id;
    }

    [Fact]
    public async Task Member_remind_requires_overdue_and_48_hour_cooldown()
    {
        var member = await factory.SeedUserAsync(UserRole.Member);
        var other = await factory.SeedUserAsync(UserRole.Member);
        var receptionist = await factory.SeedUserAsync(UserRole.Receptionist);
        var requestId = await RequestAsync(member.UserId, receptionist.UserId, DateTime.UtcNow.AddMinutes(20));
        using var owner = factory.CreateApiClient(member.UserId, UserRole.Member);
        using var outsider = factory.CreateApiClient(other.UserId, UserRole.Member);

        Assert.Equal(HttpStatusCode.Forbidden,
            (await outsider.PostAsync($"/api/support/requests/{requestId}/remind", null)).StatusCode);
        var early = await owner.PostAsync($"/api/support/requests/{requestId}/remind", null);
        Assert.Equal(HttpStatusCode.Conflict, early.StatusCode);
        var earlyBody = await early.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("support_remind_too_early", earlyBody.GetProperty("error").GetString());
        Assert.True(earlyBody.GetProperty("retryAfter").GetInt32() > 0);
        Assert.NotNull(early.Headers.RetryAfter);

        await factory.QueryAsync(async db =>
        {
            await db.Set<MemberSupportRequest>().Where(r => r.RequestId == requestId)
                .ExecuteUpdateAsync(s => s.SetProperty(r => r.SlaDueAtUtc, DateTime.UtcNow.AddMinutes(-1)));
            return 0;
        });
        var sent = await owner.PostAsync($"/api/support/requests/{requestId}/remind", null);
        Assert.Equal(HttpStatusCode.OK, sent.StatusCode);
        Assert.Equal(HttpStatusCode.Conflict,
            (await owner.PostAsync($"/api/support/requests/{requestId}/remind", null)).StatusCode);

        var mine = await owner.GetFromJsonAsync<JsonElement>("/api/support/requests/mine");
        var row = mine.EnumerateArray().Single(x => x.GetProperty("requestId").GetGuid() == requestId);
        Assert.True(row.GetProperty("isOverdue").GetBoolean());
        Assert.Equal(1, row.GetProperty("remindCount").GetInt32());
        Assert.True(row.GetProperty("canRemindAtUtc").GetDateTime() > DateTime.UtcNow);
        await factory.QueryAsync(async db =>
        {
            Assert.Single(await db.Set<MemberSupportEvent>().Where(e => e.RequestId == requestId
                && e.Type == "REMINDED_BY_MEMBER" && e.TargetUserId == receptionist.UserId).ToListAsync());
            return 0;
        });
    }

    [Fact]
    public async Task Real_progress_restarts_48_hours_but_assignment_does_not()
    {
        var member = await factory.SeedUserAsync(UserRole.Member);
        var manager = await factory.SeedUserAsync(UserRole.CenterManager);
        var due = DateTime.UtcNow.AddMinutes(-10);
        var id = await RequestAsync(member.UserId, null, due);
        using var client = factory.CreateApiClient(manager.UserId, UserRole.CenterManager);
        Assert.True((await client.PostAsJsonAsync($"/api/member-support-requests/{id}/assign", new { assigneeUserId = manager.UserId })).IsSuccessStatusCode);
        var afterAssign = await factory.QueryAsync(db => db.Set<MemberSupportRequest>().Where(r => r.RequestId == id).Select(r => r.SlaDueAtUtc).SingleAsync());
        Assert.Equal(due, afterAssign, TimeSpan.FromMilliseconds(1));
        Assert.True((await client.PostAsJsonAsync($"/api/member-support-requests/{id}/progress", new { note = "We checked the booking and are preparing a replacement." })).IsSuccessStatusCode);
        var afterProgress = await factory.QueryAsync(db => db.Set<MemberSupportRequest>().Where(r => r.RequestId == id).Select(r => r.SlaDueAtUtc).SingleAsync());
        Assert.InRange(afterProgress, DateTime.UtcNow.AddHours(48).AddMinutes(-1), DateTime.UtcNow.AddHours(48).AddMinutes(1));
        using var scope = factory.Services.CreateScope();
        await scope.ServiceProvider.GetRequiredService<SupportReminderService>().SendDueSlaAsync(default);
        Assert.False(await factory.QueryAsync(db => db.Set<MemberSupportEvent>().AnyAsync(e => e.RequestId == id && e.Type == "SLA_REMINDER_SENT")));
    }

    [Theory]
    [InlineData(UserRole.Receptionist)]
    [InlineData(UserRole.Coach)]
    [InlineData(UserRole.SystemAdministrator)]
    [InlineData(UserRole.CenterManager)]
    public async Task Sla_job_reminds_the_assignee_or_front_desk_once_per_window(UserRole role)
    {
        var member = await factory.SeedUserAsync(UserRole.Member);
        var receptionistA = await factory.SeedUserAsync(role);
        var receptionistB = await factory.SeedUserAsync(UserRole.Receptionist);
        var manager = await factory.SeedUserAsync(UserRole.CenterManager);
        var dueAt = DateTime.UtcNow.AddMinutes(-2);
        var assignedId = await RequestAsync(member.UserId, receptionistA.UserId, dueAt);
        var unassignedId = await RequestAsync(member.UserId, null, dueAt);

        using (var scope = factory.Services.CreateScope())
        {
            var service = scope.ServiceProvider.GetRequiredService<SupportReminderService>();
            Assert.True(await service.SendDueSlaAsync(default) >= 2);
            Assert.Equal(0, await service.SendDueSlaAsync(default));
        }
        await factory.QueryAsync(async db =>
        {
            var assigned = await db.Set<MemberSupportEvent>().Where(e => e.RequestId == assignedId
                && e.Type == "SLA_REMINDER_SENT").ToListAsync();
            Assert.Equal(receptionistA.UserId, Assert.Single(assigned).TargetUserId);
            Assert.All(assigned, e => Assert.Null(e.ActorUserId));
            var unassigned = await db.Set<MemberSupportEvent>().Where(e => e.RequestId == unassignedId
                && e.Type == "SLA_REMINDER_SENT").ToListAsync();
            Assert.Contains(unassigned, e => e.TargetUserId == receptionistB.UserId);
            Assert.Contains(unassigned, e => e.TargetUserId == manager.UserId);
            Assert.Equal(role is UserRole.Receptionist or UserRole.CenterManager,
                unassigned.Any(e => e.TargetUserId == receptionistA.UserId));
            return 0;
        });
        using var desk = factory.CreateApiClient(receptionistB.UserId, UserRole.Receptionist);
        var stats = await desk.GetFromJsonAsync<JsonElement>("/api/member-support-requests/stats");
        Assert.True(stats.GetProperty("overdue").GetInt32() >= 2);
        var queue = await desk.GetFromJsonAsync<JsonElement>("/api/member-support-requests/queue?overdue=true");
        var items = queue.GetProperty("items").EnumerateArray().ToList();
        Assert.Contains(items, x => x.GetProperty("requestId").GetGuid() == assignedId
            && x.GetProperty("isOverdue").GetBoolean());
    }

    [Fact]
    public async Task Payment_sla_reminders_are_only_sent_to_managers()
    {
        var member = await factory.SeedUserAsync(UserRole.Member);
        var manager = await factory.SeedUserAsync(UserRole.CenterManager);
        var desk = await factory.SeedUserAsync(UserRole.Receptionist);
        var assigned = await RequestAsync(member.UserId, manager.UserId, DateTime.UtcNow.AddMinutes(-1));
        var unassigned = await RequestAsync(member.UserId, null, DateTime.UtcNow.AddMinutes(-1));
        await factory.QueryAsync(async db =>
        {
            await db.Set<MemberSupportRequest>().Where(r => r.RequestId == assigned || r.RequestId == unassigned)
                .ExecuteUpdateAsync(s => s.SetProperty(r => r.Category, "PAYMENT"));
            return 0;
        });
        using var scope = factory.Services.CreateScope();
        await scope.ServiceProvider.GetRequiredService<SupportReminderService>().SendDueSlaAsync(default);
        await factory.QueryAsync(async db =>
        {
            var events = await db.Set<MemberSupportEvent>().Where(e => (e.RequestId == assigned || e.RequestId == unassigned)
                && e.Type == "SLA_REMINDER_SENT").ToListAsync();
            Assert.Equal(manager.UserId, Assert.Single(events, e => e.RequestId == assigned).TargetUserId);
            Assert.DoesNotContain(events, e => e.TargetUserId == desk.UserId);
            var managerIds = await db.Set<UserAccount>().Where(u => u.Role != null && u.Role.RoleName == UserRole.CenterManager)
                .Select(u => u.UserId).ToListAsync();
            Assert.All(events, e => Assert.Contains(e.TargetUserId!.Value, managerIds));
            Assert.Contains(events, e => e.RequestId == unassigned && e.TargetUserId == manager.UserId);
            return 0;
        });
    }

    [Fact]
    public async Task Configured_sla_applies_to_new_requests_and_progress_and_job_uses_configured_cooldown()
    {
        var member = await factory.SeedUserAsync(UserRole.Member);
        var manager = await factory.SeedUserAsync(UserRole.CenterManager);
        using var mgr = factory.CreateApiClient(manager.UserId, UserRole.CenterManager);
        using var owner = factory.CreateApiClient(member.UserId, UserRole.Member);
        var slaKey = SystemSettingKeys.SupportSlaHours;
        var cooldownKey = SystemSettingKeys.SupportRemindCooldownHours;
        var oldSettings = (await mgr.GetFromJsonAsync<JsonElement>("/api/system-settings")).EnumerateArray()
            .Where(s => s.GetProperty("key").GetString() == slaKey || s.GetProperty("key").GetString() == cooldownKey)
            .ToDictionary(s => s.GetProperty("key").GetString()!, s => s.GetProperty("value").GetString());
        try
        {
            Assert.Equal(HttpStatusCode.OK, (await mgr.PutAsJsonAsync($"/api/system-settings/{slaKey}", new { value = "12" })).StatusCode);
            Assert.Equal(HttpStatusCode.OK, (await mgr.PutAsJsonAsync($"/api/system-settings/{cooldownKey}", new { value = "6" })).StatusCode);
            using var form = new MultipartFormDataContent();
            form.Add(new StringContent("OTHER"), "Category");
            form.Add(new StringContent("Check my booking please"), "Description");
            var submitted = await owner.PostAsync("/api/support/requests", form);
            Assert.Equal(HttpStatusCode.OK, submitted.StatusCode);
            var memberRequest = (await submitted.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("requestId").GetGuid();
            var created = await mgr.PostAsJsonAsync("/api/member-support-requests", new {
                memberId = member.UserId, category = "GENERAL", description = "A request recorded by staff", assigneeUserId = manager.UserId });
            Assert.Equal(HttpStatusCode.OK, created.StatusCode);
            var staffRequest = (await created.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("requestId").GetGuid();
            foreach (var id in new[] { memberRequest, staffRequest })
            {
                var due = await factory.QueryAsync(db => db.Set<MemberSupportRequest>().Where(r => r.RequestId == id).Select(r => r.SlaDueAtUtc).SingleAsync());
                Assert.InRange(due, DateTime.UtcNow.AddHours(12).AddMinutes(-1), DateTime.UtcNow.AddHours(12).AddMinutes(1));
            }
            Assert.Equal(HttpStatusCode.OK, (await mgr.PostAsJsonAsync($"/api/member-support-requests/{staffRequest}/progress",
                new { note = "We have checked this booking" })).StatusCode);
            var progressDue = await factory.QueryAsync(db => db.Set<MemberSupportRequest>().Where(r => r.RequestId == staffRequest).Select(r => r.SlaDueAtUtc).SingleAsync());
            Assert.InRange(progressDue, DateTime.UtcNow.AddHours(12).AddMinutes(-1), DateTime.UtcNow.AddHours(12).AddMinutes(1));
            await factory.QueryAsync(async db =>
            {
                await db.Set<MemberSupportRequest>().Where(r => r.RequestId == staffRequest)
                    .ExecuteUpdateAsync(s => s.SetProperty(r => r.SlaDueAtUtc, DateTime.UtcNow.AddHours(-8)));
                db.Set<MemberSupportEvent>().Add(new() { EventId = Guid.NewGuid(), RequestId = staffRequest,
                    TargetUserId = manager.UserId, Type = "SLA_REMINDER_SENT", CreatedAt = DateTime.UtcNow.AddHours(-7) });
                await db.SaveChangesAsync(); return 0;
            });
            using var scope = factory.Services.CreateScope();
            var service = scope.ServiceProvider.GetRequiredService<SupportReminderService>();
            await service.SendDueSlaAsync(default);
            await service.SendDueSlaAsync(default);
            Assert.Equal(2, await factory.QueryAsync(db => db.Set<MemberSupportEvent>().CountAsync(e => e.RequestId == staffRequest
                && e.Type == "SLA_REMINDER_SENT" && e.TargetUserId == manager.UserId)));
        }
        finally
        {
            await mgr.PutAsJsonAsync($"/api/system-settings/{slaKey}", new { value = oldSettings[slaKey] });
            await mgr.PutAsJsonAsync($"/api/system-settings/{cooldownKey}", new { value = oldSettings[cooldownKey] });
        }
    }
}
