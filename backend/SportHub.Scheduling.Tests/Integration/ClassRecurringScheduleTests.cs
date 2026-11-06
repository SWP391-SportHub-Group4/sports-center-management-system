using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SportHub.Notification.Domain.Enums;
using SportHub.Identity.Domain.Enums;
using SportHub.Scheduling.Application.Commands;
using SportHub.Scheduling.Domain.Entities;
using SportHub.Scheduling.Domain.Enums;
using SportHub.Scheduling.Occupancy.Domain;

namespace SportHub.Scheduling.Tests.Integration;

[Collection(nameof(SchedulingApiCollection))]
public sealed class ClassRecurringScheduleTests(SchedulingApiFactory factory)
{
    private static string Url(int id) => $"/api/manager/classes/{id}/schedule";
    private async Task<ChangeClassScheduleRequest> RequestAsync(CourseData course) => new()
    {
        ExpectedVersion = await factory.QueryAsync(db => db.Classes.Where(c => c.ClassId == course.Id).Select(c => c.Version).SingleAsync()),
        ScheduleRules = [new() { DayOfWeek = 2, StartTimeLocal = "10:00" }, new() { DayOfWeek = 4, StartTimeLocal = "10:00" }],
    };

    [Fact]
    public async Task Preview_is_readonly_and_save_without_a_reason_replaces_remaining_slots_and_rules()
    {
        var c = await CourseTestData.CreateAsync(factory);
        var before = await CourseTestData.SessionsAsync(factory, c.Id);
        using var manager = factory.CreateApiClient(c.ManagerId, UserRole.CenterManager);
        using var coach = factory.CreateApiClient(c.CoachId, UserRole.Coach);
        var pendingRequestId = Guid.NewGuid();
        (await coach.PostAsJsonAsync($"/api/coaches/me/teaching/sessions/{before[^1].SessionId}/change-requests",
            new SportHub.Scheduling.Application.Services.CreateClassChangeRequest(pendingRequestId, "ABSENCE", "Cannot teach this session")))
            .EnsureSuccessStatusCode();
        var auditCount = await factory.QueryAsync(db => db.AuditLogs.CountAsync(a => a.UserId == c.ManagerId));
        var recipients = new[] { c.CoachId };
        var existingNotices = await factory.QueryAsync(db => db.Notifications.Where(n => n.UserId.HasValue
            && recipients.Contains(n.UserId.Value)).Select(n => n.NotificationId).ToArrayAsync());
        var request = await RequestAsync(c);
        request.ScheduleRules[1].StartTimeLocal = "12:00";
        var response = await manager.PostAsJsonAsync(Url(c.Id) + "/preview", request);
        response.EnsureSuccessStatusCode();
        var preview = (await response.Content.ReadFromJsonAsync<ClassScheduleChangePreview>())!;
        Assert.Equal(3, preview.Sessions.Count);
        Assert.Equal(CourseTestData.StartDate.AddDays(1), DateOnly.FromDateTime(
            SportHub.BuildingBlocks.SharedKernel.Time.VietnamTime.ToLocal(preview.Sessions[0].StartAtUtc)));
        Assert.All(preview.Sessions, session => Assert.True(session.StartAtUtc >= before[0].StartAtUtc));
        Assert.Equal(before.Select(s => s.StartAtUtc), (await CourseTestData.SessionsAsync(factory, c.Id)).Select(s => s.StartAtUtc));
        Assert.Equal(request.ExpectedVersion, await factory.QueryAsync(db => db.Classes.Where(x => x.ClassId == c.Id).Select(x => x.Version).SingleAsync()));
        Assert.Equal(auditCount, await factory.QueryAsync(db => db.AuditLogs.CountAsync(a => a.UserId == c.ManagerId)));
        Assert.Equal(existingNotices.Length, await factory.QueryAsync(db => db.Notifications.CountAsync(n =>
            n.UserId.HasValue && recipients.Contains(n.UserId.Value))));
        request.PreviewToken = preview.PreviewToken;
        (await manager.PostAsJsonAsync(Url(c.Id), request)).EnsureSuccessStatusCode();
        var after = await CourseTestData.SessionsAsync(factory, c.Id);
        Assert.Equal(before.Select(s => s.SessionId), after.Select(s => s.SessionId));
        Assert.Equal(preview.Sessions.Select(s => s.StartAtUtc), after.Select(s => s.StartAtUtc));
        await factory.QueryAsync(async db =>
        {
            var notices = await db.Notifications.Where(n => n.UserId.HasValue && recipients.Contains(n.UserId.Value)
                && !existingNotices.Contains(n.NotificationId)).ToListAsync();
            Assert.Equal(2, notices.Count);
            Assert.Single(notices.Select(n => n.SourceEntityId).Distinct());
            Assert.All(notices, n => Assert.Equal(NotificationSourceEventType.ScheduleChanged, n.SourceEventType));
            var protector = factory.Services.GetRequiredService<IDataProtectionProvider>()
                .CreateProtector("SportHub.Notification.EmailPayload.v1");
            var duration = (int)(after[0].EndAtUtc - after[0].StartAtUtc).TotalMinutes;
            foreach (var recipientId in recipients)
            {
                var inApp = Assert.Single(notices, n => n.UserId == recipientId && n.Channel == NotificationChannel.InApp);
                var email = Assert.Single(notices, n => n.UserId == recipientId && n.Channel == NotificationChannel.Email);
                Assert.Contains("Class schedule updated: " + c.Request.Name, inApp.Message);
                Assert.Contains($"Tuesday: 10:00–{new TimeOnly(10, 0).AddMinutes(duration):HH:mm}", inApp.Message);
                Assert.Contains($"Thursday: 12:00–{new TimeOnly(12, 0).AddMinutes(duration):HH:mm}", inApp.Message);
                Assert.Contains("Effective from: " + CourseTestData.StartDate.AddDays(1).ToString("dd/MM/yyyy"), inApp.Message);
                Assert.Contains("Room: " + await db.Rooms.Where(r => r.RoomId == c.RoomId).Select(r => r.Name).SingleAsync(), inApp.Message);
                Assert.Contains("Coach: " + await db.Set<SportHub.Identity.Domain.Entities.UserProfile>().Where(u => u.UserId == c.CoachId).Select(u => u.FullName).SingleAsync(), inApp.Message);
                Assert.Contains("remaining 3 sessions. Completed sessions remain unchanged.", inApp.Message);
                using var payload = JsonDocument.Parse(protector.Unprotect(email.ProtectedEmailPayload!));
                var html = payload.RootElement.GetProperty("HtmlBody").GetString()!;
                Assert.Contains("New schedule", html);
                Assert.Contains("Thursday: 12:00", html);
                Assert.DoesNotContain("<a", html);
                Assert.DoesNotContain("View new schedule", html);
                Assert.DoesNotContain("View new schedule", inApp.Message);
                using var recipientClient = factory.CreateApiClient(recipientId,
                    UserRole.Coach);
                var detail = await recipientClient.GetFromJsonAsync<SportHub.Notification.Application.Services.NotificationResponse>(
                    $"/api/notifications/{inApp.NotificationId}");
                Assert.NotNull(detail);
                Assert.Null(detail.ActionUrl);
                Assert.Equal("Class schedule updated: " + c.Request.Name, detail.Title);
            }
            var audits = await db.AuditLogs.Where(a => a.UserId == c.ManagerId).ToListAsync();
            Assert.Equal(auditCount + 1, audits.Count);
            var log = Assert.Single(audits.Where(a => a.Action == "CHANGE_CLASS_SCHEDULE"));
            Assert.Equal("Class", log.TargetEntity);
            Assert.Equal(c.Id.ToString(), log.TargetId);
            using var oldValue = JsonDocument.Parse(log.OldValue!);
            using var newValue = JsonDocument.Parse(log.NewValue!);
            Assert.Equal(1, oldValue.RootElement.GetProperty("scheduleRules")[0].GetProperty("dayOfWeek").GetInt32());
            Assert.Equal(2, newValue.RootElement.GetProperty("scheduleRules")[0].GetProperty("dayOfWeek").GetInt32());
            Assert.Equal(3, newValue.RootElement.GetProperty("movedSessionCount").GetInt32());
            Assert.Equal(3, oldValue.RootElement.GetProperty("sessions").GetArrayLength());
            Assert.Equal(3, newValue.RootElement.GetProperty("sessions").GetArrayLength());
            Assert.Equal("WITHDRAWN", newValue.RootElement.GetProperty("changeRequests")[0].GetProperty("status").GetString());
            Assert.Equal("WITHDRAWN", await db.Set<ClassSessionChangeRequest>().Where(r => r.RequestId == pendingRequestId).Select(r => r.Status).SingleAsync());
            var rules = await db.Set<ClassScheduleRule>().Where(r => r.ClassId == c.Id).OrderBy(r => r.DayOfWeek).ToListAsync();
            Assert.Equal(new[] { 2, 4 }, rules.Select(r => r.DayOfWeek));
            foreach (var session in after)
            {
                var room = await db.Set<RoomOccupancy>().SingleAsync(o => o.SourceId == session.SessionId && o.IsActive);
                var coach = await db.Set<CoachOccupancy>().SingleAsync(o => o.SourceId == session.SessionId && o.IsActive);
                Assert.Equal(session.StartAtUtc, room.StartAtUtc);
                Assert.Equal(session.EndAtUtc, coach.EndAtUtc);
            }
            return 0;
        });
    }

    [Fact]
    public async Task Enrollment_after_preview_blocks_both_preview_and_save()
    {
        var course = await CourseTestData.CreateAsync(factory);
        var before = await CourseTestData.SessionsAsync(factory, course.Id);
        using var manager = factory.CreateApiClient(course.ManagerId, UserRole.CenterManager);
        var request = await RequestAsync(course);
        var previewResponse = await manager.PostAsJsonAsync(Url(course.Id) + "/preview", request);
        previewResponse.EnsureSuccessStatusCode();
        request.PreviewToken = (await previewResponse.Content.ReadFromJsonAsync<ClassScheduleChangePreview>())!.PreviewToken;

        var member = await factory.SeedUserAsync(UserRole.Member);
        await CourseTestData.EnrollmentAsync(factory, course.Id, member.UserId);

        foreach (var url in new[] { Url(course.Id) + "/preview", Url(course.Id) })
        {
            var response = await manager.PostAsJsonAsync(url, request);
            Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
            Assert.Contains("class_has_enrolled_students", await response.Content.ReadAsStringAsync());
        }
        var after = await CourseTestData.SessionsAsync(factory, course.Id);
        Assert.Equal(before.Select(s => s.StartAtUtc), after.Select(s => s.StartAtUtc));
    }

    [Fact]
    public async Task Selected_start_date_controls_the_timetable_is_bound_to_preview_and_is_not_audit_metadata()
    {
        var c = await CourseTestData.CreateAsync(factory);
        var before = await CourseTestData.SessionsAsync(factory, c.Id);
        using var manager = factory.CreateApiClient(c.ManagerId, UserRole.CenterManager);
        var request = await RequestAsync(c);
        request.FirstSessionDate = CourseTestData.StartDate.AddDays(9);
        var mismatch = await manager.PostAsJsonAsync(Url(c.Id) + "/preview", request);
        Assert.Equal(HttpStatusCode.BadRequest, mismatch.StatusCode);
        Assert.Contains("schedule_weekday_mismatch", await mismatch.Content.ReadAsStringAsync());
        Assert.Equal(before.Select(s => s.StartAtUtc), (await CourseTestData.SessionsAsync(factory, c.Id)).Select(s => s.StartAtUtc));
        request.FirstSessionDate = CourseTestData.StartDate.AddDays(8);
        var result = await manager.PostAsJsonAsync(Url(c.Id) + "/preview", request);
        result.EnsureSuccessStatusCode();
        var preview = (await result.Content.ReadFromJsonAsync<ClassScheduleChangePreview>())!;
        Assert.Equal(request.FirstSessionDate, DateOnly.FromDateTime(
            SportHub.BuildingBlocks.SharedKernel.Time.VietnamTime.ToLocal(preview.Sessions[0].StartAtUtc)));
        request.PreviewToken = preview.PreviewToken;
        request.FirstSessionDate = request.FirstSessionDate.Value.AddDays(7);
        Assert.Equal(HttpStatusCode.Conflict, (await manager.PostAsJsonAsync(Url(c.Id), request)).StatusCode);
        Assert.Equal(before.Select(s => s.StartAtUtc), (await CourseTestData.SessionsAsync(factory, c.Id)).Select(s => s.StartAtUtc));
        request.FirstSessionDate = CourseTestData.StartDate.AddDays(8);
        (await manager.PostAsJsonAsync(Url(c.Id), request)).EnsureSuccessStatusCode();
        Assert.Equal(preview.Sessions.Select(s => s.StartAtUtc), (await CourseTestData.SessionsAsync(factory, c.Id)).Select(s => s.StartAtUtc));
        await factory.QueryAsync(async db => {
            var log = await db.AuditLogs.SingleAsync(a => a.UserId == c.ManagerId && a.Action == "CHANGE_CLASS_SCHEDULE");
            foreach (var value in new[] { log.OldValue!, log.NewValue! }) {
                using var json = JsonDocument.Parse(value);
                Assert.False(json.RootElement.TryGetProperty("firstSessionDate", out _));
                Assert.False(json.RootElement.TryGetProperty("startDate", out _));
            }
            return 0;
        });
    }

    [Fact]
    public async Task New_timetable_can_reuse_slots_previously_occupied_by_other_sessions_in_the_batch()
    {
        var c = await CourseTestData.CreateAsync(factory);
        using var manager = factory.CreateApiClient(c.ManagerId, UserRole.CenterManager);
        var request = await RequestAsync(c);
        request.ScheduleRules = [new() { DayOfWeek = 1, StartTimeLocal = "09:00" }, new() { DayOfWeek = 3, StartTimeLocal = "09:00" }];
        var response = await manager.PostAsJsonAsync(Url(c.Id) + "/preview", request);
        response.EnsureSuccessStatusCode();
        request.PreviewToken = (await response.Content.ReadFromJsonAsync<ClassScheduleChangePreview>())!.PreviewToken;
        (await manager.PostAsJsonAsync(Url(c.Id), request)).EnsureSuccessStatusCode();
        Assert.Equal(3, (await CourseTestData.SessionsAsync(factory, c.Id)).Count);
    }

    [Fact]
    public async Task Conflict_after_preview_rolls_back_every_session_and_old_occupancy()
    {
        var c = await CourseTestData.CreateAsync(factory);
        var before = await CourseTestData.SessionsAsync(factory, c.Id);
        using var manager = factory.CreateApiClient(c.ManagerId, UserRole.CenterManager);
        var request = await RequestAsync(c);
        var response = await manager.PostAsJsonAsync(Url(c.Id) + "/preview", request);
        response.EnsureSuccessStatusCode();
        var preview = (await response.Content.ReadFromJsonAsync<ClassScheduleChangePreview>())!;
        await factory.QueryAsync(async db =>
        {
            db.Set<RoomOccupancy>().Add(new RoomOccupancy
            {
                OccupancyId = Guid.NewGuid(), RoomId = c.RoomId, SourceType = OccupancySourceType.RoomBlock,
                SourceId = Guid.NewGuid(), StartAtUtc = preview.Sessions[1].StartAtUtc, EndAtUtc = preview.Sessions[1].EndAtUtc
            });
            await db.SaveChangesAsync(); return 0;
        });
        request.PreviewToken = preview.PreviewToken;
        Assert.Equal(HttpStatusCode.Conflict, (await manager.PostAsJsonAsync(Url(c.Id), request)).StatusCode);
        Assert.Equal(before.Select(s => s.StartAtUtc), (await CourseTestData.SessionsAsync(factory, c.Id)).Select(s => s.StartAtUtc));
        await factory.QueryAsync(async db =>
        {
            foreach (var session in before)
                Assert.True(await db.Set<RoomOccupancy>().AnyAsync(o => o.SourceId == session.SessionId && o.IsActive && o.StartAtUtc == session.StartAtUtc));
            Assert.Equal(1, await db.Set<ClassScheduleRule>().CountAsync(r => r.ClassId == c.Id));
            return 0;
        });
    }

    [Fact]
    public async Task Started_sessions_are_preserved_and_a_stale_preview_cannot_be_saved()
    {
        var c = await CourseTestData.CreateAsync(factory);
        var before = await CourseTestData.SessionsAsync(factory, c.Id);
        await factory.QueryAsync(async db =>
        {
            (await db.Classes.SingleAsync(x => x.ClassId == c.Id)).Status = ClassStatus.InProgress;
            var first = await db.ClassSessions.SingleAsync(s => s.SessionId == before[0].SessionId);
            first.Status = ClassSessionStatus.Completed;
            first.StartAtUtc = DateTime.UtcNow.AddDays(-1);
            first.EndAtUtc = first.StartAtUtc.AddHours(1);
            await db.SaveChangesAsync(); return 0;
        });
        var completed = (await CourseTestData.SessionsAsync(factory, c.Id))[0];
        using var manager = factory.CreateApiClient(c.ManagerId, UserRole.CenterManager);
        var request = await RequestAsync(c);
        var response = await manager.PostAsJsonAsync(Url(c.Id) + "/preview", request);
        response.EnsureSuccessStatusCode();
        var preview = (await response.Content.ReadFromJsonAsync<ClassScheduleChangePreview>())!;
        Assert.Equal(2, preview.Sessions.Count);
        request.PreviewToken = "stale-token";
        Assert.Equal(HttpStatusCode.Conflict, (await manager.PostAsJsonAsync(Url(c.Id), request)).StatusCode);
        request.PreviewToken = preview.PreviewToken;
        (await manager.PostAsJsonAsync(Url(c.Id), request)).EnsureSuccessStatusCode();
        var after = (await CourseTestData.SessionsAsync(factory, c.Id))[0];
        Assert.Equal(completed.StartAtUtc, after.StartAtUtc);
        Assert.Equal(ClassSessionStatus.Completed, after.Status);
    }

    [Theory]
    [InlineData(UserRole.Member)]
    [InlineData(UserRole.Coach)]
    [InlineData(UserRole.Receptionist)]
    public async Task Only_managers_can_preview_or_change_a_recurring_schedule(UserRole role)
    {
        var user = await factory.SeedUserAsync(role);
        using var client = factory.CreateApiClient(user.UserId, role);
        var request = new ChangeClassScheduleRequest {
            ScheduleRules = [new() { DayOfWeek = 1, StartTimeLocal = "10:00" }] };
        Assert.Equal(HttpStatusCode.Forbidden, (await client.PostAsJsonAsync(Url(1) + "/preview", request)).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await client.PostAsJsonAsync(Url(1), request)).StatusCode);
    }
}
