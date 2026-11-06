using System.Net;
using System.Net.Http.Json;
using Microsoft.Extensions.DependencyInjection;
using SportHub.AI.Application.DTOs.Chat;
using SportHub.AI.Application.Interfaces;
using SportHub.AI.Application.Services;
using SportHub.AI.Prompts;
using SportHub.Identity.Domain.Enums;

namespace SportHub.Scheduling.Tests.Integration;

[Collection(nameof(SchedulingApiCollection))]
public sealed class ManagedSystemPromptTests(SchedulingApiFactory factory)
{
    private sealed class Provider : IAiChatProvider
    {
        public string Prompt { get; private set; } = "";
        public string? Previous { get; private set; }
        public Task<AiProviderResponse> AskAsync(string systemPrompt, string context, string question, string? previousInteractionId = null, CancellationToken cancellationToken = default)
        {
            // The Member DataHub first asks the provider to select evidence topics.
            // Give it a valid plan so this test reaches the actual answer request.
            if (systemPrompt.Contains("SportHub MEMBER read-only evidence planner", StringComparison.Ordinal))
                return Task.FromResult(new AiProviderResponse(Guid.NewGuid().ToString(), "{\"topics\":[\"overview\"],\"reason\":\"Integration test\"}", "Test", "Test"));
            Prompt = systemPrompt;
            Previous = previousInteractionId;
            return Task.FromResult(new AiProviderResponse(Guid.NewGuid().ToString(), "Test reply", "Test", "Test"));
        }
    }
    private sealed class Context(string role) : IAiContextBuilder
    {
        public Task<string> BuildAsync(Guid userId, string question, CancellationToken cancellationToken = default)
            => Task.FromResult(System.Text.Json.JsonSerializer.Serialize(new { role, accessScope = new { userId, role } }));
    }

    [Fact]
    public async Task Publish_changes_the_next_real_chat_request_for_all_clients_without_restarting_the_backend()
    {
        var manager = await factory.SeedUserAsync(UserRole.CenterManager);
        var otherManager = await factory.SeedUserAsync(UserRole.CenterManager);
        var member = await factory.SeedUserAsync(UserRole.Member);
        using var api = factory.CreateApiClient(manager.UserId, UserRole.CenterManager);
        using var otherClient = factory.CreateApiClient(otherManager.UserId, UserRole.CenterManager);
        using var memberClient = factory.CreateApiClient(member.UserId, UserRole.Member);
        var initialList = (await api.GetFromJsonAsync<List<ManagedPromptResponse>>("/api/ai/system-prompts"))!;
        var initial = initialList.Single(p => p.Id == "member-general-prompt");
        var original = initial.Active!;
        var spy = new Provider();
        async Task<AiChatResponse> Ask(Guid id, string role, string? previous = null)
        {
            using var scope = factory.Services.CreateScope();
            var chat = ActivatorUtilities.CreateInstance<AiChatService>(scope.ServiceProvider, spy, new Context(role));
            // The help/navigation question may be answered entirely by a verified local handler.
            // Use a safe, open-ended sport question that reaches the published provider prompt.
            return await chat.AskAsync(id, "Explain why repetition and rest matter for motor learning.", previous);
        }
        var draftText = "Published integration marker " + Guid.NewGuid();
        try
        {
            Assert.Equal(HttpStatusCode.Forbidden, (await memberClient.GetAsync("/api/ai/system-prompts")).StatusCode);
            var unauthorizedPublish = new SaveSystemPromptRequest("Member system prompt", "Member", "General", "Do not publish", initial.Revision);
            Assert.Equal(HttpStatusCode.Forbidden, (await memberClient.PostAsJsonAsync("/api/ai/system-prompts/member-general-prompt/publish", unauthorizedPublish)).StatusCode);

            var draftResponse = await api.PutAsJsonAsync("/api/ai/system-prompts/member-general-prompt/draft",
                new SaveSystemPromptRequest("Member system prompt", "Member", "General", draftText, initial.Revision));
            draftResponse.EnsureSuccessStatusCode();
            var drafted = (await draftResponse.Content.ReadFromJsonAsync<ManagedPromptResponse>())!;
            var before = await Ask(member.UserId, "Member");
            Assert.Contains(original.Content, spy.Prompt);
            Assert.DoesNotContain(draftText, spy.Prompt);
            var publishResponse = await api.PostAsJsonAsync("/api/ai/system-prompts/member-general-prompt/publish",
                new SaveSystemPromptRequest("Member system prompt", "Member", "General", draftText, drafted.Revision));
            publishResponse.EnsureSuccessStatusCode();
            var published = (await publishResponse.Content.ReadFromJsonAsync<ManagedPromptResponse>())!;

            var after = await Ask(member.UserId, "Member", before.InteractionId);
            Assert.Contains(draftText, spy.Prompt);
            Assert.Contains("MEMBER V26 RESPONSE RULES", spy.Prompt);
            Assert.Null(spy.Previous); // A prior interaction cannot carry the old prompt forward.
            using (var scope = factory.Services.CreateScope())
            {
                var currentPrompt = await scope.ServiceProvider.GetRequiredService<SystemPromptService>()
                    .GetPublishedAsync("Member");
                Assert.Equal(currentPrompt.Version, after.PromptVersion);
            }
            var freshView = (await otherClient.GetFromJsonAsync<List<ManagedPromptResponse>>("/api/ai/system-prompts"))!;
            Assert.Equal(draftText, freshView.Single(p => p.Id == initial.Id).Active!.Content);
            using (var scope = factory.Services.CreateScope())
            {
                var coachPrompt = await scope.ServiceProvider.GetRequiredService<SystemPromptService>()
                    .GetPublishedAsync("Coach");
                Assert.DoesNotContain(draftText, coachPrompt.Content);
            }

            var stale = await api.PostAsJsonAsync("/api/ai/system-prompts/member-general-prompt/publish",
                new SaveSystemPromptRequest("Stale update", "Member", "General", "Stale prompt", initial.Revision));
            Assert.Equal(HttpStatusCode.Conflict, stale.StatusCode);
            await Ask(member.UserId, "Member");
            Assert.Contains(draftText, spy.Prompt);

            var restoreResponse = await api.PostAsJsonAsync("/api/ai/system-prompts/member-general-prompt/restore", new RestoreSystemPromptRequest(original.Version, published.Revision));
            restoreResponse.EnsureSuccessStatusCode();
            var restored = (await restoreResponse.Content.ReadFromJsonAsync<ManagedPromptResponse>())!;
            await Ask(member.UserId, "Member");
            Assert.Contains(original.Content, spy.Prompt);
            Assert.Equal(HttpStatusCode.NoContent, (await api.DeleteAsync($"/api/ai/system-prompts/member-general-prompt?expectedRevision={restored.Revision}")).StatusCode);
            var fallback = await Ask(member.UserId, "Member");
            using (var scope = factory.Services.CreateScope())
            {
                var currentPrompt = await scope.ServiceProvider.GetRequiredService<SystemPromptService>()
                    .GetPublishedAsync("Member");
                Assert.Equal(currentPrompt.Version, fallback.PromptVersion);
            }
            Assert.Contains(SportHubAssistantSystemPrompt.Content, spy.Prompt);
        }
        finally
        {
            var current = (await api.GetFromJsonAsync<List<ManagedPromptResponse>>("/api/ai/system-prompts"))!.SingleOrDefault(p => p.Id == initial.Id);
            var reset = await api.PostAsJsonAsync("/api/ai/system-prompts/member-general-prompt/publish",
                new SaveSystemPromptRequest(original.Title, "Member", original.Category, original.Content, current?.Revision ?? 0));
            reset.EnsureSuccessStatusCode();
        }
    }

    [Fact]
    public async Task Keeps_only_the_previous_publication_and_drafts_never_change_history()
    {
        var manager = await factory.SeedUserAsync(UserRole.CenterManager);
        using var api = factory.CreateApiClient(manager.UserId, UserRole.CenterManager);
        const string id = "member-general-prompt";
        var initial = (await api.GetFromJsonAsync<List<ManagedPromptResponse>>("/api/ai/system-prompts"))!.Single(p => p.Id == id);
        var current = initial;
        async Task<ManagedPromptResponse> Save(string content, bool publish)
        {
            var request = new SaveSystemPromptRequest("Member system prompt", "Member", "General", content, current.Revision);
            var response = publish ? await api.PostAsJsonAsync($"/api/ai/system-prompts/{id}/publish", request)
                : await api.PutAsJsonAsync($"/api/ai/system-prompts/{id}/draft", request);
            response.EnsureSuccessStatusCode();
            return current = (await response.Content.ReadFromJsonAsync<ManagedPromptResponse>())!;
        }
        try
        {
            await Save("Draft one", false);
            await Save("Draft two", false);
            Assert.Equal(initial.History.Select(r => r.Version), current.History.Select(r => r.Version));
            Assert.Equal(initial.Active!.Version, current.Active!.Version);
            var first = await Save("Published A", true);
            Assert.Equal(initial.Active.Version, Assert.Single(first.History).Version);
            var second = await Save("Published B", true);
            Assert.Equal(first.Active!.Version, Assert.Single(second.History).Version);
            await Save("Pending draft C", false);
            Assert.Equal(first.Active.Version, Assert.Single(current.History).Version);
            Assert.Equal("Published B", current.Active!.Content);
            var expired = await api.PostAsJsonAsync($"/api/ai/system-prompts/{id}/restore", new RestoreSystemPromptRequest(initial.Active.Version, current.Revision));
            Assert.Equal(HttpStatusCode.NotFound, expired.StatusCode);
            var restored = await api.PostAsJsonAsync($"/api/ai/system-prompts/{id}/restore", new RestoreSystemPromptRequest(first.Active.Version, current.Revision));
            restored.EnsureSuccessStatusCode();
            current = (await restored.Content.ReadFromJsonAsync<ManagedPromptResponse>())!;
            Assert.Equal("Published A", current.Active!.Content);
            Assert.Equal(second.Active!.Version, Assert.Single(current.History).Version);
            Assert.Equal("Pending draft C", current.Draft!.Content);
        }
        finally
        {
            var latest = (await api.GetFromJsonAsync<List<ManagedPromptResponse>>("/api/ai/system-prompts"))!.Single(p => p.Id == id);
            var original = initial.Active!;
            (await api.PostAsJsonAsync($"/api/ai/system-prompts/{id}/publish", new SaveSystemPromptRequest(original.Title, "Member", original.Category, original.Content, latest.Revision))).EnsureSuccessStatusCode();
        }
    }

    [Fact]
    public async Task Concurrent_publications_allow_one_commit_and_never_overwrite_a_newer_revision()
    {
        var manager = await factory.SeedUserAsync(UserRole.CenterManager);
        using var api = factory.CreateApiClient(manager.UserId, UserRole.CenterManager);
        var initial = (await api.GetFromJsonAsync<List<ManagedPromptResponse>>("/api/ai/system-prompts"))!.Single(p => p.Id == "coach-general-prompt");
        try
        {
            var responses = await Task.WhenAll(Enumerable.Range(0, 2).Select(i => api.PostAsJsonAsync("/api/ai/system-prompts/coach-general-prompt/publish",
                new SaveSystemPromptRequest("Coach system prompt", "Coach", "General", "Concurrent prompt " + i, initial.Revision))));
            Assert.Single(responses, r => r.StatusCode == HttpStatusCode.OK);
            Assert.Single(responses, r => r.StatusCode == HttpStatusCode.Conflict);
            var current = (await api.GetFromJsonAsync<List<ManagedPromptResponse>>("/api/ai/system-prompts"))!.Single(p => p.Id == initial.Id);
            Assert.Equal(initial.Revision + 1, current.Revision);
            Assert.Single(current.History);
            Assert.Equal(initial.Active!.Version, current.History[0].Version);
            // Prompt composition is role-scoped. Coach chat may short-circuit to a
            // verified local response, so check its active prompt at the reader boundary.
            using var scope = factory.Services.CreateScope();
            var coachPrompt = await scope.ServiceProvider.GetRequiredService<SystemPromptService>()
                .GetPublishedAsync("Coach");
            Assert.Contains(current.Active!.Content, coachPrompt.Content);
            Assert.StartsWith("managed-coach-", coachPrompt.Version);
        }
        finally
        {
            var current = (await api.GetFromJsonAsync<List<ManagedPromptResponse>>("/api/ai/system-prompts"))!.Single(p => p.Id == initial.Id);
            var original = initial.Active!;
            (await api.PostAsJsonAsync("/api/ai/system-prompts/coach-general-prompt/publish", new SaveSystemPromptRequest(original.Title, "Coach", original.Category, original.Content, current.Revision))).EnsureSuccessStatusCode();
        }
    }
}
