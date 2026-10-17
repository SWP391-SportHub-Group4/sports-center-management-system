using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SportHub.API.Persistence;
using SportHub.AI.Application.Services;
using SportHub.BuildingBlocks.Abstractions.Wallet;
using SportHub.Identity.Domain.Enums;
using SportHub.Membership.Domain.Entities;
using SportHub.Notification.Domain.Enums;
using SportHub.Payment.Application.Services;
using SportHub.Payment.Wallet.Application;
using SportHub.Scheduling.Application.Interfaces;
using SportHub.Scheduling.Application.Services;
using SportHub.Scheduling.Domain.Entities;
using SportHub.Scheduling.Domain.Enums;
using SportHub.Scheduling.Threshold.Application;
using SportHub.Scheduling.Threshold.Domain;

namespace SportHub.Scheduling.Tests.Integration;

[Collection(nameof(SchedulingApiCollection))]
public sealed class MemberExperienceTests(SchedulingApiFactory factory)
{
    private sealed class RecordingChatProvider : SportHub.AI.Application.Interfaces.IAiChatProvider
    {
        public List<string?> Continuations { get; } = [];
        public Task<SportHub.AI.Application.DTOs.Chat.AiProviderResponse> AskAsync(string systemPrompt, string context,
            string question, string? previousInteractionId = null, CancellationToken cancellationToken = default)
        {
            Continuations.Add(previousInteractionId);
            return Task.FromResult(new SportHub.AI.Application.DTOs.Chat.AiProviderResponse(Guid.NewGuid().ToString(), "Training advice", "Test", "Test"));
        }
    }

    [Fact]
    public async Task Chat_continuation_requires_the_same_member_and_current_enrollment_scope()
    {
        var c = await CourseTestData.CreateAsync(factory);
        var member = await factory.SeedUserAsync(UserRole.Member);
        var stranger = await factory.SeedUserAsync(UserRole.Member);
        await CourseTestData.EnrollmentAsync(factory, c.Id, member.UserId);
        var provider = new RecordingChatProvider();
        async Task<string> Ask(Guid userId, string? previous = null) {
            using var scope = factory.Services.CreateScope();
            var service = ActivatorUtilities.CreateInstance<AiChatService>(scope.ServiceProvider, provider);
            return (await service.AskAsync(userId, "What should I focus on?", previous)).InteractionId;
        }
        var first = await Ask(member.UserId);
        var second = await Ask(member.UserId, first);
        Assert.Equal(first, provider.Continuations.Last());
        await Ask(stranger.UserId, first);
        Assert.Null(provider.Continuations.Last());
        await factory.QueryAsync(async db => {
            await db.Classes.Where(x => x.ClassId == c.Id).ExecuteUpdateAsync(u => u.SetProperty(x => x.Status, ClassStatus.Completed));
            db.AiLogs.Add(new SportHub.AI.Domain.Entities.AiLog { LogId = Guid.NewGuid(), UserId = member.UserId,
                QueryType = SportHub.AI.Domain.Constants.AiQueryTypes.Chat, InputPayload = "[]", ResponsePayload = "[]", CreatedAt = DateTime.UtcNow });
            await db.SaveChangesAsync(); return 0;
        });
        await Ask(member.UserId, second);
        Assert.Null(provider.Continuations.Last());
    }

    private async Task<(CourseData Course, Guid MemberId, Guid InvoiceId, ThresholdResponse Response)> PaidAtRiskAsync()
    {
        var c = await CourseTestData.CreateAsync(factory);
        var member = await factory.SeedUserAsync(UserRole.Member);
        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<SportHubDbContext>();
            await db.Classes.Where(x => x.ClassId == c.Id).ExecuteUpdateAsync(u => u
                .SetProperty(x => x.CostAmount, 200_000m).SetProperty(x => x.BreakEvenThreshold, 2)
                .SetProperty(x => x.ThresholdDeadlineUtc, DateTime.UtcNow.AddMinutes(-1)));
            await using (var tx = await db.Database.BeginTransactionAsync())
            {
                await scope.ServiceProvider.GetRequiredService<IPointWalletService>().EarnAsync(new(member.UserId, 100, "TestCredit", Guid.NewGuid()));
                await tx.CommitAsync();
            }
            var checkout = await scope.ServiceProvider.GetRequiredService<CheckoutService>()
                .CreateClassAsync(new(c.Id, null), Guid.NewGuid().ToString(), member.UserId, false, default);
            await scope.ServiceProvider.GetRequiredService<PointConfirmationService>().SelectSelfAsync(checkout.InvoiceId, 100, member.UserId, default);
            await scope.ServiceProvider.GetRequiredService<CheckoutService>().StartPaymentAsync(checkout.InvoiceId, member.UserId, false, "127.0.0.1", default);
            await scope.ServiceProvider.GetRequiredService<IClassThresholdService>().EvaluateDueAsync();
            var response = await db.Set<ThresholdResponse>().AsNoTracking().SingleAsync(r => r.ClassId == c.Id && r.MemberId == member.UserId);
            return (c, member.UserId, checkout.InvoiceId, response);
        }
    }

    [Fact]
    public async Task Waiting_refunds_once_and_only_linked_open_cohorts_notify_then_member_can_unsubscribe()
    {
        var p = await PaidAtRiskAsync();
        using var member = factory.CreateApiClient(p.MemberId, UserRole.Member);
        using var stranger = factory.CreateApiClient((await factory.SeedUserAsync(UserRole.Member)).UserId, UserRole.Member);
        var endpoint = $"/api/class-threshold-responses/{p.Response.ThresholdResponseId}";
        for (var n = 0; n < 2; n++) {
            var response = await member.PostAsJsonAsync(endpoint, new { choice = "WAIT_NEXT_COURSE" });
            Assert.True(response.IsSuccessStatusCode, await response.Content.ReadAsStringAsync());
        }
        var interest = await factory.QueryAsync(db => db.Set<CourseInterest>().SingleAsync(i => i.MemberId == p.MemberId));
        Assert.Equal(100, interest.RefundedPoints);
        Assert.Equal(100, await factory.QueryAsync(db => db.PointWallets.Where(w => w.OwnerUserId == p.MemberId).Select(w => w.AvailablePoints).SingleAsync()));
        Assert.False(await factory.QueryAsync(db => db.Enrollments.AnyAsync(e => e.MemberId == p.MemberId && e.Status == EnrollmentStatus.Confirmed)));
        Assert.Equal(HttpStatusCode.Forbidden, (await member.GetAsync($"/api/members/me/classes/{p.Course.Id}/teaching-records")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await stranger.DeleteAsync($"/api/members/me/course-interests/{interest.InterestId}")).StatusCode);

        var next = await CourseTestData.CreateAsync(factory, publish: false);
        next.Request.ContinuationOfClassId = p.Course.Id;
        using (var scope = factory.Services.CreateScope()) {
            var classes = scope.ServiceProvider.GetRequiredService<IClassService>();
            await classes.UpdateAsync(next.Id, next.Request, next.ManagerId);
            await classes.PublishAsync(next.Id, new(), next.ManagerId);
        }
        async Task RunWorker() { using var scope = factory.Services.CreateScope(); await scope.ServiceProvider.GetRequiredService<CourseInterestService>().NotifyOpenClassesAsync(); }
        await RunWorker();
        Assert.False(await factory.QueryAsync(db => db.Set<CourseInterestDelivery>().AnyAsync(d => d.InterestId == interest.InterestId)));
        using (var scope = factory.Services.CreateScope())
            await scope.ServiceProvider.GetRequiredService<IClassService>().SetEnrollmentOpenAsync(next.Id, true, next.ManagerId);
        await RunWorker(); await RunWorker();
        var delivery = await factory.QueryAsync(db => db.Set<CourseInterestDelivery>().SingleAsync(d => d.InterestId == interest.InterestId));
        Assert.Equal(next.Id, delivery.ClassId);
        Assert.Equal(2, await factory.QueryAsync(db => db.Notifications.CountAsync(n => n.SourceEntityId == delivery.DeliveryId)));
        Assert.Empty(await stranger.GetFromJsonAsync<JsonElement[]>("/api/members/me/course-interests") ?? []);
        var notices = await member.GetAsync("/api/notifications");
        Assert.True(notices.IsSuccessStatusCode, await notices.Content.ReadAsStringAsync());
        Assert.Contains($"course={next.Id}", await notices.Content.ReadAsStringAsync());
        Assert.Equal(HttpStatusCode.NoContent, (await member.DeleteAsync($"/api/members/me/course-interests/{interest.InterestId}")).StatusCode);
        // Reopening another linked class must not notify a cancelled subscription.
        var another = await CourseTestData.CreateAsync(factory);
        await factory.QueryAsync(async db => { await db.Classes.Where(c => c.ClassId == another.Id).ExecuteUpdateAsync(u => u
            .SetProperty(c => c.ContinuationOfClassId, p.Course.Id).SetProperty(c => c.EnrollmentOpen, true)); return 0; });
        await RunWorker();
        Assert.Equal(1, await factory.QueryAsync(db => db.Set<CourseInterestDelivery>().CountAsync(d => d.InterestId == interest.InterestId)));
    }

    [Fact]
    public async Task Member_can_download_own_invoice_pdf_but_not_another_members_invoice()
    {
        var p = await PaidAtRiskAsync();
        using var member = factory.CreateApiClient(p.MemberId, UserRole.Member);
        using var stranger = factory.CreateApiClient((await factory.SeedUserAsync(UserRole.Member)).UserId, UserRole.Member);
        var path = $"/api/invoices/{p.InvoiceId}/receipt.pdf";
        var pdf = await member.GetAsync(path);
        Assert.True(pdf.IsSuccessStatusCode, await pdf.Content.ReadAsStringAsync());
        Assert.Equal("application/pdf", pdf.Content.Headers.ContentType?.MediaType);
        Assert.StartsWith("%PDF", System.Text.Encoding.ASCII.GetString((await pdf.Content.ReadAsByteArrayAsync())[..4]));
        Assert.Equal(HttpStatusCode.Forbidden, (await stranger.GetAsync(path)).StatusCode);
    }

    [Theory]
    [InlineData("withdrawn")]
    [InlineData("ended_enrollment")]
    [InlineData("cancelled")]
    [InlineData("completed")]
    [InlineData("last_lesson_ended")]
    public async Task Class_content_follows_current_enrollment_and_allows_completed_history(string reason)
    {
        var c = await CourseTestData.CreateAsync(factory);
        var member = await factory.SeedUserAsync(UserRole.Member);
        var enrollment = await CourseTestData.EnrollmentAsync(factory, c.Id, member.UserId);
        using var client = factory.CreateApiClient(member.UserId, UserRole.Member);
        var records = $"/api/members/me/classes/{c.Id}/teaching-records";
        var sessions = $"/api/members/me/classes/{c.Id}/sessions";
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync(records)).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync(sessions)).StatusCode);
        await factory.QueryAsync(async db => {
            if (reason == "withdrawn") await db.Enrollments.Where(e => e.EnrollmentId == enrollment).ExecuteUpdateAsync(u => u
                .SetProperty(e => e.Status, EnrollmentStatus.Refunded).SetProperty(e => e.EndedAt, DateTime.UtcNow));
            else if (reason == "ended_enrollment") await db.Enrollments.Where(e => e.EnrollmentId == enrollment).ExecuteUpdateAsync(u => u.SetProperty(e => e.EndedAt, DateTime.UtcNow));
            else if (reason == "cancelled") await db.Classes.Where(x => x.ClassId == c.Id).ExecuteUpdateAsync(u => u.SetProperty(x => x.Status, ClassStatus.Cancelled));
            else if (reason == "completed") await db.Classes.Where(x => x.ClassId == c.Id).ExecuteUpdateAsync(u => u.SetProperty(x => x.Status, ClassStatus.Completed));
            else await db.ClassSessions.Where(s => s.ClassId == c.Id).ExecuteUpdateAsync(u => u
                .SetProperty(s => s.StartAtUtc, DateTime.UtcNow.AddDays(-2)).SetProperty(s => s.EndAtUtc, DateTime.UtcNow.AddDays(-1)));
            return 0;
        });
        var expected = reason is "completed" or "last_lesson_ended" ? HttpStatusCode.OK : HttpStatusCode.Forbidden;
        Assert.Equal(expected, (await client.GetAsync(records)).StatusCode);
        Assert.Equal(expected, (await client.GetAsync(sessions)).StatusCode);
    }

    [Fact]
    public async Task Reminders_are_once_per_window_and_new_timetable_skips_cancelled_or_former_members()
    {
        var c = await CourseTestData.CreateAsync(factory);
        var member = await factory.SeedUserAsync(UserRole.Member);
        var former = await factory.SeedUserAsync(UserRole.Member);
        await CourseTestData.EnrollmentAsync(factory, c.Id, member.UserId);
        var removed = await CourseTestData.EnrollmentAsync(factory, c.Id, former.UserId);
        await factory.QueryAsync(async db => { await db.Enrollments.Where(e => e.EnrollmentId == removed).ExecuteUpdateAsync(u => u.SetProperty(e => e.Status, EnrollmentStatus.Refunded)); return 0; });
        var s = (await CourseTestData.SessionsAsync(factory, c.Id))[0];
        async Task RunAt(DateTime now) { using var scope = factory.Services.CreateScope(); await ActivatorUtilities.CreateInstance<ClassSessionReminderService>(scope.ServiceProvider, new TestClock(now)).RunAsync(); }
        await RunAt(s.StartAtUtc.AddHours(-24)); await RunAt(s.StartAtUtc.AddHours(-24));
        await RunAt(s.StartAtUtc.AddMinutes(-59));
        Assert.Equal(2, await factory.QueryAsync(db => db.Set<ClassSessionReminder>().CountAsync(r => r.SessionId == s.SessionId && r.MemberId == member.UserId)));
        Assert.False(await factory.QueryAsync(db => db.Set<ClassSessionReminder>().AnyAsync(r => r.MemberId == former.UserId)));
        using var manager = factory.CreateApiClient(c.ManagerId, UserRole.CenterManager);
        var changed = await manager.PostAsJsonAsync($"/api/class-sessions/{s.SessionId}/reschedule", new { startAtUtc = s.StartAtUtc.AddHours(2), reason = "Room timing changed" });
        Assert.True(changed.IsSuccessStatusCode, await changed.Content.ReadAsStringAsync());
        await RunAt(s.StartAtUtc.AddHours(-22));
        Assert.Equal(3, await factory.QueryAsync(db => db.Set<ClassSessionReminder>().CountAsync(r => r.SessionId == s.SessionId && r.MemberId == member.UserId)));
        await factory.QueryAsync(async db => { await db.ClassSessions.Where(x => x.SessionId == s.SessionId).ExecuteUpdateAsync(u => u.SetProperty(x => x.Status, ClassSessionStatus.Cancelled)); return 0; });
        await RunAt(s.StartAtUtc.AddHours(1.5));
        Assert.Equal(3, await factory.QueryAsync(db => db.Set<ClassSessionReminder>().CountAsync(r => r.SessionId == s.SessionId && r.MemberId == member.UserId)));
    }

    [Fact]
    public async Task Ai_context_uses_health_and_shared_or_own_records_and_excludes_other_students_and_ended_classes()
    {
        var c = await CourseTestData.CreateAsync(factory);
        var ended = await CourseTestData.CreateAsync(factory);
        var member = await factory.SeedUserAsync(UserRole.Member);
        var other = await factory.SeedUserAsync(UserRole.Member);
        await CourseTestData.EnrollmentAsync(factory, c.Id, member.UserId);
        await CourseTestData.EnrollmentAsync(factory, ended.Id, member.UserId);
        var first = (await CourseTestData.SessionsAsync(factory, c.Id))[0];
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SportHubDbContext>();
        db.MemberTrainingProfiles.Add(new MemberTrainingProfile { ProfileId = Guid.NewGuid(), MemberId = member.UserId,
            Goal = "Improve badminton footwork", HeightCm = 175, WeightKg = 70, Notes = "Avoid high impact jumps", UpdatedAt = DateTime.UtcNow });
        foreach (var (classId, memberId, title, kind) in new[] {
            (c.Id, (Guid?)null, "Shared lesson plan", "PLAN"), (c.Id, (Guid?)member.UserId, "My coach feedback", "RESULT"),
            (c.Id, (Guid?)other.UserId, "Other student private feedback", "RESULT"), (ended.Id, (Guid?)null, "Ended course material", "PLAN") })
            db.Set<ClassTeachingRecord>().Add(new ClassTeachingRecord { RecordId = Guid.NewGuid(), ClassId = classId, MemberId = memberId,
                CoachId = c.CoachId, SessionId = kind == "RESULT" ? first.SessionId : null, Kind = kind, Title = title, Content = "Training guidance", CreatedAtUtc = DateTime.UtcNow, UpdatedAtUtc = DateTime.UtcNow });
        await db.Classes.Where(x => x.ClassId == ended.Id).ExecuteUpdateAsync(u => u.SetProperty(x => x.Status, ClassStatus.Completed));
        await db.SaveChangesAsync();
        var context = await ActivatorUtilities.CreateInstance<SportHubAiContextBuilder>(scope.ServiceProvider, new TestClock(first.StartAtUtc.AddDays(-2)))
            .BuildAsync(member.UserId, "How should I train?");
        Assert.Contains("Avoid high impact jumps", context);
        Assert.Contains("Shared lesson plan", context);
        Assert.Contains("My coach feedback", context);
        Assert.DoesNotContain("Other student private feedback", context);
        Assert.DoesNotContain("Ended course material", context);
        using var json = JsonDocument.Parse(context);
        Assert.Equal(2, json.RootElement.GetProperty("upcomingClassSessions").GetArrayLength()); // Only the first two weekly lessons fall inside the 14-day context window.
    }
}
