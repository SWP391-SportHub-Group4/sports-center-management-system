using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.Http;
using SportHub.AI.Application.DTOs.Chat;
using SportHub.AI.Application.Interfaces;
using SportHub.BuildingBlocks.SharedKernel.Errors;

namespace SportHub.AI.Infrastructure.Python;

public class PythonAiChatProvider(
    IHttpClientFactory httpClientFactory)
    : IAiChatProvider
{
    // The concrete service type selects a trusted endpoint. User input cannot change roles.
    protected virtual string ChatEndpoint => "/member/chat";

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
                    ChatEndpoint,
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
            // Only allowlisted, server-owned provider error codes may cross the API boundary.
            // Never pass the raw upstream response body or exception message to clients.
            var status = (int)response.StatusCode;
            string? upstreamCode = null;
            try
            {
                using var details = await JsonDocument.ParseAsync(
                    await response.Content.ReadAsStreamAsync(cancellationToken),
                    cancellationToken: cancellationToken);
                if (details.RootElement.TryGetProperty("detail", out var detail) &&
                    detail.ValueKind == JsonValueKind.Object &&
                    detail.TryGetProperty("code", out var codeElement) &&
                    codeElement.ValueKind == JsonValueKind.String)
                    upstreamCode = codeElement.GetString();
            }
            catch (JsonException) { /* The server might return plain text on an infrastructure failure. */ }

            var (httpStatus, errorCode, message) = (status, upstreamCode) switch
            {
                (429, _) => (503, "ai_provider_rate_limited", "The AI provider is rate limited. Please try again later."),
                (_, "ai_provider_auth_failed") => (503, "ai_provider_auth_failed", "AI provider credentials are unavailable. Contact support."),
                (_, "ai_model_unavailable") => (503, "ai_model_unavailable", "The configured AI model is unavailable. Contact support."),
                (504, _) or (_, "ai_provider_timeout") => (504, "ai_provider_timeout", "The AI provider did not respond in time."),
                (503, _) => (503, "ai_provider_unavailable", "The AI provider is temporarily unavailable."),
                (_, "ai_provider_empty_answer") => (502, "ai_provider_empty_answer", "The AI provider returned no usable answer."),
                _ => (502, "ai_service_error", "The AI service could not complete this request.")
            };
            throw new AppException(httpStatus, errorCode, message);
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