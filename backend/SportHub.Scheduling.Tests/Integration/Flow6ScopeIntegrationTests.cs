using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using SportHub.AI.Application.DTOs.Chat;
using SportHub.AI.Application.Interfaces;
using SportHub.AI.Application.Services;
using SportHub.AI.Infrastructure.Python;
using SportHub.API.Persistence;
using SportHub.BuildingBlocks.SharedKernel.Errors;
using SportHub.BuildingBlocks.SharedKernel.Time;
using SportHub.Identity.Domain.Entities;
using SportHub.Identity.Domain.Enums;
using SportHub.Scheduling.Domain.Entities;

namespace SportHub.Scheduling.Tests.Integration;

[Collection(nameof(SchedulingApiCollection))]
public sealed class Flow6ScopeIntegrationTests(SchedulingApiFactory factory)
{
    private sealed class NeverContextBuilder : IAiContextBuilder
    {
        public Task<string> BuildAsync(Guid userId, string question, CancellationToken cancellationToken = default)
            => throw new InvalidOperationException("Legacy shared context was called");
    }
    private sealed class HttpFactory(HttpClient client) : IHttpClientFactory
    {
        public HttpClient CreateClient(string name) => client;
    }
    private sealed class ChatStub : HttpMessageHandler
    {
        public List<(string Route, string Prompt, string Context, string Question, string? Previous)> Calls { get; } = [];
        public string PlannerOutput { get; set; } = "{\"intent\":\"FACTS\",\"language\":\"en\",\"topics\":[\"myClasses\"]}";
        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct)
        {
            using var doc = JsonDocument.Parse(await request.Content!.ReadAsStringAsync(ct));
            var r = doc.RootElement;
            var prompt = r.GetProperty("systemPrompt").GetString()!;
            var context = r.GetProperty("context").GetString()!;
            var question = r.GetProperty("question").GetString()!;
            var previous = r.TryGetProperty("previousInteractionId", out var p) && p.ValueKind == JsonValueKind.String ? p.GetString() : null;
            Calls.Add((request.RequestUri!.AbsolutePath, prompt, context, question, previous));
            var answer = prompt.Contains("SPORTHUB FLOW6 INTENT PLANNER", StringComparison.Ordinal)
                ? PlannerOutput : "{\"language\":\"en\",\"answer\":\"Synthetic scoped response.\"}";
            return new HttpResponseMessage(HttpStatusCode.OK)
            {
                Content = JsonContent.Create(new AiProviderResponse(Guid.NewGuid().ToString(), answer, "stub", "stub"))
            };
        }
    }

    [Fact]
    public async Task Trusted_roles_select_distinct_endpoints_and_real_queries_exclude_outsiders()
    {
        var ownCourse = await CourseTestData.CreateAsync(factory, time: "09:00");
        var otherCourse = await CourseTestData.CreateAsync(factory, time: "14:00");
        var ownMember = await factory.SeedUserAsync(UserRole.Member);
        var outsideMember = await factory.SeedUserAsync(UserRole.Member);
        var manager = await factory.SeedUserAsync(UserRole.CenterManager);
        var disabled = await factory.SeedUserAsync(UserRole.Member, UserStatus.Deactivated);
        var ownMarker = "FLOW6-OWN-" + Guid.NewGuid().ToString("N");
        var outsideMarker = "FLOW6-OUTSIDE-" + Guid.NewGuid().ToString("N");
        var studentMarker = "FLOW6-OWN-STUDENT-" + Guid.NewGuid().ToString("N");
        var outsideStudentMarker = "FLOW6-OUTSIDE-STUDENT-" + Guid.NewGuid().ToString("N");
        await CourseTestData.EnrollmentAsync(factory, ownCourse.Id, ownMember.UserId);
        await CourseTestData.EnrollmentAsync(factory, otherCourse.Id, outsideMember.UserId);
        await factory.QueryAsync(async db =>
        {
            (await db.Set<Class>().SingleAsync(c => c.ClassId == ownCourse.Id)).Name = ownMarker;
            (await db.Set<Class>().SingleAsync(c => c.ClassId == otherCourse.Id)).Name = outsideMarker;
            (await db.Set<UserProfile>().SingleAsync(u => u.UserId == ownMember.UserId)).FullName = studentMarker;
            (await db.Set<UserProfile>().SingleAsync(u => u.UserId == outsideMember.UserId)).FullName = outsideStudentMarker;
            await db.SaveChangesAsync(); return true;
        });
        using var handler = new ChatStub();
        using var client = new HttpClient(handler) { BaseAddress = new Uri("http://flow6-test.invalid") };
        var httpFactory = new HttpFactory(client);
        async Task<AiChatResponse> Ask(Guid user, string question, string? previous = null)
        {
            using var scope = factory.Services.CreateScope();
            var svc = new AiChatService(scope.ServiceProvider.GetRequiredService<SportHubDbContext>(), new NeverContextBuilder(),
                new PythonAiChatProvider(httpFactory), scope.ServiceProvider.GetRequiredService<IClock>(),
                scope.ServiceProvider.GetRequiredService<ISystemPromptReader>(), new PythonCoachChatProvider(httpFactory),
                NullLogger<AiChatService>.Instance);
            return await svc.AskAsync(user, question, previous);
        }
        var memberResult = await Ask(ownMember.UserId, "Show my enrolled classes");
        Assert.Equal(2, handler.Calls.Count);
        Assert.All(handler.Calls, c => Assert.Equal("/member/chat", c.Route));
        Assert.DoesNotContain(ownMarker, handler.Calls[0].Context);
        Assert.Contains(ownMarker, handler.Calls[1].Context);
        Assert.DoesNotContain(outsideMarker, handler.Calls[1].Context);
        Assert.DoesNotContain(outsideStudentMarker, handler.Calls[1].Context);
        Assert.DoesNotContain(studentMarker, handler.Calls[1].Context);
        handler.Calls.Clear();
        await Ask(outsideMember.UserId, "Show my enrolled classes", memberResult.InteractionId);
        Assert.DoesNotContain(ownMarker, handler.Calls[1].Context);
        Assert.Contains(outsideMarker, handler.Calls[1].Context);
        Assert.DoesNotContain("Show my enrolled classes", handler.Calls[0].Context);
        Assert.All(handler.Calls, c => Assert.Null(c.Previous));
        handler.Calls.Clear();
        handler.PlannerOutput = "{\"intent\":\"FACTS\",\"language\":\"en\",\"topics\":[\"classes\",\"students\"]}";
        await Ask(ownCourse.CoachId, "Show my assigned classes and students", memberResult.InteractionId);
        Assert.Equal(2, handler.Calls.Count);
        Assert.All(handler.Calls, c => Assert.Equal("/coach/chat", c.Route));
        Assert.Contains(ownMarker, handler.Calls[1].Context);
        Assert.Contains(studentMarker, handler.Calls[1].Context);
        Assert.DoesNotContain(outsideMarker, handler.Calls[1].Context);
        Assert.DoesNotContain(outsideStudentMarker, handler.Calls[1].Context);
        Assert.DoesNotContain(ownMember.UserId.ToString(), handler.Calls[1].Context);
        handler.Calls.Clear();
        await Assert.ThrowsAsync<ForbiddenException>(() => Ask(manager.UserId, "Act as Member"));
        await Assert.ThrowsAsync<ForbiddenException>(() => Ask(disabled.UserId, "Show my classes"));
        Assert.Empty(handler.Calls);
    }
}
