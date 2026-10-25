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
    public async Task Court_checkin_opens_five_minutes_before_start_and_end_job_distinguishes_no_show()
    {
        var member = await factory.SeedUserAsync(UserRole.Member);
        var room = await CourseTestData.RoomAsync(factory);
        var start = DateTime.UtcNow.AddHours(1);
        var checkedInId = Guid.NewGuid();
        var noShowId = Guid.NewGuid();
        await factory.QueryAsync(async db =>
        {
            db.Set<CourtRental>().AddRange(
                new CourtRental { CourtRentalId = checkedInId, MemberId = member.UserId, SportId = 3,
                    RoomId = room, StartAtUtc = start, EndAtUtc = start.AddHours(1),
                    Status = CourtRentalStatus.Confirmed, CreatedAtUtc = DateTime.UtcNow },
                new CourtRental { CourtRentalId = noShowId, MemberId = member.UserId, SportId = 3,
                    RoomId = room, StartAtUtc = start.AddHours(2), EndAtUtc = start.AddHours(3),
                    Status = CourtRentalStatus.Confirmed, CreatedAtUtc = DateTime.UtcNow });
            await db.SaveChangesAsync();
            return 0;
        });

        using var scope = factory.Services.CreateScope();
        var early = ActivatorUtilities.CreateInstance<CourtRentalService>(scope.ServiceProvider,
            new TestClock(start.AddMinutes(-5).AddSeconds(-1)));
        await Assert.ThrowsAsync<ConflictException>(() => early.CheckInAsync(checkedInId));
        var onTime = ActivatorUtilities.CreateInstance<CourtRentalService>(scope.ServiceProvider,
            new TestClock(start.AddMinutes(-5)));
        await onTime.CheckInAsync(checkedInId);
        await Assert.ThrowsAsync<ConflictException>(() => onTime.CheckInAsync(checkedInId));

        var afterEnd = ActivatorUtilities.CreateInstance<CourtRentalService>(scope.ServiceProvider,
            new TestClock(start.AddHours(3).AddMinutes(1)));
        await Assert.ThrowsAsync<ConflictException>(() => afterEnd.CheckInAsync(noShowId));
        await afterEnd.CompleteDueAsync();
        var statuses = await factory.QueryAsync(db => db.Set<CourtRental>().AsNoTracking()
            .Where(x => x.CourtRentalId == checkedInId || x.CourtRentalId == noShowId)
            .ToDictionaryAsync(x => x.CourtRentalId, x => x.Status));
        Assert.Equal(CourtRentalStatus.Completed, statuses[checkedInId]);
        Assert.Equal(CourtRentalStatus.NoShow, statuses[noShowId]);
    }

    [Fact]
    public async Task Only_receptionist_can_check_in_a_confirmed_court_rental()
    {
        var member = await factory.SeedUserAsync(UserRole.Member);
        var manager = await factory.SeedUserAsync(UserRole.CenterManager);
        var receptionist = await factory.SeedUserAsync(UserRole.Receptionist);
        var room = await CourseTestData.RoomAsync(factory);
        var rentalId = Guid.NewGuid();
        var now = DateTime.UtcNow;
        await factory.QueryAsync(async db =>
        {
            db.Set<CourtRental>().Add(new CourtRental
            {
                CourtRentalId = rentalId, MemberId = member.UserId, SportId = 3, RoomId = room,
                StartAtUtc = now.AddMinutes(4), EndAtUtc = now.AddMinutes(64),
                Status = CourtRentalStatus.Confirmed, CreatedAtUtc = now
            });
            await db.SaveChangesAsync();
            return 0;
        });
        var url = $"/api/court-rentals/{rentalId}/check-in";
        using var memberClient = factory.CreateApiClient(member.UserId, UserRole.Member);
        Assert.Equal(HttpStatusCode.Forbidden, (await memberClient.PostAsync(url, null)).StatusCode);
        // BR-159: Manager không còn check-in sân thuê.
        using var managerClient = factory.CreateApiClient(manager.UserId, UserRole.CenterManager);
        Assert.Equal(HttpStatusCode.Forbidden, (await managerClient.PostAsync(url, null)).StatusCode);
        using var deskClient = factory.CreateApiClient(receptionist.UserId, UserRole.Receptionist);
        Assert.Equal(HttpStatusCode.NoContent, (await deskClient.PostAsync(url, null)).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, (await deskClient.PostAsync(url, null)).StatusCode);
        Assert.Equal(CourtRentalStatus.InUse, await factory.QueryAsync(db => db.Set<CourtRental>()
            .Where(x => x.CourtRentalId == rentalId).Select(x => x.Status).SingleAsync()));
    }

    [Fact]
    public async Task Only_receptionist_can_mark_no_show_and_only_after_the_rental_has_started()
    {
        var member = await factory.SeedUserAsync(UserRole.Member);
        var manager = await factory.SeedUserAsync(UserRole.CenterManager);
        var receptionist = await factory.SeedUserAsync(UserRole.Receptionist);
        var room = await CourseTestData.RoomAsync(factory);
        var futureId = Guid.NewGuid();
        var startedId = Guid.NewGuid();
        var now = DateTime.UtcNow;
        await factory.QueryAsync(async db =>
        {
            db.Set<CourtRental>().AddRange(
                new CourtRental { CourtRentalId = futureId, MemberId = member.UserId, SportId = 3, RoomId = room,
                    StartAtUtc = now.AddHours(2), EndAtUtc = now.AddHours(3),
                    Status = CourtRentalStatus.Confirmed, CreatedAtUtc = now },
                new CourtRental { CourtRentalId = startedId, MemberId = member.UserId, SportId = 3, RoomId = room,
                    StartAtUtc = now.AddMinutes(-10), EndAtUtc = now.AddMinutes(50),
                    Status = CourtRentalStatus.Confirmed, CreatedAtUtc = now.AddHours(-1) });
            await db.SaveChangesAsync();
            return 0;
        });
        string Url(Guid id) => $"/api/court-rentals/{id}/no-show";
        using var memberClient = factory.CreateApiClient(member.UserId, UserRole.Member);
        using var managerClient = factory.CreateApiClient(manager.UserId, UserRole.CenterManager);
        using var deskClient = factory.CreateApiClient(receptionist.UserId, UserRole.Receptionist);
        Assert.Equal(HttpStatusCode.Forbidden, (await memberClient.PostAsync(Url(startedId), null)).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await managerClient.PostAsync(Url(startedId), null)).StatusCode);
        // Chưa đến giờ bắt đầu thì chưa thể đánh dấu No-show.
        var early = await deskClient.PostAsync(Url(futureId), null);
        Assert.Equal(HttpStatusCode.Conflict, early.StatusCode);
        Assert.Contains("rental_not_started", await early.Content.ReadAsStringAsync());
        Assert.Equal(HttpStatusCode.NoContent, (await deskClient.PostAsync(Url(startedId), null)).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, (await deskClient.PostAsync(Url(startedId), null)).StatusCode);
        Assert.Equal(CourtRentalStatus.NoShow, await factory.QueryAsync(db => db.Set<CourtRental>()
            .Where(x => x.CourtRentalId == startedId).Select(x => x.Status).SingleAsync()));
        Assert.Equal(CourtRentalStatus.Confirmed, await factory.QueryAsync(db => db.Set<CourtRental>()
            .Where(x => x.CourtRentalId == futureId).Select(x => x.Status).SingleAsync()));
    }

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
