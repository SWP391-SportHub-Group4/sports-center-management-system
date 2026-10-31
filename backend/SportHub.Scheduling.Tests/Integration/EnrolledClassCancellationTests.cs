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

    private static object[] RefundDecisions(JsonElement preview, int? points = null)
        => preview.GetProperty("members").EnumerateArray().Select(m => (object)new
        {
            enrollmentId = m.GetProperty("enrollmentId").GetGuid(),
            points = points ?? m.GetProperty("refundPoints").GetInt32()
        }).ToArray();

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

    [Theory]
    [InlineData(0, 100, false, 0, false)]
    [InlineData(1, 66, false, 0, false)]
    [InlineData(2, 33, false, 0, false)]
    [InlineData(1, 66, true, 0, false)]
    [InlineData(1, 56, false, 10, false)]
    [InlineData(1, 66, false, 0, true)]
    [InlineData(2, 100, false, 0, false)]
    public async Task Manager_cancels_enrolled_class_with_explicit_refund_points(int completed, int expectedPoints,
        bool makeupProvided, int refundedBeforeCancellation, bool autoRefund)
    {
        var course = await CourseTestData.CreateAsync(factory);
        var member = await BuyAsync(course.Id);
        var sessions = await CourseTestData.SessionsAsync(factory, course.Id);
        using var manager = factory.CreateApiClient(course.ManagerId, UserRole.CenterManager);
        await factory.QueryAsync(async db =>
        {
            await db.Classes.Where(c => c.ClassId == course.Id).ExecuteUpdateAsync(s => s
                .SetProperty(c => c.ThresholdStatus, ThresholdStatus.Met)
                .SetProperty(c => c.Status, completed > 0 ? ClassStatus.InProgress : ClassStatus.Published));
            var completedIds = sessions.Take(completed).Select(s => s.SessionId).ToList();
            await db.ClassSessions.Where(s => completedIds.Contains(s.SessionId))
                .ExecuteUpdateAsync(s => s.SetProperty(s => s.Status, ClassSessionStatus.Completed));
            if (makeupProvided)
            {
                var original = await db.ClassSessions.SingleAsync(s => s.SessionId == sessions[0].SessionId);
                original.Status = ClassSessionStatus.Cancelled;
                db.ClassSessions.Add(new SportHub.Scheduling.Domain.Entities.ClassSession
                {
                    SessionId = Guid.NewGuid(), ClassId = course.Id, SessionNo = 4,
                    RoomId = original.RoomId, CoachId = original.CoachId,
                    StartAtUtc = original.StartAtUtc.AddDays(1), EndAtUtc = original.EndAtUtc.AddDays(1),
                    Status = ClassSessionStatus.Completed, IsMakeup = true, RescheduledFromSessionId = original.SessionId
                });
                await db.SaveChangesAsync();
            }
            return 0;
        });
        if (refundedBeforeCancellation > 0)
        {
            using var earlier = factory.Services.CreateScope();
            var state = earlier.ServiceProvider.GetRequiredService<SportHubDbContext>();
            var itemId = await state.Enrollments.Where(e => e.ClassId == course.Id && e.MemberId == member)
                .Select(e => e.InvoiceItemId!.Value).SingleAsync();
            await using var tx = await state.Database.BeginTransactionAsync();
            await earlier.ServiceProvider.GetRequiredService<IPointWalletService>().EarnAsync(new(member,
                refundedBeforeCancellation, "SystemEvent", Guid.NewGuid(), null, "Earlier refund", itemId));
            await tx.CommitAsync();
        }
        var preview = await Json(await manager.GetAsync($"api/manager/classes/{course.Id}/cancellation-preview"));
        Assert.True(preview.GetProperty("canCancel").GetBoolean());
        Assert.Equal(1, preview.GetProperty("confirmedCount").GetInt32());
        Assert.Equal(100 - refundedBeforeCancellation, preview.GetProperty("refundPoints").GetInt32());
        // Cancelling an individual session still cannot bypass the enrolled-class guard.
        var makeup = await manager.PostAsJsonAsync($"api/class-sessions/{sessions[^1].SessionId}/cancel", new
        {
            reason = "Try another cancellation path", makeup = new { startAtUtc = sessions[^1].StartAtUtc.AddDays(7) }
        });
        Assert.Equal(HttpStatusCode.Conflict, makeup.StatusCode);
        Assert.Equal("class_has_enrollments", (await Json(makeup)).GetProperty("error").GetString());
        var cancel = await manager.PostAsJsonAsync($"api/manager/classes/{course.Id}/cancel", new
        {
            reason = "Coach cannot teach", previewToken = preview.GetProperty("previewToken").GetString(),
            refunds = RefundDecisions(preview, expectedPoints)
        });
        Assert.True(cancel.IsSuccessStatusCode, await cancel.Content.ReadAsStringAsync());
        Assert.Equal(ClassStatus.Cancelled, await factory.QueryAsync(db => db.Classes.Where(c => c.ClassId == course.Id).Select(c => c.Status).SingleAsync()));
        Assert.Equal(EnrollmentStatus.CancelledByCenter, await factory.QueryAsync(db => db.Enrollments.Where(e => e.ClassId == course.Id && e.MemberId == member).Select(e => e.Status).SingleAsync()));
        var after = await CourseTestData.SessionsAsync(factory, course.Id);
        Assert.Equal(completed, after.Count(s => s.Status == ClassSessionStatus.Completed));
        Assert.Equal(3 - completed + (makeupProvided ? 1 : 0), after.Count(s => s.Status == ClassSessionStatus.Cancelled));
        foreach (var session in sessions.Skip(completed))
            Assert.False(await factory.QueryAsync(db => db.RoomOccupancies.AnyAsync(o => o.SourceId == session.SessionId && o.IsActive)));
        using var scope = factory.Services.CreateScope();
        var refunds = scope.ServiceProvider.GetRequiredService<ICenterCancellationRefundService>();
        var offer = Assert.Single(await refunds.ListMineAsync(member));
        Assert.Equal(expectedPoints, offer.RefundPoints);
        // The Support Request payout uses the same cap as the wallet choice.
        var db = scope.ServiceProvider.GetRequiredService<SportHubDbContext>();
        var invoice = await db.Invoices.SingleAsync(i => i.InvoiceId == offer.InvoiceId);
        var payoutQuote = Assert.Single(await SupportRefundCalculator.ItemsAsync(db, invoice,
            scope.ServiceProvider.GetRequiredService<SportHub.BuildingBlocks.Abstractions.Scheduling.ICenterCancellationReader>(), default));
        Assert.Equal(expectedPoints, payoutQuote.MaxRefundablePoints);
        if (autoRefund)
        {
            var job = new CenterCancellationRefundService(db,
                scope.ServiceProvider.GetRequiredService<SportHub.BuildingBlocks.Abstractions.Scheduling.ICenterCancellationReader>(),
                scope.ServiceProvider.GetRequiredService<SportHub.BuildingBlocks.Abstractions.Payment.IRefundCreditService>(),
                new TestClock(offer.CancelledAtUtc.AddDays(3)),
                Microsoft.Extensions.Logging.Abstractions.NullLogger<CenterCancellationRefundService>.Instance);
            await job.AutoRefundDueAsync();
        }
        Assert.Equal(expectedPoints, (await refunds.ChoosePointsAsync(member, offer.InvoiceItemId)).PointsCredited);
        Assert.True((await refunds.ChoosePointsAsync(member, offer.InvoiceItemId)).AlreadyApplied);
        Assert.Equal(0, (await SupportRefundCalculator.ItemsAsync(db, invoice,
            scope.ServiceProvider.GetRequiredService<SportHub.BuildingBlocks.Abstractions.Scheduling.ICenterCancellationReader>(), default))[0].MaxRefundablePoints);
    }

    [Theory]
    [InlineData(ClassStatus.Completed)]
    [InlineData(ClassStatus.Cancelled)]
    public async Task Closed_class_cannot_offer_another_cancellation(ClassStatus status)
    {
        var course = await CourseTestData.CreateAsync(factory);
        await factory.QueryAsync(async db =>
        {
            await db.Classes.Where(c => c.ClassId == course.Id).ExecuteUpdateAsync(s => s.SetProperty(c => c.Status, status));
            return 0;
        });
        using var manager = factory.CreateApiClient(course.ManagerId, UserRole.CenterManager);
        var preview = await Json(await manager.GetAsync($"api/manager/classes/{course.Id}/cancellation-preview"));
        Assert.False(preview.GetProperty("canCancel").GetBoolean());
        Assert.Equal("class_closed", preview.GetProperty("blockedReason").GetString());
    }

    [Theory]
    [InlineData("negative")]
    [InlineData("over")]
    [InlineData("fraction")]
    [InlineData("text")]
    [InlineData("null")]
    [InlineData("missing_points")]
    [InlineData("missing_member")]
    [InlineData("duplicate_member")]
    [InlineData("wrong_member")]
    public async Task Invalid_manual_refunds_do_not_cancel_or_credit_anything(string scenario)
    {
        var course = await CourseTestData.CreateAsync(factory);
        await BuyAsync(course.Id);
        using var manager = factory.CreateApiClient(course.ManagerId, UserRole.CenterManager);
        var preview = await Json(await manager.GetAsync($"api/manager/classes/{course.Id}/cancellation-preview"));
        var id = preview.GetProperty("members")[0].GetProperty("enrollmentId").GetGuid();
        object? points = scenario switch
        {
            "negative" => -1, "over" => 101, "fraction" => 1.5m, "text" => "abc", "null" => null, _ => 25
        };
        var row = new Dictionary<string, object?> { ["enrollmentId"] = scenario == "wrong_member" ? Guid.NewGuid() : id,
            ["points"] = points };
        if (scenario == "missing_points") row.Remove("points");
        var decisions = new List<Dictionary<string, object?>> { row };
        if (scenario == "missing_member") decisions.Clear();
        if (scenario == "duplicate_member") decisions.Add(row);
        var ledgerBefore = await factory.QueryAsync(db => db.PointLedgerEntries.CountAsync());
        var response = await manager.PostAsJsonAsync($"api/manager/classes/{course.Id}/cancel", new
        {
            reason = "Reject invalid refund", previewToken = preview.GetProperty("previewToken").GetString(), refunds = decisions
        });
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal(ClassStatus.Published, await factory.QueryAsync(db => db.Classes.Where(c => c.ClassId == course.Id)
            .Select(c => c.Status).SingleAsync()));
        Assert.Equal(EnrollmentStatus.Confirmed, await factory.QueryAsync(db => db.Enrollments.Where(e => e.EnrollmentId == id)
            .Select(e => e.Status).SingleAsync()));
        Assert.Equal(ledgerBefore, await factory.QueryAsync(db => db.PointLedgerEntries.CountAsync()));
        Assert.All(await CourseTestData.SessionsAsync(factory, course.Id), s => Assert.Equal(ClassSessionStatus.Scheduled, s.Status));
    }

    [Fact]
    public async Task Manager_records_different_refunds_per_member_including_zero()
    {
        var course = await CourseTestData.CreateAsync(factory);
        var first = await BuyAsync(course.Id);
        var second = await BuyAsync(course.Id);
        using var manager = factory.CreateApiClient(course.ManagerId, UserRole.CenterManager);
        var preview = await Json(await manager.GetAsync($"api/manager/classes/{course.Id}/cancellation-preview"));
        var decisions = preview.GetProperty("members").EnumerateArray().Select(m => new
        {
            enrollmentId = m.GetProperty("enrollmentId").GetGuid(),
            points = m.GetProperty("memberId").GetGuid() == first ? 37 : 0
        }).ToArray();
        var response = await manager.PostAsJsonAsync($"api/manager/classes/{course.Id}/cancel", new
        {
            reason = "Custom refunds per member", previewToken = preview.GetProperty("previewToken").GetString(), refunds = decisions
        });
        Assert.True(response.IsSuccessStatusCode, await response.Content.ReadAsStringAsync());
        using var scope = factory.Services.CreateScope();
        var service = scope.ServiceProvider.GetRequiredService<ICenterCancellationRefundService>();
        var offer = Assert.Single(await service.ListMineAsync(first));
        Assert.Equal(37, offer.RefundPoints);
        Assert.Empty(await service.ListMineAsync(second));
        Assert.Equal(37, (await service.ChoosePointsAsync(first, offer.InvoiceItemId)).PointsCredited);
        var db = scope.ServiceProvider.GetRequiredService<SportHubDbContext>();
        Assert.False(db.Database.HasPendingModelChanges());
        var stored = await db.Enrollments.AsNoTracking().Where(e => e.ClassId == course.Id).ToListAsync();
        Assert.Equal(37, stored.Single(e => e.MemberId == first).CenterCancellationRefundPoints);
        Assert.Equal(0, stored.Single(e => e.MemberId == second).CenterCancellationRefundPoints);
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
        Assert.Equal("class_cancellation_changed", (await Json(response)).GetProperty("error").GetString());
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
        var request = new { reason = "Minimum enrollment was not reached", previewToken = preview.GetProperty("previewToken").GetString(),
            refunds = RefundDecisions(preview) };
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
            Assert.Equal("class_cancellation_changed", (await Json(cancelled)).GetProperty("error").GetString());
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
        Assert.True(preview.GetProperty("canCancel").GetBoolean());
        Assert.True(preview.GetProperty("refundsImmediately").GetBoolean());
        var response = await manager.PostAsJsonAsync($"api/manager/classes/{course.Id}/cancel", new {
            reason = "Opening enrollment remains below threshold", previewToken = preview.GetProperty("previewToken").GetString(),
            refunds = RefundDecisions(preview)
        });
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal(ClassStatus.Cancelled,
            await factory.QueryAsync(db => db.Classes.Where(c => c.ClassId == course.Id).Select(c => c.Status).SingleAsync()));
        // Cancelling only notifies; points are credited when the Member chooses them.
        Assert.Equal(0,
            await factory.QueryAsync(db => db.PointWallets.Where(w => w.OwnerUserId == member).Select(w => w.AvailablePoints).SingleAsync()));
        if (deadlineReached)
            Assert.True(await factory.QueryAsync(db => db.Notifications.AnyAsync(n => n.UserId == member
                && n.SourceEventType == NotificationSourceEventType.ClassCancelled)));
    }
}
