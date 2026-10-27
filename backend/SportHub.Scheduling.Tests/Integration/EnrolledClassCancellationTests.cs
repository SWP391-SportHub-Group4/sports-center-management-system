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

    [Theory]
    [InlineData(false, false)]
    [InlineData(true, false)]
    [InlineData(false, true)]
    public async Task Sport_deactivation_cancels_enrolled_classes_and_releases_sessions(bool useUpdate, bool inProgress)
    {
        var course = await CourseTestData.CreateAsync(factory);
        var draft = await CourseTestData.CreateAsync(factory, publish: false);
        var completed = await CourseTestData.CreateAsync(factory, publish: false);
        var unrelated = await CourseTestData.CreateAsync(factory, publish: false);
        var member = await BuyAsync(course.Id);
        using var manager = factory.CreateApiClient(course.ManagerId, UserRole.CenterManager);
        var name = "Sport cancellation " + Guid.NewGuid().ToString("N");
        var created = await manager.PostAsJsonAsync("api/manager/sports", new
        {
            code = "off_" + Guid.NewGuid().ToString("N")[..16], name,
            services = Array.Empty<object>()
        });
        created.EnsureSuccessStatusCode();
        var sportId = (await Json(created)).GetProperty("sportId").GetInt32();
        await factory.QueryAsync(async db =>
        {
            await db.Classes.Where(c => c.ClassId == course.Id || c.ClassId == draft.Id || c.ClassId == completed.Id)
                .ExecuteUpdateAsync(s => s.SetProperty(c => c.SportId, sportId));
            await db.Classes.Where(c => c.ClassId == completed.Id)
                .ExecuteUpdateAsync(s => s.SetProperty(c => c.Status, ClassStatus.Completed));
            return 0;
        });
        var preview = await Json(await manager.GetAsync($"api/manager/sports/{sportId}/deactivation-impact"));
        Assert.Equal(2, preview.GetArrayLength());
        Assert.Contains(preview.EnumerateArray(), c => c.GetProperty("classId").GetInt32() == course.Id
            && c.GetProperty("confirmedCount").GetInt32() == 1);
        var sessions = await CourseTestData.SessionsAsync(factory, course.Id);
        if (inProgress)
            await factory.QueryAsync(async db =>
            {
                await db.Classes.Where(c => c.ClassId == course.Id)
                    .ExecuteUpdateAsync(s => s.SetProperty(c => c.Status, ClassStatus.InProgress));
                await db.ClassSessions.Where(s => s.SessionId == sessions[0].SessionId)
                    .ExecuteUpdateAsync(s => s.SetProperty(x => x.Status, ClassSessionStatus.Completed));
                return 0;
            });
        for (var attempt = 0; attempt < 2; attempt++)
        {
            var response = useUpdate
                ? await manager.PutAsJsonAsync($"api/manager/sports/{sportId}", new { name, isActive = false, services = Array.Empty<object>() })
                : await manager.PostAsync($"api/manager/sports/{sportId}/deactivate", null);
            Assert.True(response.IsSuccessStatusCode, await response.Content.ReadAsStringAsync());
        }
        Assert.False(await factory.QueryAsync(db => db.Sports.Where(s => s.SportId == sportId).Select(s => s.IsActive).SingleAsync()));
        foreach (var id in new[] { course.Id, draft.Id })
        {
            Assert.Equal(ClassStatus.Cancelled, await factory.QueryAsync(db => db.Classes.Where(c => c.ClassId == id).Select(c => c.Status).SingleAsync()));
            Assert.False(await factory.QueryAsync(db => db.Classes.Where(c => c.ClassId == id).Select(c => c.EnrollmentOpen).SingleAsync()));
        }
        Assert.Equal(EnrollmentStatus.CancelledByCenter, await factory.QueryAsync(db => db.Enrollments.Where(e => e.ClassId == course.Id && e.MemberId == member).Select(e => e.Status).SingleAsync()));
        Assert.Equal(0, await factory.QueryAsync(db => db.Classes.Where(c => c.ClassId == course.Id).Select(c => c.ReservedCount).SingleAsync()));
        Assert.All((await CourseTestData.SessionsAsync(factory, course.Id)).Where(s => !inProgress || s.SessionId != sessions[0].SessionId),
            s => Assert.Equal(ClassSessionStatus.Cancelled, s.Status));
        foreach (var session in sessions.Where(s => !inProgress || s.SessionId != sessions[0].SessionId))
            Assert.False(await factory.QueryAsync(db => db.RoomOccupancies.AnyAsync(o => o.SourceId == session.SessionId && o.IsActive)));
        Assert.Equal(ClassStatus.Completed, await factory.QueryAsync(db => db.Classes.Where(c => c.ClassId == completed.Id).Select(c => c.Status).SingleAsync()));
        Assert.Equal(ClassStatus.Draft, await factory.QueryAsync(db => db.Classes.Where(c => c.ClassId == unrelated.Id).Select(c => c.Status).SingleAsync()));
        Assert.Equal(0, (await Json(await manager.GetAsync($"api/manager/sports/{sportId}/deactivation-impact"))).GetArrayLength());
    }

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
    public async Task Manager_cancellation_notifies_members_who_then_choose_points_and_is_idempotent()
    {
        var course = await CourseTestData.CreateAsync(factory);
        var members = new[] { await BuyAsync(course.Id), await BuyAsync(course.Id) };
        await factory.QueryAsync(async db => {
            await db.Classes.Where(c => c.ClassId == course.Id).ExecuteUpdateAsync(s => s
                .SetProperty(c => c.BreakEvenThreshold, 3).SetProperty(c => c.CostAmount, 300000)
                .SetProperty(c => c.ThresholdDeadlineUtc, DateTime.UtcNow.AddMinutes(-1)));
            return 0;
        });
        using (var scope = factory.Services.CreateScope()) {
            var service = scope.ServiceProvider.GetRequiredService<IClassThresholdService>();
            await service.EvaluateDueAsync();
            var count = await factory.QueryAsync(db => db.Notifications.CountAsync(n => n.UserId == course.ManagerId));
            await service.EvaluateDueAsync();
            Assert.Equal(count, await factory.QueryAsync(db => db.Notifications.CountAsync(n => n.UserId == course.ManagerId)));
        }
        Assert.False(await factory.QueryAsync(db => db.ThresholdResponses.AnyAsync(r => r.ClassId == course.Id)));
        using var manager = factory.CreateApiClient(course.ManagerId, UserRole.CenterManager);
        var preview = await Json(await manager.GetAsync($"api/manager/classes/{course.Id}/cancellation-preview"));
        Assert.True(preview.GetProperty("canCancel").GetBoolean());
        Assert.True(preview.GetProperty("refundsImmediately").GetBoolean());
        Assert.Equal(200, preview.GetProperty("refundPoints").GetInt32());
        var request = new { reason = "Minimum enrollment was not reached", previewToken = preview.GetProperty("previewToken").GetString() };
        for (var attempt = 0; attempt < 2; attempt++) {
            var response = await manager.PostAsJsonAsync($"api/manager/classes/{course.Id}/cancel", request);
            Assert.True(response.IsSuccessStatusCode, await response.Content.ReadAsStringAsync());
        }
        foreach (var member in members) {
            // Cancelling only notifies: no points are credited until the Member chooses them.
            Assert.Equal(0, await factory.QueryAsync(db => db.PointWallets.Where(w => w.OwnerUserId == member).Select(w => w.AvailablePoints).SingleAsync()));
            Assert.True(await factory.QueryAsync(db => db.Notifications.AnyAsync(n => n.UserId == member && n.SourceEventType == NotificationSourceEventType.ClassCancelled && n.Channel == NotificationChannel.Email)));
        }
        Assert.True(await factory.QueryAsync(db => db.Notifications.AnyAsync(n => n.UserId == course.CoachId && n.SourceEventType == NotificationSourceEventType.ClassCancelled && n.Channel == NotificationChannel.Email)));
        Assert.Equal(ClassStatus.Cancelled, await factory.QueryAsync(db => db.Classes.Where(c => c.ClassId == course.Id).Select(c => c.Status).SingleAsync()));
        Assert.False(await factory.QueryAsync(db => db.Enrollments.AnyAsync(e => e.ClassId == course.Id && e.Status == EnrollmentStatus.Confirmed)));
        Assert.False(await factory.QueryAsync(db => db.ThresholdResponses.AnyAsync(r => r.ClassId == course.Id
            && r.ResolutionStatus == ThresholdResolutionStatus.Pending)));
        using var expiryScope = factory.Services.CreateScope();
        await expiryScope.ServiceProvider.GetRequiredService<ThresholdResponseExpiryService>().ExpireAsync();
        foreach (var member in members)
            Assert.Equal(0, await factory.QueryAsync(db => db.PointWallets.Where(w => w.OwnerUserId == member).Select(w => w.AvailablePoints).SingleAsync()));
        // Each Member then picks the points refund: credited automatically, exactly once.
        using var choiceScope = factory.Services.CreateScope();
        var refunds = choiceScope.ServiceProvider.GetRequiredService<SportHub.Payment.Application.Services.ICenterCancellationRefundService>();
        foreach (var member in members)
        {
            var offer = Assert.Single(await refunds.ListMineAsync(member));
            Assert.Equal("Class", offer.Kind);
            Assert.Equal(100, offer.RefundPoints);
            Assert.Equal(100, (await refunds.ChoosePointsAsync(member, offer.InvoiceItemId)).PointsCredited);
            Assert.True((await refunds.ChoosePointsAsync(member, offer.InvoiceItemId)).AlreadyApplied);
            Assert.Equal(100, await factory.QueryAsync(db => db.PointWallets.Where(w => w.OwnerUserId == member).Select(w => w.AvailablePoints).SingleAsync()));
        }
    }

    [Fact]
    public async Task Management_invoice_list_excludes_void_before_pagination_and_direct_lookup_is_hidden()
    {
        var manager = await factory.SeedUserAsync(UserRole.CenterManager);
        var member = await factory.SeedUserAsync(UserRole.Member);
        var voidId = Guid.NewGuid(); var paidId = Guid.NewGuid();
        await factory.QueryAsync(async db => {
            db.Invoices.AddRange(new SportHub.Payment.Domain.Entities.Invoice { InvoiceId = voidId, InvoiceNumber = $"VOID-{voidId:N}", MemberId = member.UserId, IssuedByUserId = manager.UserId, TotalAmount = 100000, Status = SportHub.Payment.Domain.Enums.InvoiceStatus.Void, IssuedAt = DateTime.UtcNow },
                new SportHub.Payment.Domain.Entities.Invoice { InvoiceId = paidId, InvoiceNumber = $"PAID-{paidId:N}", MemberId = member.UserId, IssuedByUserId = manager.UserId, TotalAmount = 100000, Status = SportHub.Payment.Domain.Enums.InvoiceStatus.Paid, IssuedAt = DateTime.UtcNow });
            await db.SaveChangesAsync(); return 0;
        });
        using var client = factory.CreateApiClient(manager.UserId, UserRole.CenterManager);
        var page = await Json(await client.GetAsync($"api/invoices?memberId={member.UserId}&pageSize=1"));
        Assert.Equal(1, page.GetProperty("totalCount").GetInt32());
        Assert.Equal(paidId, page.GetProperty("items")[0].GetProperty("invoiceId").GetGuid());
        var empty = await Json(await client.GetAsync($"api/invoices?memberId={member.UserId}&status=VOID"));
        Assert.Equal(0, empty.GetProperty("totalCount").GetInt32());
        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync($"api/invoices/{voidId}")).StatusCode);
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

    [Theory]
    [InlineData(true)]
    [InlineData(false)]
    public async Task Cancellation_uses_review_deadline_even_before_the_background_evaluation(bool deadlineReached)
    {
        var course = await CourseTestData.CreateAsync(factory);
        var member = await BuyAsync(course.Id);
        await factory.QueryAsync(async db => {
            await db.Classes.Where(c => c.ClassId == course.Id).ExecuteUpdateAsync(s => s
                .SetProperty(c => c.BreakEvenThreshold, 3)
                .SetProperty(c => c.ThresholdStatus, ThresholdStatus.NotEvaluated)
                .SetProperty(c => c.ThresholdDeadlineUtc, DateTime.UtcNow.AddHours(deadlineReached ? -1 : 1)));
            return 0;
        });
        using var manager = factory.CreateApiClient(course.ManagerId, UserRole.CenterManager);
        var preview = await Json(await manager.GetAsync($"api/manager/classes/{course.Id}/cancellation-preview"));
        Assert.Equal(deadlineReached, preview.GetProperty("canCancel").GetBoolean());
        Assert.Equal(deadlineReached, preview.GetProperty("refundsImmediately").GetBoolean());
        var response = await manager.PostAsJsonAsync($"api/manager/classes/{course.Id}/cancel", new {
            reason = "Opening enrollment remains below threshold", previewToken = preview.GetProperty("previewToken").GetString()
        });
        Assert.Equal(deadlineReached ? HttpStatusCode.OK : HttpStatusCode.Conflict, response.StatusCode);
        Assert.Equal(deadlineReached ? ClassStatus.Cancelled : ClassStatus.Published,
            await factory.QueryAsync(db => db.Classes.Where(c => c.ClassId == course.Id).Select(c => c.Status).SingleAsync()));
        // Cancelling only notifies; points are credited when the Member chooses them.
        Assert.Equal(0,
            await factory.QueryAsync(db => db.PointWallets.Where(w => w.OwnerUserId == member).Select(w => w.AvailablePoints).SingleAsync()));
        if (deadlineReached)
            Assert.True(await factory.QueryAsync(db => db.Notifications.AnyAsync(n => n.UserId == member
                && n.SourceEventType == NotificationSourceEventType.ClassCancelled)));
    }
}
