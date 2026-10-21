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
using SportHub.Scheduling.Threshold.Application;
using SportHub.Scheduling.Threshold.Domain;
using SportHub.Notification.Domain.Enums;

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
    public async Task Manager_cancels_under_threshold_then_member_chooses_refund_or_course_interest()
    {
        foreach (var choice in new[] { "REFUND", "WAIT_NEXT_COURSE" })
        {
            var course = await CourseTestData.CreateAsync(factory);
            var memberId = await BuyAsync(course.Id);
            await factory.QueryAsync(async db =>
            {
                await db.Classes.Where(c => c.ClassId == course.Id).ExecuteUpdateAsync(s => s
                    .SetProperty(c => c.Name, $"Below threshold {course.Id}")
                    .SetProperty(c => c.BreakEvenThreshold, 2).SetProperty(c => c.CostAmount, 200000)
                    .SetProperty(c => c.ThresholdDeadlineUtc, DateTime.UtcNow.AddMinutes(-1)));
                if (choice == "WAIT_NEXT_COURSE")
                    await db.ClassSessions.Where(s => s.ClassId == course.Id && s.SessionNo == 1)
                        .ExecuteUpdateAsync(s => s.SetProperty(s => s.StartAtUtc, DateTime.UtcNow.AddHours(12)));
                return 0;
            });
            using (var scope = factory.Services.CreateScope())
                await scope.ServiceProvider.GetRequiredService<IClassThresholdService>().EvaluateDueAsync();
            using var manager = factory.CreateApiClient(course.ManagerId, UserRole.CenterManager);
            using var member = factory.CreateApiClient(memberId, UserRole.Member);
            var managerAlerts = await Json(await manager.GetAsync("api/notifications"));
            Assert.Contains(managerAlerts.EnumerateArray(), n => n.GetProperty("actionUrl").GetString() == $"/manager/classes/{course.Id}?tab=threshold");
            // Exercise legacy staff alerts that had no source ID as well.
            await factory.QueryAsync(async db =>
            {
                await db.Notifications.Where(n => n.UserId == course.ManagerId && n.SourceEventType == NotificationSourceEventType.ClassThresholdAtRisk)
                    .ExecuteUpdateAsync(s => s.SetProperty(n => n.SourceEntityId, (Guid?)null));
                return 0;
            });
            managerAlerts = await Json(await manager.GetAsync("api/notifications"));
            Assert.Contains(managerAlerts.EnumerateArray(), n => n.GetProperty("actionUrl").GetString() == $"/manager/classes/{course.Id}?tab=threshold");
            if (choice == "REFUND")
            {
                var original = await factory.QueryAsync(db => db.ThresholdResponses.SingleAsync(r => r.ClassId == course.Id && r.MemberId == memberId));
                Assert.True((await member.PostAsJsonAsync($"api/class-threshold-responses/{original.ThresholdResponseId}", new { choice = "KEEP_PLACE" })).IsSuccessStatusCode);
            }
            var preview = await Json(await manager.GetAsync($"api/manager/classes/{course.Id}/cancellation-preview"));
            Assert.True(preview.GetProperty("canCancel").GetBoolean());
            Assert.True(preview.GetProperty("requiresMemberDecision").GetBoolean());
            Assert.Equal(100, preview.GetProperty("refundPoints").GetInt32());
            var cancel = new { reason = "Not enough enrolled students", previewToken = preview.GetProperty("previewToken").GetString() };
            var cancelled = await manager.PostAsJsonAsync($"api/manager/classes/{course.Id}/cancel", cancel);
            Assert.True(cancelled.IsSuccessStatusCode, await cancelled.Content.ReadAsStringAsync());
            var response = await factory.QueryAsync(db => db.ThresholdResponses.SingleAsync(r => r.ClassId == course.Id && r.MemberId == memberId));
            Assert.Null(response.Choice);
            Assert.Equal(ThresholdResolutionStatus.Pending, response.ResolutionStatus);
            Assert.True(response.DeadlineUtc > DateTime.UtcNow.AddHours(47));
            Assert.Equal(ClassStatus.Cancelled, await factory.QueryAsync(db => db.Classes.Where(c => c.ClassId == course.Id).Select(c => c.Status).SingleAsync()));
            Assert.Equal(0, await factory.QueryAsync(db => db.PointWallets.Where(w => w.OwnerUserId == memberId).Select(w => w.AvailablePoints).SingleAsync()));
            Assert.All(await CourseTestData.SessionsAsync(factory, course.Id), s => Assert.Equal(ClassSessionStatus.Cancelled, s.Status));
            var view = await Json(await member.GetAsync($"api/class-threshold-responses/{response.ThresholdResponseId}"));
            Assert.True(view.GetProperty("classCancelled").GetBoolean());
            using var stranger = factory.CreateApiClient((await factory.SeedUserAsync(UserRole.Member)).UserId, UserRole.Member);
            Assert.Equal(HttpStatusCode.NotFound, (await stranger.GetAsync($"api/class-threshold-responses/{response.ThresholdResponseId}")).StatusCode);
            Assert.Equal(HttpStatusCode.NotFound, (await stranger.PostAsJsonAsync($"api/class-threshold-responses/{response.ThresholdResponseId}", new { choice = "REFUND" })).StatusCode);
            Assert.Equal(HttpStatusCode.Conflict, (await member.PostAsJsonAsync($"api/class-threshold-responses/{response.ThresholdResponseId}", new { choice = "KEEP_PLACE" })).StatusCode);
            Assert.Equal(HttpStatusCode.Conflict, (await member.GetAsync($"api/class-threshold-responses/{response.ThresholdResponseId}/transfer-quote?targetClassId={course.Id}")).StatusCode);
            var inbox = await Json(await member.GetAsync("api/notifications"));
            Assert.Contains(inbox.EnumerateArray(), n => n.GetProperty("actionUrl").GetString() == $"/member/services?section=courses&view=owned&responseId={response.ThresholdResponseId}");
            var emails = await factory.QueryAsync(db => db.Notifications.CountAsync(n => n.UserId == memberId
                && n.SourceEntityId == response.ThresholdResponseId && n.Channel == NotificationChannel.Email
                && n.SourceEventType == NotificationSourceEventType.ClassCancelled));
            Assert.Equal(1, emails);
            Assert.True((await manager.PostAsJsonAsync($"api/manager/classes/{course.Id}/cancel", cancel)).IsSuccessStatusCode);
            Assert.Equal(emails, await factory.QueryAsync(db => db.Notifications.CountAsync(n => n.UserId == memberId
                && n.SourceEntityId == response.ThresholdResponseId && n.Channel == NotificationChannel.Email
                && n.SourceEventType == NotificationSourceEventType.ClassCancelled)));
            for (var attempt = 0; attempt < 2; attempt++)
            {
                var submitted = await member.PostAsJsonAsync($"api/class-threshold-responses/{response.ThresholdResponseId}", new { choice });
                Assert.True(submitted.IsSuccessStatusCode, await submitted.Content.ReadAsStringAsync());
            }
            Assert.Equal(100, await factory.QueryAsync(db => db.PointWallets.Where(w => w.OwnerUserId == memberId).Select(w => w.AvailablePoints).SingleAsync()));
            Assert.Equal(choice == "WAIT_NEXT_COURSE" ? 1 : 0,
                await factory.QueryAsync(db => db.Set<CourseInterest>().CountAsync(i => i.MemberId == memberId && i.SportId == course.Request.SportId && i.Active)));
            Assert.False(await factory.QueryAsync(db => db.Enrollments.AnyAsync(e => e.ClassId == course.Id && e.MemberId == memberId && e.Status == EnrollmentStatus.Confirmed)));
        }
    }

    [Fact]
    public async Task Cancelled_class_unanswered_decision_refunds_once_when_deadline_expires()
    {
        var course = await CourseTestData.CreateAsync(factory);
        var memberId = await BuyAsync(course.Id);
        await factory.QueryAsync(async db =>
        {
            await db.Classes.Where(c => c.ClassId == course.Id).ExecuteUpdateAsync(s => s
                .SetProperty(c => c.BreakEvenThreshold, 2).SetProperty(c => c.ThresholdStatus, ThresholdStatus.AtRisk));
            return 0;
        });
        using var manager = factory.CreateApiClient(course.ManagerId, UserRole.CenterManager);
        var preview = await Json(await manager.GetAsync($"api/manager/classes/{course.Id}/cancellation-preview"));
        Assert.True((await manager.PostAsJsonAsync($"api/manager/classes/{course.Id}/cancel", new
        {
            reason = "Cancel below threshold", previewToken = preview.GetProperty("previewToken").GetString()
        })).IsSuccessStatusCode);
        await factory.QueryAsync(async db =>
        {
            await db.Classes.Where(c => c.ClassId == course.Id).ExecuteUpdateAsync(s => s.SetProperty(c => c.ThresholdResponseDeadlineUtc, DateTime.UtcNow.AddMinutes(-1)));
            await db.ThresholdResponses.Where(r => r.ClassId == course.Id).ExecuteUpdateAsync(s => s.SetProperty(r => r.DeadlineUtc, DateTime.UtcNow.AddMinutes(-1)));
            return 0;
        });
        for (var attempt = 0; attempt < 2; attempt++)
        {
            using var scope = factory.Services.CreateScope();
            await scope.ServiceProvider.GetRequiredService<ThresholdResponseExpiryService>().ExpireAsync();
        }
        Assert.Equal(100, await factory.QueryAsync(db => db.PointWallets.Where(w => w.OwnerUserId == memberId).Select(w => w.AvailablePoints).SingleAsync()));
        Assert.False(await factory.QueryAsync(db => db.Enrollments.AnyAsync(e => e.ClassId == course.Id && e.Status == EnrollmentStatus.Confirmed)));
        Assert.Equal(ThresholdResolutionStatus.Expired, await factory.QueryAsync(db => db.ThresholdResponses.Where(r => r.ClassId == course.Id).Select(r => r.ResolutionStatus).SingleAsync()));
        Assert.False(await factory.QueryAsync(db => db.Set<CourseInterest>().AnyAsync(i => i.MemberId == memberId)));
    }

    [Fact]
    public async Task Threshold_cancellation_rechecks_completed_sessions_and_manager_waiver_after_preview()
    {
        foreach (var delivered in new[] { false, true })
        {
            var course = await CourseTestData.CreateAsync(factory);
            await BuyAsync(course.Id);
            await factory.QueryAsync(async db =>
            {
                await db.Classes.Where(c => c.ClassId == course.Id).ExecuteUpdateAsync(s => s
                    .SetProperty(c => c.BreakEvenThreshold, 2).SetProperty(c => c.ThresholdStatus, ThresholdStatus.AtRisk));
                return 0;
            });
            using var manager = factory.CreateApiClient(course.ManagerId, UserRole.CenterManager);
            var preview = await Json(await manager.GetAsync($"api/manager/classes/{course.Id}/cancellation-preview"));
            Assert.True(preview.GetProperty("canCancel").GetBoolean());
            await factory.QueryAsync(async db =>
            {
                if (delivered)
                    await db.ClassSessions.Where(s => s.ClassId == course.Id && s.SessionNo == 1)
                        .ExecuteUpdateAsync(s => s.SetProperty(s => s.Status, ClassSessionStatus.Completed));
                else
                    await db.Classes.Where(c => c.ClassId == course.Id)
                        .ExecuteUpdateAsync(s => s.SetProperty(c => c.ThresholdStatus, ThresholdStatus.WaivedByManager));
                return 0;
            });
            var cancelled = await manager.PostAsJsonAsync($"api/manager/classes/{course.Id}/cancel", new
            {
                reason = "Stale threshold preview", previewToken = preview.GetProperty("previewToken").GetString()
            });
            Assert.Equal(HttpStatusCode.Conflict, cancelled.StatusCode);
            Assert.Equal("class_has_enrollments", (await Json(cancelled)).GetProperty("error").GetString());
            Assert.Equal(ClassStatus.Published, await factory.QueryAsync(db => db.Classes.Where(c => c.ClassId == course.Id).Select(c => c.Status).SingleAsync()));
            Assert.False(await factory.QueryAsync(db => db.ThresholdResponses.AnyAsync(r => r.ClassId == course.Id)));
        }
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
