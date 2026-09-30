using System.Net;
using System.Net.Http.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SportHub.BuildingBlocks.SharedKernel.Errors;
using SportHub.Identity.Domain.Enums;
using SportHub.Scheduling.Application.DTOs;
using SportHub.Scheduling.Application.Services;
using SportHub.Scheduling.Domain.Enums;

namespace SportHub.Scheduling.Tests.Integration;

[Collection(nameof(SchedulingApiCollection))]
public sealed class CourseAttendanceTests(SchedulingApiFactory factory)
{
    private async Task<AttendanceResponse> MarkAsync(Guid session, Guid enrollment, Guid actor, DateTime now, string status = "Present")
    {
        using var scope = factory.Services.CreateScope();
        var service = ActivatorUtilities.CreateInstance<AttendanceService>(scope.ServiceProvider, new TestClock(now));
        return await service.MarkAsync(session, enrollment, new() { Status = status }, actor);
    }

    [Fact]
    public async Task Attendance_obeys_time_boundaries_and_corrections_are_audited_once()
    {
        var c = await CourseTestData.CreateAsync(factory);
        var member = await factory.SeedUserAsync(UserRole.Member);
        var receptionist = await factory.SeedUserAsync(UserRole.Receptionist);
        var enrollment = await CourseTestData.EnrollmentAsync(factory, c.Id, member.UserId);
        var session = (await CourseTestData.SessionsAsync(factory, c.Id))[0];
        Assert.Equal("attendance_not_open", (await Assert.ThrowsAsync<BadRequestException>(() => MarkAsync(session.SessionId, enrollment, receptionist.UserId, session.StartAtUtc.AddTicks(-1)))).ErrorCode);
        var first = await MarkAsync(session.SessionId, enrollment, receptionist.UserId, session.StartAtUtc);
        // The status job may already have completed the last session/course, but the correction window stays open.
        await factory.QueryAsync(async db => await db.Classes.Where(x => x.ClassId == c.Id).ExecuteUpdateAsync(s => s.SetProperty(x => x.Status, ClassStatus.Completed)));
        var corrected = await MarkAsync(session.SessionId, enrollment, receptionist.UserId, session.EndAtUtc.AddHours(24), "Absent");
        Assert.Equal(first.AttendanceId, corrected.AttendanceId);
        Assert.Equal("Absent", corrected.Status);
        await MarkAsync(session.SessionId, enrollment, receptionist.UserId, session.EndAtUtc.AddHours(24), "Absent");
        Assert.Equal("attendance_closed", (await Assert.ThrowsAsync<ConflictException>(() => MarkAsync(session.SessionId, enrollment, receptionist.UserId, session.EndAtUtc.AddHours(24).AddTicks(1)))).ErrorCode);
        Assert.Equal(1, await factory.QueryAsync(db => db.Attendances.CountAsync(x => x.EnrollmentId == enrollment)));
        Assert.Equal(2, await factory.QueryAsync(db => db.AuditLogs.CountAsync(x => x.TargetId == first.AttendanceId.ToString())));
    }

    [Theory]
    [InlineData(UserRole.Coach)] [InlineData(UserRole.CenterManager)] [InlineData(UserRole.Member)] [InlineData(UserRole.SystemAdministrator)] [InlineData(UserRole.ExternalCoach)]
    public async Task Only_receptionist_can_write_through_API(UserRole role)
    {
        var user = await factory.SeedUserAsync(role);
        var response = await factory.CreateApiClient(user.UserId, role).PutAsJsonAsync($"api/class-sessions/{Guid.NewGuid()}/attendance/{Guid.NewGuid()}", new { status = "Present" });
        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    [Fact]
    public async Task Wrong_class_cancelled_or_ended_enrollment_and_group_no_show_are_rejected()
    {
        var c = await CourseTestData.CreateAsync(factory);
        var other = await CourseTestData.CreateAsync(factory);
        var member = await factory.SeedUserAsync(UserRole.Member);
        var receptionist = await factory.SeedUserAsync(UserRole.Receptionist);
        var enrollment = await CourseTestData.EnrollmentAsync(factory, c.Id, member.UserId);
        var session = (await CourseTestData.SessionsAsync(factory, c.Id))[0];
        var otherSession = (await CourseTestData.SessionsAsync(factory, other.Id))[0];
        Assert.Equal("enrollment_not_in_class", (await Assert.ThrowsAsync<BadRequestException>(() => MarkAsync(otherSession.SessionId, enrollment, receptionist.UserId, session.StartAtUtc))).ErrorCode);
        Assert.Equal("invalid_attendance_status", (await Assert.ThrowsAsync<BadRequestException>(() => MarkAsync(session.SessionId, enrollment, receptionist.UserId, session.StartAtUtc, "NoShow"))).ErrorCode);
        Assert.Equal("invalid_attendance_status", (await Assert.ThrowsAsync<BadRequestException>(() => MarkAsync(session.SessionId, enrollment, receptionist.UserId, session.StartAtUtc, "0"))).ErrorCode);
        await factory.QueryAsync(db => db.Enrollments.Where(x => x.EnrollmentId == enrollment).ExecuteUpdateAsync(s => s.SetProperty(x => x.Status, EnrollmentStatus.Refunded)));
        Assert.Equal("enrollment_not_active", (await Assert.ThrowsAsync<ConflictException>(() => MarkAsync(session.SessionId, enrollment, receptionist.UserId, session.StartAtUtc))).ErrorCode);
        Assert.Empty(await factory.QueryAsync(db => db.Attendances.Where(x => x.EnrollmentId == enrollment).ToListAsync()));
    }

    [Fact]
    public async Task Roster_read_is_scoped_to_assigned_coach_and_receptionist_can_mark()
    {
        var c = await CourseTestData.CreateAsync(factory);
        var member = await factory.SeedUserAsync(UserRole.Member);
        var receptionist = await factory.SeedUserAsync(UserRole.Receptionist);
        var otherCoach = await factory.SeedUserAsync(UserRole.Coach);
        var enrollment = await CourseTestData.EnrollmentAsync(factory, c.Id, member.UserId);
        var session = (await CourseTestData.SessionsAsync(factory, c.Id))[0];
        await factory.QueryAsync(db => db.ClassSessions.Where(s => s.SessionId == session.SessionId).ExecuteUpdateAsync(s => s
            .SetProperty(x => x.StartAtUtc, DateTime.UtcNow.AddMinutes(-30)).SetProperty(x => x.EndAtUtc, DateTime.UtcNow.AddHours(1))));
        var url = $"api/class-sessions/{session.SessionId}/roster";
        Assert.Equal(HttpStatusCode.OK, (await factory.CreateApiClient(c.CoachId, UserRole.Coach).GetAsync(url)).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await factory.CreateApiClient(otherCoach.UserId, UserRole.Coach).GetAsync(url)).StatusCode);
        var response = await factory.CreateApiClient(receptionist.UserId, UserRole.Receptionist)
            .PutAsJsonAsync($"api/class-sessions/{session.SessionId}/attendance/{enrollment}", new { status = "Present" });
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }
}
