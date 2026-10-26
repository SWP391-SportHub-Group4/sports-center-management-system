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
    private async Task<AttendanceResponse> MarkAsync(Guid session, Guid enrollment, Guid actor, DateTime now, string status = "Present", string? reason = null)
    {
        using var scope = factory.Services.CreateScope();
        var service = ActivatorUtilities.CreateInstance<AttendanceService>(scope.ServiceProvider, new TestClock(now));
        return await service.MarkAsync(session, enrollment, new() { Status = status, Reason = reason }, actor);
    }

    [Fact]
    public async Task Coach_marks_attendance_and_receptionist_corrects_only_an_existing_record_with_a_reason()
    {
        var c = await CourseTestData.CreateAsync(factory);
        var member = await factory.SeedUserAsync(UserRole.Member);
        var member2 = await factory.SeedUserAsync(UserRole.Member);
        var receptionist = await factory.SeedUserAsync(UserRole.Receptionist);
        var enrollment = await CourseTestData.EnrollmentAsync(factory, c.Id, member.UserId);
        var enrollment2 = await CourseTestData.EnrollmentAsync(factory, c.Id, member2.UserId);
        var session = (await CourseTestData.SessionsAsync(factory, c.Id))[0];
        Assert.Equal("attendance_not_open", (await Assert.ThrowsAsync<BadRequestException>(() => MarkAsync(session.SessionId, enrollment, c.CoachId, session.StartAtUtc.AddMinutes(-5).AddTicks(-1)))).ErrorCode);
        var first = await MarkAsync(session.SessionId, enrollment, c.CoachId, session.StartAtUtc.AddMinutes(-5));

        // Lễ tân phải ghi lý do (kiến nghị của Member) và chỉ chỉnh bản ghi Coach đã tạo.
        Assert.Equal("attendance_correction_reason_required", (await Assert.ThrowsAsync<BadRequestException>(() =>
            MarkAsync(session.SessionId, enrollment, receptionist.UserId, session.EndAtUtc.AddHours(48), "Absent"))).ErrorCode);
        Assert.Equal("attendance_not_recorded", (await Assert.ThrowsAsync<ConflictException>(() =>
            MarkAsync(session.SessionId, enrollment2, receptionist.UserId, session.EndAtUtc.AddHours(48), "Present", "Member kiến nghị"))).ErrorCode);

        // Coach sửa trong 24 giờ sau khi buổi kết thúc; quá hạn thì Coach bị khóa.
        var corrected = await MarkAsync(session.SessionId, enrollment, c.CoachId, session.EndAtUtc.AddHours(24), "Absent");
        Assert.Equal(first.AttendanceId, corrected.AttendanceId);
        Assert.Equal("Absent", corrected.Status);
        await MarkAsync(session.SessionId, enrollment, c.CoachId, session.EndAtUtc.AddHours(24), "Absent");
        Assert.Equal("attendance_closed", (await Assert.ThrowsAsync<ConflictException>(() => MarkAsync(session.SessionId, enrollment, c.CoachId, session.EndAtUtc.AddHours(24).AddTicks(1)))).ErrorCode);

        // Lễ tân chỉnh sau thời hạn của Coach (kể cả khi lớp đã Completed), có lý do, không giới hạn 24 giờ.
        await factory.QueryAsync(async db => await db.Classes.Where(x => x.ClassId == c.Id).ExecuteUpdateAsync(s => s.SetProperty(x => x.Status, ClassStatus.Completed)));
        var byDesk = await MarkAsync(session.SessionId, enrollment, receptionist.UserId, session.EndAtUtc.AddHours(72), "Present", "Member kiến nghị: có mặt nhưng Coach ghi vắng");
        Assert.Equal(first.AttendanceId, byDesk.AttendanceId);
        Assert.Equal("Present", byDesk.Status);
        Assert.Equal(1, await factory.QueryAsync(db => db.Attendances.CountAsync(x => x.EnrollmentId == enrollment)));
        Assert.Empty(await factory.QueryAsync(db => db.Attendances.Where(x => x.EnrollmentId == enrollment2).ToListAsync()));
        // Ghi lần đầu (Coach), Coach sửa và Lễ tân sửa: mỗi lần đổi trạng thái có đúng một audit.
        Assert.Equal(3, await factory.QueryAsync(db => db.AuditLogs.CountAsync(x => x.TargetId == first.AttendanceId.ToString())));
    }

    [Theory]
    [InlineData(UserRole.CenterManager)] [InlineData(UserRole.Member)] [InlineData(UserRole.SystemAdministrator)]
    public async Task Only_coach_and_receptionist_can_write_through_API(UserRole role)
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
        var enrollment = await CourseTestData.EnrollmentAsync(factory, c.Id, member.UserId);
        var session = (await CourseTestData.SessionsAsync(factory, c.Id))[0];
        var otherSession = (await CourseTestData.SessionsAsync(factory, other.Id))[0];
        // Coach của lớp kia điểm danh ghi danh của lớp này vào buổi của lớp kia.
        Assert.Equal("enrollment_not_in_class", (await Assert.ThrowsAsync<BadRequestException>(() => MarkAsync(otherSession.SessionId, enrollment, other.CoachId, session.StartAtUtc))).ErrorCode);
        // Coach không phụ trách buổi này không được điểm danh.
        Assert.Equal("session_not_assigned", (await Assert.ThrowsAsync<ForbiddenException>(() => MarkAsync(session.SessionId, enrollment, other.CoachId, session.StartAtUtc))).ErrorCode);
        Assert.Equal("invalid_attendance_status", (await Assert.ThrowsAsync<BadRequestException>(() => MarkAsync(session.SessionId, enrollment, c.CoachId, session.StartAtUtc, "NoShow"))).ErrorCode);
        Assert.Equal("invalid_attendance_status", (await Assert.ThrowsAsync<BadRequestException>(() => MarkAsync(session.SessionId, enrollment, c.CoachId, session.StartAtUtc, "0"))).ErrorCode);
        await factory.QueryAsync(db => db.Enrollments.Where(x => x.EnrollmentId == enrollment).ExecuteUpdateAsync(s => s.SetProperty(x => x.Status, EnrollmentStatus.Refunded)));
        Assert.Equal("enrollment_not_active", (await Assert.ThrowsAsync<ConflictException>(() => MarkAsync(session.SessionId, enrollment, c.CoachId, session.StartAtUtc))).ErrorCode);
        Assert.Empty(await factory.QueryAsync(db => db.Attendances.Where(x => x.EnrollmentId == enrollment).ToListAsync()));
    }

    [Fact]
    public async Task Roster_read_is_scoped_to_assigned_coach_and_only_the_assigned_coach_marks_first()
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
        var attendanceUrl = $"api/class-sessions/{session.SessionId}/attendance/{enrollment}";
        Assert.Equal(HttpStatusCode.OK, (await factory.CreateApiClient(c.CoachId, UserRole.Coach).GetAsync(url)).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await factory.CreateApiClient(otherCoach.UserId, UserRole.Coach).GetAsync(url)).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await factory.CreateApiClient(otherCoach.UserId, UserRole.Coach)
            .PutAsJsonAsync(attendanceUrl, new { status = "Present" })).StatusCode);

        var desk = factory.CreateApiClient(receptionist.UserId, UserRole.Receptionist);
        // Lễ tân không điểm danh lần đầu: thiếu lý do thì 400, có lý do nhưng chưa có bản ghi của Coach thì 409.
        Assert.Equal(HttpStatusCode.BadRequest, (await desk.PutAsJsonAsync(attendanceUrl, new { status = "Present" })).StatusCode);
        var noRecord = await desk.PutAsJsonAsync(attendanceUrl, new { status = "Present", reason = "Member kiến nghị" });
        Assert.Equal(HttpStatusCode.Conflict, noRecord.StatusCode);
        Assert.Contains("attendance_not_recorded", await noRecord.Content.ReadAsStringAsync());

        var coach = factory.CreateApiClient(c.CoachId, UserRole.Coach);
        Assert.Equal(HttpStatusCode.OK, (await coach.PutAsJsonAsync(attendanceUrl, new { status = "Absent" })).StatusCode);
        var corrected = await desk.PutAsJsonAsync(attendanceUrl, new { status = "Present", reason = "Member kiến nghị: Coach ghi nhầm" });
        Assert.Equal(HttpStatusCode.OK, corrected.StatusCode);
        Assert.Equal("Present", (await corrected.Content.ReadFromJsonAsync<AttendanceResponse>())!.Status);
    }
}
