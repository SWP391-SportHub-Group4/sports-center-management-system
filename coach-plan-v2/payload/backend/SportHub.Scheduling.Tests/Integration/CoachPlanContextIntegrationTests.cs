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
        Assert.Equal(2, fake.Contexts.Count);
        using var generation = JsonDocument.Parse(fake.Contexts[0]);
        using var reviewDoc = JsonDocument.Parse(fake.Contexts[1]);
        var generated = generation.RootElement;
        Assert.Equal(3, generated.EnumerateObject().Count());
        Assert.Equal("Improve smash", generated.GetProperty("trainingGoal").GetString());
        Assert.Equal(generated.GetRawText(), reviewDoc.RootElement.GetProperty("context").GetRawText());
        foreach (var value in fake.Contexts)
            foreach (var secret in new[] { "No jumping", "OTHER_RESTRICTION", "OTHER_PRIVATE_GOAL", "OUTSIDE_PROFILE", "ENDED_PROFILE", "Smash contact needs practice", selected.UserId.ToString(), future.SessionId.ToString() })
                Assert.DoesNotContain(secret, value);
        fake.Contexts.Clear();
        Assert.IsType<OkObjectResult>(await controller.Suggest(course.Id, new ClassSuggestionRequest(null, "Improve smash", "Beginner", "en", "session", future.SessionId), default));
        Assert.Equal(generated.GetRawText(), fake.Contexts[0]);
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
                1 => JsonSerializer.Serialize(new { status = "READY", reason = "", content = "Warm-up · 2 sets × 10 reps of shoulder mobility.\nGrip · 2 sets × 10 reps of grip practice.\nTechnique · 3 sets × 10 reps of controlled swings.\nCool-down · 1 set × 5 reps of gentle stretching." }),
                2 => "{\"status\":\"PASS\",\"reason\":\"Consistent\"}",
                _ => throw new InvalidOperationException("Unexpected model call")
            };
            return new HttpResponseMessage(HttpStatusCode.OK) { Content = JsonContent.Create(new { interactionId = "stub", answer, provider = "TEST ONLY", model = "stub" }) };
        }
    }
}
