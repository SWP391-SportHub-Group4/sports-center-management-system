using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SportHub.Identity.Domain.Entities;
using SportHub.Identity.Domain.Enums;
using SportHub.Notification.Domain.Enums;
using SportHub.Scheduling.Application.DTOs;
using SportHub.Scheduling.Application.Interfaces;
using SportHub.Scheduling.Domain.Enums;
using SportHub.Scheduling.Rental.Application;

namespace SportHub.Scheduling.Tests.Integration;

// Regression tests for recipient coverage and retry behavior found during the M05 audit.
[Collection(nameof(SchedulingApiCollection))]
public sealed class ManagerNotificationAuditTests(SchedulingApiFactory factory)
{
    private async Task<Guid> ReplacementAsync()
    {
        var user = await factory.SeedUserAsync(UserRole.Coach);
        await factory.QueryAsync(async db =>
        {
            db.UserSportSpecialties.Add(new UserSportSpecialty { UserId = user.UserId, SportId = 3 });
            db.CoachProfiles.Add(new CoachProfile { UserId = user.UserId });
            await db.SaveChangesAsync();
            return 0;
        });
        return user.UserId;
    }

    private Task<int> CountAsync(Guid userId) => factory.QueryAsync(db => db.Notifications.CountAsync(n =>
        n.UserId == userId && n.SourceEventType == NotificationSourceEventType.ScheduleChanged));

    private string EmailHtml(string protectedPayload)
    {
        var protector = factory.Services.GetRequiredService<IDataProtectionProvider>()
            .CreateProtector("SportHub.Notification.EmailPayload.v1");
        using var payload = JsonDocument.Parse(protector.Unprotect(protectedPayload));
        return payload.RootElement.GetProperty("HtmlBody").GetString()!;
    }

    [Fact]
    public async Task Main_coach_change_notifies_members_and_both_coaches_and_retry_adds_nothing()
    {
        var c = await CourseTestData.CreateAsync(factory);
        var member = await factory.SeedUserAsync(UserRole.Member);
        await CourseTestData.EnrollmentAsync(factory, c.Id, member.UserId);
        var replacement = await ReplacementAsync();
        var before = await CourseTestData.SessionsAsync(factory, c.Id);
        await factory.QueryAsync(db => db.UserAccounts.Where(u => u.UserId == c.CoachId)
            .ExecuteUpdateAsync(s => s.SetProperty(u => u.Status, UserStatus.Deactivated)));
        using var manager = factory.CreateApiClient(c.ManagerId, UserRole.CenterManager);
        var version = await factory.QueryAsync(db => db.Classes.Where(x => x.ClassId == c.Id).Select(x => x.Version).SingleAsync());
        var url = $"api/manager/classes/{c.Id}/lead-coach";
        var body = new { coachId = replacement, expectedVersion = version, reason = "M05 audit replacement" };
        Assert.Equal(HttpStatusCode.NoContent, (await manager.PostAsJsonAsync(url, body)).StatusCode);
        var notices = await factory.QueryAsync(db => db.Notifications.AsNoTracking().Where(n =>
            n.SourceEventType == NotificationSourceEventType.ScheduleChanged &&
            (n.UserId == replacement || n.UserId == c.CoachId || n.UserId == member.UserId)).ToListAsync());
        Assert.Equal(before.Count * 6, notices.Count);
        foreach (var id in new[] { member.UserId, c.CoachId, replacement })
            foreach (var channel in new[] { NotificationChannel.InApp, NotificationChannel.Email })
                Assert.Equal(before.Count, notices.Count(n => n.UserId == id && n.Channel == channel));
        Assert.All(notices.Where(n => n.Channel == NotificationChannel.InApp), n => {
            Assert.Contains(body.reason, n.Message);
        });
        Assert.All(notices.Where(n => n.Channel == NotificationChannel.Email), n => {
            var html = EmailHtml(n.ProtectedEmailPayload!);
            Assert.Contains(body.reason, html);
        });
        Assert.Equal(replacement, await factory.QueryAsync(db => db.Classes.Where(x => x.ClassId == c.Id)
            .Select(x => x.CoachId).SingleAsync()));
        var after = await CourseTestData.SessionsAsync(factory, c.Id);
        Assert.All(after, s => Assert.Equal(replacement, s.CoachId));
        Assert.Equal(before.Select(s => s.StartAtUtc), after.Select(s => s.StartAtUtc));
        Assert.Equal(HttpStatusCode.Conflict, (await manager.PostAsJsonAsync(url, body)).StatusCode);
        Assert.Equal(before.Count * 2, await factory.QueryAsync(db => db.Notifications.CountAsync(n =>
            n.UserId == replacement && n.SourceEventType == NotificationSourceEventType.ScheduleChanged)));
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task Session_coach_only_change_emails_outgoing_and_incoming_coaches_once(bool alreadySubstituted)
    {
        var c = await CourseTestData.CreateAsync(factory);
        var session = (await CourseTestData.SessionsAsync(factory, c.Id))[0];
        using var manager = factory.CreateApiClient(c.ManagerId, UserRole.CenterManager);
        var url = $"api/class-sessions/{session.SessionId}/reschedule";
        var outgoing = c.CoachId;
        if (alreadySubstituted)
        {
            outgoing = await ReplacementAsync();
            Assert.Equal(HttpStatusCode.OK, (await manager.PostAsJsonAsync(url,
                new { startAtUtc = session.StartAtUtc, coachId = outgoing, reason = "Initial substitute assignment" })).StatusCode);
        }
        var incoming = await ReplacementAsync();
        var recipients = new[] { c.CoachId, outgoing, incoming }.Distinct().ToArray();
        var baseline = await factory.QueryAsync(db => db.Notifications.Select(n => n.NotificationId).ToListAsync());
        var body = new { startAtUtc = session.StartAtUtc, coachId = incoming, reason = "Substitute for this session only" };

        Assert.Equal(HttpStatusCode.OK, (await manager.PostAsJsonAsync(url, body)).StatusCode);
        var notices = await factory.QueryAsync(db => db.Notifications.AsNoTracking().Where(n =>
            !baseline.Contains(n.NotificationId) &&
            n.SourceEventType == NotificationSourceEventType.ScheduleChanged).ToListAsync());
        Assert.Equal(recipients.Length * 2, notices.Count);
        var coaches = await factory.QueryAsync(db => db.UserAccounts.AsNoTracking().Include(u => u.Profile)
            .Where(u => recipients.Contains(u.UserId)).ToListAsync());
        foreach (var coach in coaches)
        {
            Assert.Single(notices, n => n.UserId == coach.UserId && n.Channel == NotificationChannel.InApp);
            var email = Assert.Single(notices, n => n.UserId == coach.UserId && n.Channel == NotificationChannel.Email);
            Assert.Equal(coach.Email, email.RecipientAddress);
            var html = EmailHtml(email.ProtectedEmailPayload!);
            Assert.Contains(body.reason, html);
            Assert.Contains($"Session {session.SessionNo}", html);
            Assert.Contains("Updated session", html);
            Assert.Contains("What changed", html);
            Assert.Contains("Previously:", html);
            Assert.Contains("Now:", html);
            Assert.Contains(System.Net.WebUtility.HtmlEncode(coaches.Single(u => u.UserId == outgoing).Profile!.FullName), html);
            Assert.Contains(System.Net.WebUtility.HtmlEncode(coaches.Single(u => u.UserId == incoming).Profile!.FullName), html);
        }
        var updated = (await CourseTestData.SessionsAsync(factory, c.Id)).Single(s => s.SessionId == session.SessionId);
        Assert.Equal(incoming, updated.CoachId);
        Assert.Equal(session.StartAtUtc, updated.StartAtUtc);
        Assert.Equal(session.EndAtUtc, updated.EndAtUtc);
        Assert.Equal(session.RoomId, updated.RoomId);
        Assert.Equal(c.CoachId, await factory.QueryAsync(db => db.Classes.Where(x => x.ClassId == c.Id)
            .Select(x => x.CoachId).SingleAsync()));

        Assert.Equal(HttpStatusCode.OK, (await manager.PostAsJsonAsync(url, body)).StatusCode);
        Assert.Equal(notices.Count, await factory.QueryAsync(db => db.Notifications.CountAsync(n =>
            !baseline.Contains(n.NotificationId) && n.SourceEventType == NotificationSourceEventType.ScheduleChanged)));
    }

    [Theory]
    [InlineData(false, false)]
    [InlineData(false, true)]
    [InlineData(true, false)]
    [InlineData(true, true)]
    public async Task Rescheduling_notifies_once_and_enrolled_class_makeup_is_rejected(bool makeup, bool changeCoach)
    {
        var c = await CourseTestData.CreateAsync(factory);
        var member = await factory.SeedUserAsync(UserRole.Member);
        await CourseTestData.EnrollmentAsync(factory, c.Id, member.UserId);
        var replacement = changeCoach ? await ReplacementAsync() : c.CoachId;
        var all = await CourseTestData.SessionsAsync(factory, c.Id);
        var session = all[0];
        var fence = await CourseTestData.RunAsync<IncidentService, IncidentFenceResponse>(factory,
            s => s.OpenFenceAsync(new("Room", c.RoomId, session.StartAtUtc, session.EndAtUtc,
                "M05 audit incident"), c.ManagerId));
        if (makeup)
        {
            var notices = await CountAsync(member.UserId);
            var error = await Assert.ThrowsAsync<SportHub.BuildingBlocks.SharedKernel.Errors.ConflictException>(() =>
                CourseTestData.RunAsync<IClassSessionService, ClassSessionResponse>(factory,
                    s => s.CancelWithMakeupAsync(session.SessionId, new() { Reason = "M05 audit makeup",
                        Makeup = new() { StartAtUtc = all.Max(x => x.StartAtUtc).AddDays(7), CoachId = replacement } }, c.ManagerId)));
            Assert.Equal("class_has_enrollments", error.ErrorCode);
            Assert.Equal(notices, await CountAsync(member.UserId));
            Assert.Equal(all.Count, (await CourseTestData.SessionsAsync(factory, c.Id)).Count);
            return;
        }
        else
            await CourseTestData.RunAsync<IClassSessionService, ClassSessionResponse>(factory,
                s => s.RescheduleAsync(session.SessionId, new() { StartAtUtc = session.StartAtUtc.AddHours(3),
                    CoachId = replacement, Reason = "M05 audit reschedule" }, c.ManagerId));
        var memberBefore = await CountAsync(member.UserId);
        var oldBefore = await CountAsync(c.CoachId);
        var newBefore = await CountAsync(replacement);
        Assert.Equal(2, memberBefore);
        Assert.Equal(2, oldBefore);
        Assert.Equal(2, newBefore);
        var result = await CourseTestData.RunAsync<IncidentService, IncidentAbandonResult>(factory,
            s => s.AbandonFenceAsync(fence.FenceId, c.ManagerId));
        Assert.Equal(1, result.Undone);
        var restored = (await CourseTestData.SessionsAsync(factory, c.Id)).Single(s => s.SessionId == session.SessionId);
        Assert.Equal(session.StartAtUtc, restored.StartAtUtc);
        Assert.Equal(c.CoachId, restored.CoachId);
        Assert.Equal(ClassSessionStatus.Scheduled, restored.Status);
        Assert.Equal(memberBefore + 2, await CountAsync(member.UserId));
        Assert.Equal(oldBefore + 2, await CountAsync(c.CoachId));
        Assert.Equal(newBefore + 2, await CountAsync(replacement));
        await Assert.ThrowsAsync<SportHub.BuildingBlocks.SharedKernel.Errors.ConflictException>(() =>
            CourseTestData.RunAsync<IncidentService, IncidentAbandonResult>(factory,
                s => s.AbandonFenceAsync(fence.FenceId, c.ManagerId)));
        Assert.Equal(memberBefore + 2, await CountAsync(member.UserId));
        Assert.Equal(oldBefore + 2, await CountAsync(c.CoachId));
        Assert.Equal(newBefore + 2, await CountAsync(replacement));
    }

    [Fact]
    public async Task Identical_parallel_reschedule_and_retry_notify_once_but_independent_changes_notify_again()
    {
        var c = await CourseTestData.CreateAsync(factory);
        var member = await factory.SeedUserAsync(UserRole.Member);
        await CourseTestData.EnrollmentAsync(factory, c.Id, member.UserId);
        var s = (await CourseTestData.SessionsAsync(factory, c.Id))[0];
        using var manager = factory.CreateApiClient(c.ManagerId, UserRole.CenterManager);
        var body = new { startAtUtc = s.StartAtUtc.AddHours(3), reason = "M05 audit same retry" };
        var url = $"api/class-sessions/{s.SessionId}/reschedule";
        foreach (var response in await Task.WhenAll(manager.PostAsJsonAsync(url, body), manager.PostAsJsonAsync(url, body)))
            Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal(2, await CountAsync(member.UserId));
        Assert.Equal(HttpStatusCode.OK, (await manager.PostAsJsonAsync(url, body)).StatusCode);
        Assert.Equal(2, await CountAsync(member.UserId));
        Assert.Equal(2, await CountAsync(c.CoachId));
        Assert.Equal(HttpStatusCode.OK, (await manager.PostAsJsonAsync(url,
            new { startAtUtc = body.startAtUtc.AddHours(1), reason = "Another real schedule change" })).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await manager.PostAsJsonAsync(url, body)).StatusCode);
        Assert.Equal(6, await CountAsync(member.UserId));
        Assert.Equal(6, await CountAsync(c.CoachId));
    }

    [Fact]
    public async Task Failed_undo_sends_no_success_correction_to_members_or_coaches()
    {
        var c = await CourseTestData.CreateAsync(factory);
        var member = await factory.SeedUserAsync(UserRole.Member);
        await CourseTestData.EnrollmentAsync(factory, c.Id, member.UserId);
        var s = (await CourseTestData.SessionsAsync(factory, c.Id))[0];
        var fence = await CourseTestData.RunAsync<IncidentService, IncidentFenceResponse>(factory,
            svc => svc.OpenFenceAsync(new("Room", c.RoomId, s.StartAtUtc, s.EndAtUtc, "M05 failed undo"), c.ManagerId));
        await CourseTestData.RunAsync<IClassSessionService, ClassSessionResponse>(factory,
            svc => svc.RescheduleAsync(s.SessionId, new() { StartAtUtc = s.StartAtUtc.AddHours(3),
                Reason = "Move for incident" }, c.ManagerId));
        await factory.QueryAsync(async db => {
            db.RoomOccupancies.Add(new SportHub.Scheduling.Occupancy.Domain.RoomOccupancy {
                OccupancyId = Guid.NewGuid(), SourceType = SportHub.Scheduling.Occupancy.Domain.OccupancySourceType.RoomBlock,
                SourceId = Guid.NewGuid(), RoomId = c.RoomId, StartAtUtc = s.StartAtUtc, EndAtUtc = s.EndAtUtc, IsActive = true
            });
            await db.SaveChangesAsync(); return 0;
        });
        var result = await CourseTestData.RunAsync<IncidentService, IncidentAbandonResult>(factory,
            svc => svc.AbandonFenceAsync(fence.FenceId, c.ManagerId));
        Assert.Equal(0, result.Undone);
        Assert.Contains("no longer free", Assert.Single(result.NotUndone).UndoNote);
        Assert.Equal(2, await CountAsync(member.UserId));
        Assert.Equal(2, await CountAsync(c.CoachId));
    }
}
