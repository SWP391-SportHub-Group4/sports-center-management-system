using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SportHub.API.Persistence;
using SportHub.BuildingBlocks.Abstractions.Wallet;
using SportHub.Identity.Domain.Enums;
using SportHub.Payment.Application.Services;
using SportHub.Payment.Wallet.Application;
using SportHub.Scheduling.Domain.Enums;

namespace SportHub.Scheduling.Tests.Integration;

[Collection(nameof(SchedulingApiCollection))]
public sealed class EnrolledClassCancellationTests(SchedulingApiFactory factory)
{
    private async Task<Guid> BuyAsync(int classId)
    {
        var member = await factory.SeedUserAsync(UserRole.Member);
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SportHubDbContext>();
        await using (var tx = await db.Database.BeginTransactionAsync())
        {
            await scope.ServiceProvider.GetRequiredService<IPointWalletService>()
                .EarnAsync(new(member.UserId, 100, "TestCredit", Guid.NewGuid()));
            await tx.CommitAsync();
        }
        var checkout = scope.ServiceProvider.GetRequiredService<CheckoutService>();
        var invoice = await checkout.CreateClassAsync(new(classId, null), Guid.NewGuid().ToString(), member.UserId, false, default);
        await scope.ServiceProvider.GetRequiredService<PointConfirmationService>().SelectSelfAsync(invoice.InvoiceId, 100, member.UserId, default);
        await checkout.StartPaymentAsync(invoice.InvoiceId, member.UserId, false, "127.0.0.1", default);
        return member.UserId;
    }

    private static async Task<JsonElement> Json(HttpResponseMessage response)
        => JsonDocument.Parse(await response.Content.ReadAsStringAsync()).RootElement;

    [Fact]
    public async Task Paid_enrollment_blocks_course_and_makeup_cancellation_without_side_effects()
    {
        var course = await CourseTestData.CreateAsync(factory);
        var member = await BuyAsync(course.Id);
        var sessions = await CourseTestData.SessionsAsync(factory, course.Id);
        using var manager = factory.CreateApiClient(course.ManagerId, UserRole.CenterManager);
        var ledgerBefore = await factory.QueryAsync(db => db.PointLedgerEntries.CountAsync());
        var noticesBefore = await factory.QueryAsync(db => db.Notifications.CountAsync(n => n.UserId == member));
        var auditBefore = await factory.QueryAsync(db => db.AuditLogs.CountAsync());
        var preview = await Json(await manager.GetAsync($"api/manager/classes/{course.Id}/cancellation-preview"));
        Assert.False(preview.GetProperty("canCancel").GetBoolean());
        Assert.Equal(1, preview.GetProperty("confirmedCount").GetInt32());
        Assert.Equal(0, preview.GetProperty("refundPoints").GetInt32());
        var cancel = await manager.PostAsJsonAsync($"api/manager/classes/{course.Id}/cancel", new
        {
            reason = "Coach cannot teach", previewToken = preview.GetProperty("previewToken").GetString()
        });
        Assert.Equal(HttpStatusCode.Conflict, cancel.StatusCode);
        Assert.Equal("class_has_enrollments", (await Json(cancel)).GetProperty("error").GetString());
        var makeup = await manager.PostAsJsonAsync($"api/class-sessions/{sessions[0].SessionId}/cancel", new
        {
            reason = "Try another cancellation path", makeup = new { startAtUtc = sessions[^1].StartAtUtc.AddDays(7) }
        });
        Assert.Equal(HttpStatusCode.Conflict, makeup.StatusCode);
        Assert.Equal("class_has_enrollments", (await Json(makeup)).GetProperty("error").GetString());
        Assert.Equal(ClassStatus.Published, await factory.QueryAsync(db => db.Classes.Where(c => c.ClassId == course.Id).Select(c => c.Status).SingleAsync()));
        Assert.Equal(EnrollmentStatus.Confirmed, await factory.QueryAsync(db => db.Enrollments.Where(e => e.ClassId == course.Id && e.MemberId == member).Select(e => e.Status).SingleAsync()));
        Assert.All(await CourseTestData.SessionsAsync(factory, course.Id), session => Assert.Equal(ClassSessionStatus.Scheduled, session.Status));
        Assert.Equal(sessions.Count, (await CourseTestData.SessionsAsync(factory, course.Id)).Count);
        Assert.Equal(ledgerBefore, await factory.QueryAsync(db => db.PointLedgerEntries.CountAsync()));
        Assert.Equal(noticesBefore, await factory.QueryAsync(db => db.Notifications.CountAsync(n => n.UserId == member)));
        Assert.Equal(auditBefore, await factory.QueryAsync(db => db.AuditLogs.CountAsync()));
        foreach (var session in sessions)
            Assert.True(await factory.QueryAsync(db => db.RoomOccupancies.AnyAsync(o => o.SourceId == session.SessionId && o.IsActive)));
    }

    [Fact]
    public async Task Student_joining_after_preview_blocks_a_stale_cancellation()
    {
        var course = await CourseTestData.CreateAsync(factory);
        using var manager = factory.CreateApiClient(course.ManagerId, UserRole.CenterManager);
        var preview = await Json(await manager.GetAsync($"api/manager/classes/{course.Id}/cancellation-preview"));
        Assert.True(preview.GetProperty("canCancel").GetBoolean());
        await BuyAsync(course.Id);
        var response = await manager.PostAsJsonAsync($"api/manager/classes/{course.Id}/cancel", new
        {
            reason = "Using a stale preview", previewToken = preview.GetProperty("previewToken").GetString()
        });
        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        Assert.Equal("class_has_enrollments", (await Json(response)).GetProperty("error").GetString());
    }

    [Fact]
    public async Task Enrolled_class_can_change_time_room_and_coach_without_ending_enrollment()
    {
        var course = await CourseTestData.CreateAsync(factory);
        var member = await BuyAsync(course.Id);
        var replacement = await CourseTestData.CreateAsync(factory);
        var room = await CourseTestData.RoomAsync(factory);
        var session = (await CourseTestData.SessionsAsync(factory, course.Id))[0];
        using var manager = factory.CreateApiClient(course.ManagerId, UserRole.CenterManager);
        var start = session.StartAtUtc.AddHours(3);
        var response = await manager.PostAsJsonAsync($"api/class-sessions/{session.SessionId}/reschedule", new
        {
            startAtUtc = start, roomId = room, coachId = replacement.CoachId, reason = "Replace unavailable coach and move the session"
        });
        Assert.True(response.IsSuccessStatusCode, await response.Content.ReadAsStringAsync());
        var updated = (await CourseTestData.SessionsAsync(factory, course.Id))[0];
        Assert.Equal(session.SessionId, updated.SessionId);
        Assert.Equal(start, updated.StartAtUtc);
        Assert.Equal(room, updated.RoomId);
        Assert.Equal(replacement.CoachId, updated.CoachId);
        Assert.Equal(ClassSessionStatus.Scheduled, updated.Status);
        Assert.Equal(EnrollmentStatus.Confirmed, await factory.QueryAsync(db => db.Enrollments.Where(e => e.ClassId == course.Id && e.MemberId == member).Select(e => e.Status).SingleAsync()));
    }

    [Fact]
    public async Task Class_without_confirmed_students_can_still_be_cancelled()
    {
        var course = await CourseTestData.CreateAsync(factory);
        using var manager = factory.CreateApiClient(course.ManagerId, UserRole.CenterManager);
        var response = await manager.PostAsJsonAsync($"api/manager/classes/{course.Id}/cancel", new { reason = "No students enrolled" });
        Assert.True(response.IsSuccessStatusCode, await response.Content.ReadAsStringAsync());
        Assert.Equal(ClassStatus.Cancelled, await factory.QueryAsync(db => db.Classes.Where(c => c.ClassId == course.Id).Select(c => c.Status).SingleAsync()));
    }
}
