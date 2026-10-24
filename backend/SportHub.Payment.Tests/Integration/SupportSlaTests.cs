using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SportHub.Identity.Application.Services;
using SportHub.Identity.Domain.Entities;
using SportHub.Identity.Domain.Enums;

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
    public async Task Sla_job_notifies_assignee_or_both_front_desk_roles_once_per_window()
    {
        var member = await factory.SeedUserAsync(UserRole.Member);
        var receptionistA = await factory.SeedUserAsync(UserRole.Receptionist);
        var receptionistB = await factory.SeedUserAsync(UserRole.Receptionist);
        var manager = await factory.SeedUserAsync(UserRole.CenterManager);
        var dueAt = DateTime.UtcNow.AddMinutes(-2);
        var assignedId = await RequestAsync(member.UserId, receptionistA.UserId, dueAt);
        var unassignedId = await RequestAsync(member.UserId, null, dueAt);

        using (var scope = factory.Services.CreateScope())
        {
            var service = scope.ServiceProvider.GetRequiredService<SupportReminderService>();
            Assert.True(await service.SendDueSlaAsync(default) >= 4);
            Assert.Equal(0, await service.SendDueSlaAsync(default));
        }
        await factory.QueryAsync(async db =>
        {
            var assigned = await db.Set<MemberSupportEvent>().Where(e => e.RequestId == assignedId
                && e.Type == "SLA_REMINDER_SENT").ToListAsync();
            Assert.Single(assigned);
            Assert.Equal(receptionistA.UserId, assigned[0].TargetUserId);
            Assert.Null(assigned[0].ActorUserId);
            var unassigned = await db.Set<MemberSupportEvent>().Where(e => e.RequestId == unassignedId
                && e.Type == "SLA_REMINDER_SENT").ToListAsync();
            Assert.Contains(unassigned, e => e.TargetUserId == receptionistA.UserId);
            Assert.Contains(unassigned, e => e.TargetUserId == receptionistB.UserId);
            Assert.Contains(unassigned, e => e.TargetUserId == manager.UserId);
            return 0;
        });
        using var desk = factory.CreateApiClient(receptionistA.UserId, UserRole.Receptionist);
        var stats = await desk.GetFromJsonAsync<JsonElement>("/api/member-support-requests/stats");
        Assert.True(stats.GetProperty("overdue").GetInt32() >= 2);
        var queue = await desk.GetFromJsonAsync<JsonElement>("/api/member-support-requests/queue?overdue=true");
        var items = queue.GetProperty("items").EnumerateArray().ToList();
        Assert.Contains(items, x => x.GetProperty("requestId").GetGuid() == assignedId
            && x.GetProperty("isOverdue").GetBoolean());
    }
}
