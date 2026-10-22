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
using SportHub.Scheduling.Rental.Domain;

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
        foreach (var role in new[] { UserRole.Coach, UserRole.Member, UserRole.SystemAdministrator })
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
    public async Task Staff_calendar_includes_class_rental_and_block(UserRole role)
    {
        var staff = await factory.SeedUserAsync(role);
        var member = await factory.SeedUserAsync(UserRole.Member);
        var course = await CourseTestData.CreateAsync(factory);
        var session = (await CourseTestData.SessionsAsync(factory, course.Id))[0];
        var room = await CourseTestData.RoomAsync(factory);
        var fromDate = CourseTestData.StartDate;
        var rentalId = Guid.NewGuid();
        var blockId = Guid.NewGuid();
        await factory.QueryAsync(async db =>
        {
            db.Set<CourtRental>().Add(new()
            {
                CourtRentalId = rentalId, MemberId = member.UserId, SportId = 3, RoomId = room,
                StartAtUtc = VietnamTime.StartOfDayUtc(fromDate).AddHours(2),
                EndAtUtc = VietnamTime.StartOfDayUtc(fromDate).AddHours(3),
                TotalPrice = 100_000m, Status = CourtRentalStatus.Confirmed, CreatedAtUtc = DateTime.UtcNow
            });
            db.Set<RoomBlock>().Add(new() { BlockId = blockId, RoomId = room,
                StartAtUtc = VietnamTime.StartOfDayUtc(fromDate.AddDays(1)),
                EndAtUtc = VietnamTime.StartOfDayUtc(fromDate.AddDays(2)), Reason = "Calendar fixture", CreatedByUserId = staff.UserId });
            await db.SaveChangesAsync();
            return 0;
        });
        using var client = factory.CreateApiClient(staff.UserId, role);
        var response = await client.GetAsync($"/api/manager/court-schedule?fromDate={fromDate:yyyy-MM-dd}&toDate={fromDate.AddDays(20):yyyy-MM-dd}");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var entries = (await response.Content.ReadFromJsonAsync<List<CourtScheduleEntry>>())!;
        Assert.Contains(entries, x => x.SourceType == "ClassSession" && x.SourceId == session.SessionId);
        Assert.Contains(entries, x => x.SourceType == "CourtRental" && x.SourceId == rentalId);
        Assert.Contains(entries, x => x.SourceType == "RoomBlock" && x.SourceId == blockId);
        // Personal Training đã ngừng cung cấp: lịch nhân viên không còn buổi PT.
        Assert.DoesNotContain(entries, x => x.SourceType == "PtSession");
        Assert.All(entries.Where(x => x.SourceType == "CourtRental"), x => Assert.Empty(x.Participants));
        var filtered = await client.GetFromJsonAsync<List<CourtScheduleEntry>>($"/api/manager/court-schedule?fromDate={fromDate:yyyy-MM-dd}&toDate={fromDate.AddDays(3):yyyy-MM-dd}&roomId={room}");
        Assert.Contains(filtered!, x => x.SourceType == "CourtRental" && x.SourceId == rentalId);
        Assert.Contains(filtered!, x => x.SourceType == "RoomBlock" && x.SourceId == blockId);
        Assert.DoesNotContain(filtered!, x => x.SourceId == session.SessionId);
        Assert.All(filtered!, x => Assert.Equal(room, x.RoomId));
    }

    [Fact]
    public async Task Receptionist_member_calendar_excludes_other_members_and_room_blocks()
    {
        var receptionist = await factory.SeedUserAsync(UserRole.Receptionist);
        var member = await factory.SeedUserAsync(UserRole.Member);
        var other = await factory.SeedUserAsync(UserRole.Member);
        var ownClass = await CourseTestData.CreateAsync(factory);
        var otherClass = await CourseTestData.CreateAsync(factory);
        await CourseTestData.EnrollmentAsync(factory, ownClass.Id, member.UserId);
        await CourseTestData.EnrollmentAsync(factory, otherClass.Id, other.UserId);
        var ownSession = (await CourseTestData.SessionsAsync(factory, ownClass.Id))[0];
        var otherSession = (await CourseTestData.SessionsAsync(factory, otherClass.Id))[0];
        var room = await CourseTestData.RoomAsync(factory);
        var ownRentalId = Guid.NewGuid();
        var otherRentalId = Guid.NewGuid();
        await factory.QueryAsync(async db =>
        {
            foreach (var (id, owner) in new[] { (ownRentalId, member.UserId), (otherRentalId, other.UserId) })
                db.Set<CourtRental>().Add(new()
                {
                    CourtRentalId = id, MemberId = owner, SportId = 3, RoomId = room,
                    StartAtUtc = VietnamTime.StartOfDayUtc(CourseTestData.StartDate).AddHours(2),
                    EndAtUtc = VietnamTime.StartOfDayUtc(CourseTestData.StartDate).AddHours(3),
                    TotalPrice = 100_000m, Status = CourtRentalStatus.Confirmed, CreatedAtUtc = DateTime.UtcNow
                });
            db.Set<RoomBlock>().Add(new()
            {
                BlockId = Guid.NewGuid(), RoomId = room,
                StartAtUtc = VietnamTime.StartOfDayUtc(CourseTestData.StartDate.AddDays(1)),
                EndAtUtc = VietnamTime.StartOfDayUtc(CourseTestData.StartDate.AddDays(2)),
                Reason = "Private member calendar fixture", CreatedByUserId = receptionist.UserId
            });
            await db.SaveChangesAsync();
            return 0;
        });

        using var client = factory.CreateApiClient(receptionist.UserId, UserRole.Receptionist);
        var entries = await client.GetFromJsonAsync<List<CourtScheduleEntry>>(
            $"/api/manager/court-schedule?fromDate={CourseTestData.StartDate:yyyy-MM-dd}&toDate={CourseTestData.StartDate.AddDays(20):yyyy-MM-dd}&memberId={member.UserId}");
        Assert.NotNull(entries);
        Assert.Contains(entries, x => x.SourceId == ownSession.SessionId);
        Assert.Contains(entries, x => x.SourceId == ownRentalId);
        Assert.DoesNotContain(entries, x => x.SourceId == otherSession.SessionId || x.SourceId == otherRentalId || x.SourceType == "RoomBlock");
        Assert.All(entries.SelectMany(x => x.Participants), x => Assert.Equal(member.UserId, x.MemberId));
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
            // Class members are listed but get no refund quote until the manager picks a schedule option.
            Assert.All(preview.Members, m => Assert.Equal("AwaitsScheduleDecision", m.Outcome));
            Assert.All(preview.Members, m => Assert.Null(m.ExpectedRefundPoints));
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
