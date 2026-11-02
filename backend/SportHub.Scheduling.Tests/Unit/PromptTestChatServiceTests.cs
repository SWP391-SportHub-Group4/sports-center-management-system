using System.Reflection;
using System.Text.Json;
using Microsoft.AspNetCore.Authorization;
using Microsoft.Extensions.Caching.Memory;
using SportHub.AI.Api;
using SportHub.AI.Application.DTOs.Chat;
using SportHub.AI.Application.Interfaces;
using SportHub.AI.Application.Services;
using SportHub.BuildingBlocks.Api;
using SportHub.BuildingBlocks.SharedKernel.Errors;
using SportHub.BuildingBlocks.SharedKernel.Time;

namespace SportHub.Scheduling.Tests.Unit;

public sealed class PromptTestChatServiceTests
{
    private sealed class PromptReader : ISystemPromptReader { public Task<PublishedSystemPrompt> GetPublishedAsync(string role, CancellationToken ct = default) => Task.FromResult(SystemPromptService.DefaultFor(role)); }
    private sealed class Clock : IClock { public DateTime UtcNow { get; set; } = DateTime.UtcNow; }
    private sealed class Provider : IAiChatProvider
    {
        public List<(string Prompt, string Context, string Question, string? Previous)> Calls { get; } = [];
        public bool Fail { get; set; }
        public Task<AiProviderResponse> AskAsync(string systemPrompt, string context, string question, string? previousInteractionId = null, CancellationToken cancellationToken = default)
        {
            Calls.Add((systemPrompt, context, question, previousInteractionId));
            if (Fail) throw new InvalidOperationException("provider error");
            return Task.FromResult(new AiProviderResponse("provider-id", "**Demo answer**", "Test provider", "test-model"));
        }
    }

    [Fact]
    public async Task History_is_server_owned_and_member_language_and_plain_text_are_preserved()
    {
        using var cache = new MemoryCache(new MemoryCacheOptions());
        var provider = new Provider();
        var service = new PromptTestChatService(provider, cache, new Clock(), new PromptReader());
        var manager = Guid.NewGuid();
        var first = await service.AskAsync(manager, new("Member", "What is my schedule?", "A draft prompt"));
        Assert.Equal("Demo answer", first.Answer);
        Assert.Contains("A draft prompt", provider.Calls[0].Prompt);
        Assert.Contains("CURRENT RESPONSE LANGUAGE: English", provider.Calls[0].Prompt);
        await service.AskAsync(manager, new("Member", "Who teaches it?", "A draft prompt", first.ConversationId));
        using var context = JsonDocument.Parse(provider.Calls[1].Context);
        var history = context.RootElement.GetProperty("conversationHistory");
        Assert.Equal(2, history.GetArrayLength());
        Assert.Equal("What is my schedule?", history[0].GetProperty("content").GetString());
        Assert.True(context.RootElement.GetProperty("testMode").GetBoolean());
        Assert.Null(provider.Calls[1].Previous);
    }

    [Fact]
    public async Task Cannot_reuse_a_session_for_another_manager_role_prompt_or_after_expiry()
    {
        using var cache = new MemoryCache(new MemoryCacheOptions());
        var clock = new Clock();
        var provider = new Provider();
        var service = new PromptTestChatService(provider, cache, clock, new PromptReader());
        var owner = Guid.NewGuid();
        var response = await service.AskAsync(owner, new("Coach", "Hello", "Draft"));
        await Assert.ThrowsAsync<BadRequestException>(() => service.AskAsync(Guid.NewGuid(), new("Coach", "Next", "Draft", response.ConversationId)));
        await Assert.ThrowsAsync<BadRequestException>(() => service.AskAsync(owner, new("Member", "Next", "Draft", response.ConversationId)));
        await Assert.ThrowsAsync<BadRequestException>(() => service.AskAsync(owner, new("Coach", "Next", "Changed", response.ConversationId)));
        clock.UtcNow = clock.UtcNow.AddMinutes(31);
        await Assert.ThrowsAsync<BadRequestException>(() => service.AskAsync(owner, new("Coach", "Next", "Draft", response.ConversationId)));
        Assert.Single(provider.Calls);
    }

    [Theory]
    [InlineData("Manager", "Hello", "Prompt")]
    [InlineData("Member", "", "Prompt")]
    [InlineData("Coach", "Hello", "")]
    public async Task Rejects_invalid_input_before_calling_provider(string role, string question, string prompt)
    {
        using var cache = new MemoryCache(new MemoryCacheOptions());
        var provider = new Provider();
        var service = new PromptTestChatService(provider, cache, new Clock(), new PromptReader());
        await Assert.ThrowsAsync<BadRequestException>(() => service.AskAsync(Guid.NewGuid(), new(role, question, prompt)));
        Assert.Empty(provider.Calls);
    }

    [Fact]
    public async Task Provider_failure_does_not_add_a_failed_turn_and_coach_context_has_no_member_profile()
    {
        using var cache = new MemoryCache(new MemoryCacheOptions());
        var provider = new Provider();
        var service = new PromptTestChatService(provider, cache, new Clock(), new PromptReader());
        var manager = Guid.NewGuid();
        var first = await service.AskAsync(manager, new("Coach", "Hello", "Draft"));
        provider.Fail = true;
        await Assert.ThrowsAsync<AppException>(() => service.AskAsync(manager, new("Coach", "Failed turn", "Draft", first.ConversationId)));
        provider.Fail = false;
        await service.AskAsync(manager, new("Coach", "Retry", "Draft", first.ConversationId));
        using var context = JsonDocument.Parse(provider.Calls[2].Context);
        Assert.Equal(2, context.RootElement.GetProperty("conversationHistory").GetArrayLength());
        Assert.False(context.RootElement.GetProperty("demoData").TryGetProperty("healthProfile", out _));
    }

    [Fact]
    public void Endpoint_requires_center_manager()
    {
        var authorization = typeof(PromptTestChatController).GetCustomAttribute<AuthorizeAttribute>();
        Assert.Equal(SportHubPolicies.CenterManager, authorization?.Policy);
    }
}
