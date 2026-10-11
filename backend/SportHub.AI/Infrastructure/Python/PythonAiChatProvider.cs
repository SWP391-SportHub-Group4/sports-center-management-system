using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.Http;
using SportHub.AI.Application.DTOs.Chat;
using SportHub.AI.Application.Interfaces;
using SportHub.BuildingBlocks.SharedKernel.Errors;

namespace SportHub.AI.Infrastructure.Python;

public sealed class PythonAiChatProvider(
    IHttpClientFactory httpClientFactory)
    : IAiChatProvider
{
    private static readonly JsonSerializerOptions JsonOptions =
        new(JsonSerializerDefaults.Web)
        {
            PropertyNameCaseInsensitive = true
        };

    private sealed class PythonChatRequest
    {
        public string SystemPrompt { get; set; } = string.Empty;

        public string Context { get; set; } = string.Empty;

        public string Question { get; set; } = string.Empty;

        public string? PreviousInteractionId { get; set; }
    }

    public async Task<AiProviderResponse> AskAsync(
        string systemPrompt,
        string context,
        string question,
        string? previousInteractionId = null,
        CancellationToken cancellationToken = default)
    {
        var client =
            httpClientFactory.CreateClient(
                "SportHubPythonAI");

        var request =
            new PythonChatRequest
            {
                SystemPrompt =
                    systemPrompt,

                Context =
                    context,

                Question =
                    question,

                PreviousInteractionId =
                    previousInteractionId
            };

        HttpResponseMessage response;

        try
        {
            response =
                await client.PostAsJsonAsync(
                    "/member/chat",
                    request,
                    JsonOptions,
                    cancellationToken);
        }
        catch (TaskCanceledException)
            when (!cancellationToken.IsCancellationRequested)
        {
            throw new AppException(
                StatusCodes.Status504GatewayTimeout,
                "ai_service_timeout",
                "AI service timed out.");
        }
        catch (HttpRequestException)
        {
            throw new AppException(
                StatusCodes.Status503ServiceUnavailable,
                "ai_service_unavailable",
                "AI service is unavailable.");
        }

        if (!response.IsSuccessStatusCode)
        {
            var body =
                await response.Content.ReadAsStringAsync(
                    cancellationToken);

            throw new AppException(
                StatusCodes.Status502BadGateway,
                "ai_service_error",
                $"AI service returned {(int)response.StatusCode}: {body}");
        }

        var result =
            await response.Content.ReadFromJsonAsync<
                AiProviderResponse>(
                    JsonOptions,
                    cancellationToken);

        if (result is null)
        {
            throw new AppException(
                StatusCodes.Status502BadGateway,
                "ai_service_empty_response",
                "AI service returned an empty response.");
        }

        return result;
    }
}