using System.Net;
using System.Net.Http.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SportHub.BuildingBlocks.Abstractions.Scheduling;
using SportHub.BuildingBlocks.SharedKernel.Errors;
using SportHub.BuildingBlocks.SharedKernel.Time;
using SportHub.Identity.Domain.Enums;
using SportHub.Scheduling.Application.Interfaces;
using SportHub.Scheduling.Catalog.Domain;
using SportHub.Scheduling.Domain.Enums;
using SportHub.Scheduling.Rental.Application;

namespace SportHub.Scheduling.Tests.Integration;

[Collection(nameof(SchedulingApiCollection))]
public sealed class CourtScheduleAndIncidentTests(SchedulingApiFactory factory)
{
    [Fact]
    public async Task Repeated_schedule_changes_queue_distinct_encrypted_emails_and_rollback_on_conflict()
    {
        var course = await CourseTestData.CreateAsync(factory);
        var member = await factory.SeedUserAsync(UserRole.Member);
        await CourseTestData.EnrollmentAsync(factory, course.Id, member.UserId);
        var original = (await CourseTestData.SessionsAsync(factory, course.Id))[0];
        foreach (var hours in new[] { 2, 3 })
            await CourseTestData.RunAsync<IClassSessionService, object>(factory, async svc =>
                await svc.RescheduleAsync(original.SessionId, new()
                {
                    StartAtUtc = original.StartAtUtc.AddHours(hours), Reason = "Schedule email regression"
                }, course.ManagerId));
        var emails = await factory.QueryAsync(db => db.Notifications.AsNoTracking().Where(x =>
            x.UserId == member.UserId && x.Channel == SportHub.Notification.Domain.Enums.NotificationChannel.Email).ToListAsync());
        Assert.Equal(2, emails.Count);
        Assert.Equal(2, emails.Select(x => x.SourceEntityId).Distinct().Count());
        Assert.All(emails, x =>
        {
            Assert.NotNull(x.ProtectedEmailPayload);
            Assert.DoesNotContain("Schedule email regression", x.ProtectedEmailPayload);
        });
        await Assert.ThrowsAsync<BadRequestException>(() => CourseTestData.RunAsync<IClassSessionService, object>(factory,
            async svc => await svc.RescheduleAsync(original.SessionId, new()
            { StartAtUtc = original.StartAtUtc.AddHours(-5), Reason = "Outside opening hours" }, course.ManagerId)));
        Assert.Equal(2, await factory.QueryAsync(db => db.Notifications.CountAsync(x =>
            x.UserId == member.UserId && x.Channel == SportHub.Notification.Domain.Enums.NotificationChannel.Email)));
    }

    [Fact]
    public async Task Coach_calendar_is_filtered_on_server_and_other_roles_cannot_read_staff_calendar()
    {
        var own = await CourseTestData.CreateAsync(factory);
        var other = await CourseTestData.CreateAsync(factory);
        var member = await factory.SeedUserAsync(UserRole.Member);
        await CourseTestData.EnrollmentAsync(factory, other.Id, member.UserId);
        using var coach = factory.CreateApiClient(own.CoachId, UserRole.Coach);
        var range = $"fromDate={CourseTestData.StartDate:yyyy-MM-dd}&toDate={CourseTestData.StartDate.AddDays(20):yyyy-MM-dd}";
        var response = await coach.GetAsync("/api/coaches/me/court-schedule?" + range);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var entries = (await response.Content.ReadFromJsonAsync<List<CourtScheduleEntry>>())!;
        Assert.NotEmpty(entries);
        Assert.All(entries, x => { Assert.Equal(own.Id, x.ClassId); Assert.Equal("ClassSession", x.SourceType); });
        Assert.DoesNotContain(member.UserId.ToString(), await response.Content.ReadAsStringAsync());
        foreach (var role in new[] { UserRole.Coach, UserRole.Member, UserRole.ExternalCoach, UserRole.SystemAdministrator })
        {
            var user = await factory.SeedUserAsync(role);
            using var client = factory.CreateApiClient(user.UserId, role);
            Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync("/api/manager/court-schedule?" + range)).StatusCode);
            Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync("/api/manager/court-schedule/rentals?fromUtc=2032-03-01&toUtc=2032-03-02")).StatusCode);
        }
    }

    [Theory]
    [InlineData(UserRole.CenterManager)]
    [InlineData(UserRole.Receptionist)]
    public async Task Staff_calendar_includes_class_pt_rental_and_block(UserRole role)
    {
        var staff = await factory.SeedUserAsync(role);
        var room = await CourseTestData.RoomAsync(factory);
        var today = DateOnly.FromDateTime(VietnamTime.ToLocal(DateTime.UtcNow));
        await factory.QueryAsync(async db =>
        {
            db.Set<RoomBlock>().Add(new() { BlockId = Guid.NewGuid(), RoomId = room,
                StartAtUtc = VietnamTime.StartOfDayUtc(today.AddDays(1)),
                EndAtUtc = VietnamTime.StartOfDayUtc(today.AddDays(2)), Reason = "Calendar fixture", CreatedByUserId = staff.UserId });
            await db.SaveChangesAsync();
            return 0;
        });
        using var client = factory.CreateApiClient(staff.UserId, role);
        var response = await client.GetAsync($"/api/manager/court-schedule?fromDate={today.AddDays(-10):yyyy-MM-dd}&toDate={today.AddDays(20):yyyy-MM-dd}");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var entries = (await response.Content.ReadFromJsonAsync<List<CourtScheduleEntry>>())!;
        foreach (var type in new[] { "ClassSession", "PtSession", "CourtRental", "RoomBlock" })
            Assert.Contains(entries, x => x.SourceType == type);
        Assert.Contains(entries, x => x.SourceType == "PtSession" && x.Participants.Count == 1);
        Assert.All(entries.Where(x => x.SourceType == "CourtRental"), x => Assert.Empty(x.Participants));
        var filtered = await client.GetFromJsonAsync<List<CourtScheduleEntry>>($"/api/manager/court-schedule?fromDate={today:yyyy-MM-dd}&toDate={today.AddDays(3):yyyy-MM-dd}&roomId={room}");
        Assert.All(filtered!, x => Assert.Equal(room, x.RoomId));
    }

    [Fact]
    public async Task Incident_requires_reschedule_then_can_block_original_slot_without_orphan_schedule()
    {
        var course = await CourseTestData.CreateAsync(factory);
        var session = (await CourseTestData.SessionsAsync(factory, course.Id))[0];
        var request = new IncidentRequest("Room", course.RoomId, session.StartAtUtc, session.EndAtUtc, "Repair court flooring");
        using (var scope = factory.Services.CreateScope())
        {
            var incidents = scope.ServiceProvider.GetRequiredService<IncidentService>();
            var preview = await incidents.PreviewAsync(request);
            Assert.False(preview.CanResolve);
            Assert.Contains(preview.Impacts.SelectMany(x => x.ResolutionOptions), x => x.Action == "Reschedule");
            await Assert.ThrowsAsync<ConflictException>(() => incidents.ResolveAsync(request, course.ManagerId));
        }
        Assert.False(await factory.QueryAsync(db => db.Set<RoomBlock>().AnyAsync(x => x.RoomId == course.RoomId)));
        Assert.True(await factory.QueryAsync(db => db.RoomOccupancies.AnyAsync(x => x.SourceId == session.SessionId && x.IsActive)));
        await CourseTestData.RunAsync<IClassSessionService, object>(factory, async svc =>
            await svc.RescheduleAsync(session.SessionId, new() { StartAtUtc = session.StartAtUtc.AddHours(3), Reason = "Incident resolution" }, course.ManagerId));
        using (var scope = factory.Services.CreateScope())
            await scope.ServiceProvider.GetRequiredService<IncidentService>().ResolveAsync(request, course.ManagerId);
        var updated = (await CourseTestData.SessionsAsync(factory, course.Id))[0];
        Assert.Equal(ClassSessionStatus.Scheduled, updated.Status);
        Assert.Equal(session.StartAtUtc.AddHours(3), updated.StartAtUtc);
        Assert.True(await factory.QueryAsync(db => db.Set<RoomBlock>().AnyAsync(x => x.RoomId == course.RoomId && x.IncidentId != null)));
    }
}
