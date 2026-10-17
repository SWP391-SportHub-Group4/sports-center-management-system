using System.Net;
using System.Net.Http.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SportHub.API.Persistence;
using SportHub.Identity.Domain.Enums;
using SportHub.Scheduling.Application.Services;
using SportHub.Scheduling.Domain.Entities;
using SportHub.Scheduling.Domain.Enums;
using SportHub.Notification.Domain.Enums;

namespace SportHub.Scheduling.Tests.Integration;

[Collection(nameof(SchedulingApiCollection))]
public sealed class CoachScheduleWorkflowTests(SchedulingApiFactory factory)
{
    [Fact]
    public async Task Cancelling_a_whole_course_closes_pending_session_requests()
    {
        var c = await CourseTestData.CreateAsync(factory);
        var s = (await CourseTestData.SessionsAsync(factory, c.Id))[0];
        using var coach = factory.CreateApiClient(c.CoachId, UserRole.Coach);
        using var manager = factory.CreateApiClient(c.ManagerId, UserRole.CenterManager);
        var id = Guid.NewGuid();
        Assert.Equal(HttpStatusCode.OK, (await coach.PostAsJsonAsync($"api/coaches/me/teaching/sessions/{s.SessionId}/change-requests", new CreateClassChangeRequest(id, "SUBSTITUTE", "Need a replacement coach"))).StatusCode);
        var cancelled = await manager.PostAsJsonAsync($"api/manager/classes/{c.Id}/cancel", new { reason = "Center cannot deliver the course" });
        Assert.True(cancelled.IsSuccessStatusCode, await cancelled.Content.ReadAsStringAsync());
        Assert.Equal("WITHDRAWN", await factory.QueryAsync(db => db.Set<ClassSessionChangeRequest>().Where(r => r.RequestId == id).Select(r => r.Status).SingleAsync()));
        Assert.Equal(HttpStatusCode.Forbidden, (await coach.GetAsync($"api/class-sessions/{s.SessionId}/roster")).StatusCode);
    }

    [Fact]
    public async Task Another_current_assignment_preserves_member_access_but_does_not_reopen_the_ended_class()
    {
        var first = await CourseTestData.CreateAsync(factory);
        var second = await CourseTestData.CreateAsync(factory);
        var member = await factory.SeedUserAsync(UserRole.Member);
        await CourseTestData.EnrollmentAsync(factory, first.Id, member.UserId);
        await CourseTestData.EnrollmentAsync(factory, second.Id, member.UserId);
        using (var scope = factory.Services.CreateScope()) {
            var db = scope.ServiceProvider.GetRequiredService<SportHubDbContext>();
            await db.Set<Class>().Where(c => c.ClassId == second.Id).ExecuteUpdateAsync(u => u.SetProperty(c => c.CoachId, first.CoachId));
            await db.Set<Class>().Where(c => c.ClassId == first.Id).ExecuteUpdateAsync(u => u.SetProperty(c => c.Status, ClassStatus.Completed));
        }
        using var coach = factory.CreateApiClient(first.CoachId, UserRole.Coach);
        Assert.Equal(HttpStatusCode.OK, (await coach.GetAsync($"api/coaches/me/teaching/students/{member.UserId}/health-profile")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await coach.GetAsync($"api/coaches/me/teaching/classes/{first.Id}/records")).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await coach.GetAsync($"api/coaches/me/teaching/classes/{second.Id}/records")).StatusCode);
    }

    [Fact]
    public async Task Direct_substitution_notifies_both_coaches_and_a_cancel_with_makeup_closes_pending_requests()
    {
        var c = await CourseTestData.CreateAsync(factory);
        var substitute = await factory.SeedUserAsync(UserRole.Coach);
        var sessions = await CourseTestData.SessionsAsync(factory, c.Id);
        var s = sessions[0];
        using (var scope = factory.Services.CreateScope()) {
            var db = scope.ServiceProvider.GetRequiredService<SportHubDbContext>();
            db.UserSportSpecialties.Add(new SportHub.Identity.Domain.Entities.UserSportSpecialty { UserId = substitute.UserId, SportId = 3 });
            db.CoachProfiles.Add(new SportHub.Identity.Domain.Entities.CoachProfile { UserId = substitute.UserId });
            await db.SaveChangesAsync();
        }
        using var manager = factory.CreateApiClient(c.ManagerId, UserRole.CenterManager);
        var changed = await manager.PostAsJsonAsync($"api/class-sessions/{s.SessionId}/reschedule", new { startAtUtc = s.StartAtUtc, coachId = substitute.UserId, reason = "Emergency substitute arrangement" });
        Assert.True(changed.IsSuccessStatusCode, await changed.Content.ReadAsStringAsync());
        foreach (var coachId in new[] { c.CoachId, substitute.UserId })
            foreach (var channel in new[] { NotificationChannel.InApp, NotificationChannel.Email })
                Assert.True(await factory.QueryAsync(db => db.Notifications.AnyAsync(n => n.UserId == coachId && n.Channel == channel && n.SourceEventType == NotificationSourceEventType.ScheduleChanged)));
        using var coach = factory.CreateApiClient(substitute.UserId, UserRole.Coach);
        var id = Guid.NewGuid();
        Assert.Equal(HttpStatusCode.OK, (await coach.PostAsJsonAsync($"api/coaches/me/teaching/sessions/{s.SessionId}/change-requests", new CreateClassChangeRequest(id, "CANCEL_WITH_MAKEUP", "Emergency leave requested"))).StatusCode);
        var cancelled = await manager.PostAsJsonAsync($"api/class-sessions/{s.SessionId}/cancel", new { reason = "Court incident", makeup = new { startAtUtc = sessions.Last().StartAtUtc.AddDays(7) } });
        Assert.True(cancelled.IsSuccessStatusCode, await cancelled.Content.ReadAsStringAsync());
        Assert.Equal("WITHDRAWN", await factory.QueryAsync(db => db.Set<ClassSessionChangeRequest>().Where(r => r.RequestId == id).Select(r => r.Status).SingleAsync()));
    }

    [Fact]
    public async Task Conflicting_direct_change_preserves_pending_request_and_sends_no_change_notice()
    {
        var c = await CourseTestData.CreateAsync(factory);
        var sessions = await CourseTestData.SessionsAsync(factory, c.Id);
        using var coach = factory.CreateApiClient(c.CoachId, UserRole.Coach);
        using var manager = factory.CreateApiClient(c.ManagerId, UserRole.CenterManager);
        var id = Guid.NewGuid();
        Assert.Equal(HttpStatusCode.OK, (await coach.PostAsJsonAsync($"api/coaches/me/teaching/sessions/{sessions[0].SessionId}/change-requests", new CreateClassChangeRequest(id, "SUBSTITUTE", "Need another coach"))).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, (await manager.PostAsJsonAsync($"api/class-sessions/{sessions[0].SessionId}/reschedule", new { startAtUtc = sessions[1].StartAtUtc, reason = "Conflicting target slot" })).StatusCode);
        Assert.Equal("PENDING", await factory.QueryAsync(db => db.Set<ClassSessionChangeRequest>().Where(r => r.RequestId == id).Select(r => r.Status).SingleAsync()));
        Assert.False(await factory.QueryAsync(db => db.Notifications.AnyAsync(n => n.UserId == c.CoachId && n.SourceEventType == NotificationSourceEventType.ScheduleChanged)));
    }

    [Fact]
    public async Task Pending_request_can_be_edited_and_direct_reschedule_closes_it_with_notifications()
    {
        var c = await CourseTestData.CreateAsync(factory);
        var s = (await CourseTestData.SessionsAsync(factory, c.Id))[0];
        using var coach = factory.CreateApiClient(c.CoachId, UserRole.Coach);
        using var manager = factory.CreateApiClient(c.ManagerId, UserRole.CenterManager);
        var id = Guid.NewGuid();
        var input = new CreateClassChangeRequest(id, "SUBSTITUTE", "Unavailable for this lesson");
        Assert.Equal(HttpStatusCode.OK, (await coach.PostAsJsonAsync($"api/coaches/me/teaching/sessions/{s.SessionId}/change-requests", input)).StatusCode);
        var edited = await coach.PutAsJsonAsync($"api/coaches/me/teaching/change-requests/{id}", input with { Reason = "Updated availability details" });
        Assert.True(edited.IsSuccessStatusCode, await edited.Content.ReadAsStringAsync());
        Assert.Equal(HttpStatusCode.OK, (await manager.PostAsJsonAsync($"api/class-sessions/{s.SessionId}/reschedule", new { startAtUtc = s.StartAtUtc.AddHours(2), reason = "Room unavailable due to incident" })).StatusCode);
        var request = await factory.QueryAsync(db => db.Set<ClassSessionChangeRequest>().AsNoTracking().SingleAsync(r => r.RequestId == id));
        Assert.Equal("WITHDRAWN", request.Status);
        Assert.Equal("SCHEDULE_UPDATED", request.ResolutionType);
        Assert.Equal(c.ManagerId, request.ReviewedByUserId);
        Assert.Contains("automatically", request.ReviewNote);
        Assert.Equal(HttpStatusCode.Conflict, (await coach.PutAsJsonAsync($"api/coaches/me/teaching/change-requests/{id}", input)).StatusCode);
        foreach (var channel in new[] { NotificationChannel.InApp, NotificationChannel.Email })
            Assert.True(await factory.QueryAsync(db => db.Notifications.AnyAsync(n => n.UserId == c.CoachId && n.Channel == channel && n.SourceEventType == NotificationSourceEventType.ScheduleChanged)));
    }

    [Fact]
    public async Task Approving_a_request_does_not_auto_cancel_it()
    {
        var c = await CourseTestData.CreateAsync(factory);
        var s = (await CourseTestData.SessionsAsync(factory, c.Id))[0];
        using var coach = factory.CreateApiClient(c.CoachId, UserRole.Coach);
        using var manager = factory.CreateApiClient(c.ManagerId, UserRole.CenterManager);
        var id = Guid.NewGuid();
        Assert.Equal(HttpStatusCode.OK, (await coach.PostAsJsonAsync($"api/coaches/me/teaching/sessions/{s.SessionId}/change-requests", new CreateClassChangeRequest(id, "RESCHEDULE", "Please move this lesson", s.StartAtUtc.AddHours(2), s.EndAtUtc.AddHours(2)))).StatusCode);
        var response = await manager.PostAsJsonAsync($"api/manager/class-session-change-requests/{id}/resolve", new ResolveClassChangeRequest("RESCHEDULE", "Approved new slot", s.StartAtUtc.AddHours(2)));
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("RESOLVED", await factory.QueryAsync(db => db.Set<ClassSessionChangeRequest>().Where(r => r.RequestId == id).Select(r => r.Status).SingleAsync()));
    }

    [Fact]
    public async Task Withdrawal_and_class_completion_remove_student_access_without_waiting_for_relationship_cleanup()
    {
        var c = await CourseTestData.CreateAsync(factory);
        var member = await factory.SeedUserAsync(UserRole.Member);
        var enrollmentId = await CourseTestData.EnrollmentAsync(factory, c.Id, member.UserId);
        using var coach = factory.CreateApiClient(c.CoachId, UserRole.Coach);
        var health = $"api/coaches/me/teaching/students/{member.UserId}/health-profile";
        var legacy = $"api/members/{member.UserId}/training-profile";
        Assert.Equal(HttpStatusCode.OK, (await coach.GetAsync(health)).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, (await coach.GetAsync(legacy)).StatusCode);
        using (var scope = factory.Services.CreateScope()) {
            var db = scope.ServiceProvider.GetRequiredService<SportHubDbContext>();
            await db.Set<Enrollment>().Where(e => e.EnrollmentId == enrollmentId).ExecuteUpdateAsync(u => u.SetProperty(e => e.Status, EnrollmentStatus.Refunded));
        }
        Assert.Equal(HttpStatusCode.Forbidden, (await coach.GetAsync(health)).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await coach.GetAsync(legacy)).StatusCode);
        using (var scope = factory.Services.CreateScope()) {
            var db = scope.ServiceProvider.GetRequiredService<SportHubDbContext>();
            await db.Set<Enrollment>().Where(e => e.EnrollmentId == enrollmentId).ExecuteUpdateAsync(u => u.SetProperty(e => e.Status, EnrollmentStatus.Confirmed));
            await db.Set<Class>().Where(x => x.ClassId == c.Id).ExecuteUpdateAsync(u => u.SetProperty(x => x.Status, ClassStatus.Completed));
        }
        Assert.Equal(HttpStatusCode.Forbidden, (await coach.GetAsync(health)).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await coach.GetAsync(legacy)).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await coach.GetAsync($"api/coaches/me/teaching/classes/{c.Id}/records")).StatusCode);
    }

    [Fact]
    public async Task Substitute_can_read_only_the_assigned_session_not_profiles_or_other_sessions()
    {
        var c = await CourseTestData.CreateAsync(factory);
        var member = await factory.SeedUserAsync(UserRole.Member);
        var substitute = await factory.SeedUserAsync(UserRole.Coach);
        await CourseTestData.EnrollmentAsync(factory, c.Id, member.UserId);
        var sessions = await CourseTestData.SessionsAsync(factory, c.Id);
        var assigned = sessions[0]; var other = sessions[1];
        using (var scope = factory.Services.CreateScope()) {
            var db = scope.ServiceProvider.GetRequiredService<SportHubDbContext>();
            await db.Set<ClassSession>().Where(x => x.SessionId == assigned.SessionId).ExecuteUpdateAsync(u => u.SetProperty(s => s.CoachId, substitute.UserId));
            db.Set<ClassTeachingRecord>().AddRange(
                new ClassTeachingRecord { RecordId = Guid.NewGuid(), ClassId = c.Id, CoachId = substitute.UserId, SessionId = assigned.SessionId, Kind = "PLAN", Title = "Assigned session", Content = "Session exercises", Version = 1, CreatedAtUtc = DateTime.UtcNow, UpdatedAtUtc = DateTime.UtcNow },
                new ClassTeachingRecord { RecordId = Guid.NewGuid(), ClassId = c.Id, CoachId = c.CoachId, SessionId = other.SessionId, Kind = "PLAN", Title = "Other session", Content = "Other exercises", Version = 1, CreatedAtUtc = DateTime.UtcNow, UpdatedAtUtc = DateTime.UtcNow },
                new ClassTeachingRecord { RecordId = Guid.NewGuid(), ClassId = c.Id, CoachId = c.CoachId, Kind = "PLAN", Title = "Whole course", Content = "Course plan", Version = 1, CreatedAtUtc = DateTime.UtcNow, UpdatedAtUtc = DateTime.UtcNow });
            await db.SaveChangesAsync();
        }
        using var client = factory.CreateApiClient(substitute.UserId, UserRole.Coach);
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync($"api/class-sessions/{assigned.SessionId}/roster")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync($"api/class-sessions/{other.SessionId}/roster")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync($"api/coaches/me/teaching/students/{member.UserId}/health-profile")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync($"api/coaches/me/students/{member.UserId}/health-profile")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync($"api/coaches/me/teaching/classes/{c.Id}/members")).StatusCode);
        var members = await client.GetFromJsonAsync<TeachingMember[]>($"api/coaches/me/teaching/classes/{c.Id}/members?sessionId={assigned.SessionId}");
        Assert.Single(members!); Assert.Null(members![0].Notes); Assert.Null(members[0].Goal);
        var visible = await client.GetFromJsonAsync<System.Text.Json.JsonElement[]>($"api/classes/{c.Id}/sessions");
        Assert.Single(visible!);
        Assert.Equal(assigned.SessionId, visible![0].GetProperty("sessionId").GetGuid());
        var records = await client.GetFromJsonAsync<System.Text.Json.JsonElement>($"api/coaches/me/teaching/classes/{c.Id}/records");
        Assert.Equal(1, records.GetProperty("items").GetArrayLength());
        Assert.Equal("Assigned session", records.GetProperty("items")[0].GetProperty("title").GetString());
    }
}
