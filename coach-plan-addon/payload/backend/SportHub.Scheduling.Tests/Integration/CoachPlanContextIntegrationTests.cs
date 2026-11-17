using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using System.Security.Claims;
using SportHub.API.Persistence;
using SportHub.AI.Api;
using SportHub.AI.Application.Services.CoachPlanning;
using SportHub.AI.Infrastructure.Python;
using SportHub.BuildingBlocks.SharedKernel.Time;
using SportHub.Identity.Domain.Enums;
using SportHub.Membership.Domain.Entities;
using SportHub.Membership.Domain.Enums;
using SportHub.Scheduling.Application.Services;
using SportHub.Scheduling.Domain.Entities;
using SportHub.Scheduling.Domain.Enums;

namespace SportHub.Scheduling.Tests.Integration;

[Collection(nameof(SchedulingApiCollection))]
public sealed class CoachPlanContextIntegrationTests(SchedulingApiFactory factory)
{
    [Fact]
    public async Task Real_database_scope_and_review_context_are_correct_without_external_Gemini_calls()
    {
        var course = await CourseTestData.CreateAsync(factory, capacity: 4);
        var selected = await factory.SeedUserAsync(UserRole.Member);
        var other = await factory.SeedUserAsync(UserRole.Member);
        var outsider = await factory.SeedUserAsync(UserRole.Member);
        var ended = await factory.SeedUserAsync(UserRole.Member);
        var enrolled = await CourseTestData.EnrollmentAsync(factory, course.Id, selected.UserId);
        var otherEnrollment = await CourseTestData.EnrollmentAsync(factory, course.Id, other.UserId);
        var endedEnrollment = await CourseTestData.EnrollmentAsync(factory, course.Id, ended.UserId);
        var sessions = await CourseTestData.SessionsAsync(factory, course.Id);
        var past = sessions[0];
        var future = sessions[1];
        var now = DateTime.UtcNow;
        await factory.QueryAsync(async db =>
        {
            var s = await db.ClassSessions.SingleAsync(x => x.SessionId == past.SessionId);
            s.StartAtUtc = now.AddDays(-2); s.EndAtUtc = s.StartAtUtc.AddHours(1); s.Status = ClassSessionStatus.Completed;
            foreach (var occupancy in await db.RoomOccupancies.Where(o => o.SourceId == s.SessionId).ToListAsync())
                { occupancy.StartAtUtc = s.StartAtUtc; occupancy.EndAtUtc = s.EndAtUtc; }
            foreach (var occupancy in await db.CoachOccupancies.Where(o => o.SourceId == s.SessionId).ToListAsync())
                { occupancy.StartAtUtc = s.StartAtUtc; occupancy.EndAtUtc = s.EndAtUtc; }
            var enrollment = await db.Enrollments.SingleAsync(x => x.EnrollmentId == endedEnrollment);
            enrollment.Status = EnrollmentStatus.TransferredOut; enrollment.EndedAt = now.AddDays(-1);
            db.Set<MemberTrainingProfile>().AddRange(
                new MemberTrainingProfile { ProfileId = Guid.NewGuid(), MemberId = selected.UserId, Goal = "Improve smash", Notes = "No jumping", ExperienceLevel = ExperienceLevel.Beginner, UpdatedAt = now.AddDays(-3) },
                new MemberTrainingProfile { ProfileId = Guid.NewGuid(), MemberId = other.UserId, Goal = "OTHER_PRIVATE_GOAL", Notes = "OTHER_RESTRICTION", ExperienceLevel = ExperienceLevel.Advanced, UpdatedAt = now.AddDays(-3) },
                new MemberTrainingProfile { ProfileId = Guid.NewGuid(), MemberId = outsider.UserId, Goal = "OUTSIDE_PROFILE", Notes = "OUTSIDE_RESTRICTION", ExperienceLevel = ExperienceLevel.Advanced, UpdatedAt = now.AddDays(-3) },
                new MemberTrainingProfile { ProfileId = Guid.NewGuid(), MemberId = ended.UserId, Goal = "ENDED_PROFILE", Notes = "ENDED_RESTRICTION", ExperienceLevel = ExperienceLevel.Advanced, UpdatedAt = now.AddDays(-3) });
            db.Set<Attendance>().AddRange(new Attendance { AttendanceId = Guid.NewGuid(), SessionId = s.SessionId, EnrollmentId = enrolled,
                Status = AttendanceStatus.Present, RecordedByUserId = course.CoachId, RecordedAt = now.AddDays(-2) },
                new Attendance { AttendanceId = Guid.NewGuid(), SessionId = s.SessionId, EnrollmentId = otherEnrollment,
                    Status = AttendanceStatus.Absent, RecordedByUserId = course.CoachId, RecordedAt = now.AddDays(-2) });
            ClassTeachingRecord Record(string kind, string content, Guid? member, Guid session, int? score = null) => new()
            {
                RecordId = Guid.NewGuid(), ClassId = course.Id, CoachId = course.CoachId, Kind = kind, Title = kind == "PLAN" ? "Previously planned footwork" : "Assessment",
                Content = content, MemberId = member, SessionId = session, Score = score, Version = 1,
                CreatedAtUtc = now.AddDays(-1), UpdatedAtUtc = now.AddDays(-1)
            };
            db.Set<ClassTeachingRecord>().AddRange(
                Record("RESULT", "Smash contact needs practice", selected.UserId, s.SessionId, 4),
                Record("RESULT", "ABSENT_RESULT", other.UserId, s.SessionId, 1),
                Record("PLAN", "Footwork · 2 sets × 10 reps", null, s.SessionId),
                Record("PLAN", "OTHER_PERSONAL_PLAN", other.UserId, s.SessionId),
                Record("RESULT", "FUTURE_RESULT", selected.UserId, future.SessionId, 5));
            await db.SaveChangesAsync(); return true;
        });
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SportHubDbContext>();
        var cls = await db.Classes.AsNoTracking().Include(c => c.Sport).SingleAsync(c => c.ClassId == course.Id);
        var reader = new CoachPlanContextReader(db);
        var sessionSnapshot = await reader.ReadAsync(cls, course.CoachId, null, future, now, default);
        Assert.Equal(2, sessionSnapshot.StudentCount);
        Assert.Equal(1, sessionSnapshot.Attendance.Present);
        Assert.Equal(1, sessionSnapshot.Attendance.Absent);
        Assert.Equal(1, sessionSnapshot.CurrentProgress.Count);
        Assert.Equal(4d, sessionSnapshot.CurrentProgress.Average);
        var sessionJson = SessionPlanContextBuilder.Build(sessionSnapshot, "Improve smash", "Improve smash", "Beginner");
        Assert.Contains("No jumping", sessionJson);
        Assert.Contains("OTHER_RESTRICTION", sessionJson); // authorized anonymous cohort restriction
        foreach (var secret in new[] { "OTHER_PRIVATE_GOAL", "OTHER_PERSONAL_PLAN", "OUTSIDE_RESTRICTION", "ENDED_RESTRICTION", "FUTURE_RESULT", "ABSENT_RESULT", selected.UserId.ToString(), other.UserId.ToString() })
            Assert.DoesNotContain(secret, sessionJson);
        var personal = await reader.ReadAsync(cls, course.CoachId, selected.UserId, future, now, default);
        var personalJson = PersonalPlanContextBuilder.Build(personal, "Improve smash", "Improve smash", "Beginner");
        Assert.Equal(1, personal.StudentCount);
        Assert.Contains("Smash contact needs practice", personalJson);
        Assert.DoesNotContain("OTHER_RESTRICTION", personalJson);
        Assert.DoesNotContain("OTHER_PERSONAL_PLAN", personalJson);
        await Assert.ThrowsAsync<SportHub.BuildingBlocks.SharedKernel.Errors.ForbiddenException>(() => reader.ReadAsync(cls, course.CoachId, outsider.UserId, future, now, default));
        // Exercise real controller/provider serialization, but inject a deterministic HTTP stub. No upstream calls or plan writes.
        using var fake = new PlanGatewayStub();
        using var http = new HttpClient(fake) { BaseAddress = new Uri("http://coach-plan-stub.invalid") };
        var controller = new ClassTeachingAiController(scope.ServiceProvider.GetRequiredService<ClassTeachingService>(), db,
            new PythonCoachPlanProvider(new LocalFactory(http)), scope.ServiceProvider.GetRequiredService<IClock>(), NullLogger<ClassTeachingAiController>.Instance)
        {
            ControllerContext = new ControllerContext { HttpContext = new DefaultHttpContext { User = new ClaimsPrincipal(new ClaimsIdentity(
                new[] { new Claim(ClaimTypes.NameIdentifier, course.CoachId.ToString()), new Claim(ClaimTypes.Role, "Coach") }, "test")) } }
        };
        var count = await db.Set<ClassTeachingRecord>().CountAsync();
        Assert.IsType<OkObjectResult>(await controller.Suggest(course.Id, new ClassSuggestionRequest(selected.UserId, "Improve smash", "Beginner", "en", "personal", future.SessionId), default));
        Assert.Equal(3, fake.Contexts.Count);
        var generated = PlanContextBudget.Element(fake.Contexts[1]);
        var review = PlanContextBudget.Element(fake.Contexts[2]).GetProperty("context");
        Assert.Equal(generated.GetRawText(), review.GetRawText());
        Assert.Equal(future.SessionNo, generated.GetProperty("targetSession").GetProperty("sessionNo").GetInt32());
        Assert.Contains("No jumping", review.GetRawText());
        Assert.DoesNotContain("OTHER_RESTRICTION", review.GetRawText());
        Assert.Equal(count, await db.Set<ClassTeachingRecord>().CountAsync());
        // Negative calls use HTTP endpoint / authorization middleware, all rejected before Gemini.
        using var coach = factory.CreateApiClient(course.CoachId, UserRole.Coach);
        var path = $"api/coaches/me/teaching/classes/{course.Id}/suggestion";
        var wrongScope = await coach.PostAsJsonAsync(path, new { scope = "session", sessionId = future.SessionId, memberId = selected.UserId, goal = "Improve smash", level = "Beginner", language = "en" });
        Assert.Equal(HttpStatusCode.BadRequest, wrongScope.StatusCode);
        var pastPersonal = await coach.PostAsJsonAsync(path, new { scope = "personal", sessionId = past.SessionId, memberId = selected.UserId, goal = "Improve smash", level = "Beginner", language = "en" });
        Assert.Equal(HttpStatusCode.Conflict, pastPersonal.StatusCode);
        var outside = await coach.PostAsJsonAsync(path, new { scope = "personal", memberId = outsider.UserId, goal = "Improve smash", level = "Beginner", language = "en" });
        Assert.Equal(HttpStatusCode.Forbidden, outside.StatusCode);
    }

    private sealed class LocalFactory(HttpClient client) : IHttpClientFactory
    {
        public HttpClient CreateClient(string name) => client;
    }
    private sealed class PlanGatewayStub : HttpMessageHandler
    {
        public List<string> Contexts { get; } = [];
        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            Assert.Equal("/coach/plan", request.RequestUri!.AbsolutePath);
            using var doc = JsonDocument.Parse(await request.Content!.ReadAsStringAsync(cancellationToken));
            Contexts.Add(doc.RootElement.GetProperty("context").GetString()!);
            var answer = Contexts.Count switch
            {
                1 => "{\"status\":\"VALID\",\"reason\":\"Sport related\",\"normalizedGoal\":\"Improve smash\"}",
                2 => "Warm-up · 2 sets × 10 reps of seated mobility.\nGrip · 2 sets × 10 reps of grip practice.\nTechnique · 3 sets × 10 reps of controlled standing swings without jumping.\nCool-down · 1 set × 5 reps of gentle stretching.",
                3 => "{\"status\":\"PASS\",\"reason\":\"Consistent\"}",
                _ => throw new InvalidOperationException("Unexpected model call")
            };
            return new HttpResponseMessage(HttpStatusCode.OK) { Content = JsonContent.Create(new { interactionId = "stub", answer, provider = "TEST ONLY", model = "stub" }) };
        }
    }
}
