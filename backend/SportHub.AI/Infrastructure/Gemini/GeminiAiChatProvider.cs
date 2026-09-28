using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Options;
using SportHub.AI.Application.DTOs.Chat;
using SportHub.AI.Application.Interfaces;
using SportHub.BuildingBlocks.SharedKernel.Errors;
using System.Net.Http.Json;
using System.Text.Json;

namespace SportHub.AI.Infrastructure.Gemini;

public sealed class GeminiAiChatProvider(
    HttpClient httpClient,
    IOptions<GeminiOptions> options) : IAiChatProvider
{
    private readonly GeminiOptions _options = options.Value;

    public async Task<AiProviderResponse> AskAsync(
        string systemPrompt,
        string context,
        string question,
        string? previousInteractionId = null,
        CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(_options.ApiKey))
        {
            throw new AppException(
                StatusCodes.Status503ServiceUnavailable,
                "gemini_not_configured",
                "Gemini API key is not configured on the SportHub backend.");
        }

        var input = $"""
SPORT_HUB_CONTEXT
{context}
END_SPORT_HUB_CONTEXT

MEMBER_QUESTION
{question}
END_MEMBER_QUESTION
""";

        var payload = new Dictionary<string, object?>
        {
            ["model"] = _options.Model,
            ["system_instruction"] = systemPrompt,
            ["input"] = input,
            ["store"] = true
        };

        if (!string.IsNullOrWhiteSpace(previousInteractionId))
        {
            payload["previous_interaction_id"] =
                previousInteractionId.Trim();
        }

        using var request = new HttpRequestMessage(
            HttpMethod.Post,
            "/v1beta/interactions");

        request.Headers.Add(
            "x-goog-api-key",
            _options.ApiKey);

        request.Content =
            JsonContent.Create(payload);

        HttpResponseMessage response;

        try
        {
            response = await httpClient.SendAsync(
                request,
                cancellationToken);
        }
        catch (TaskCanceledException)
            when (!cancellationToken.IsCancellationRequested)
        {
            throw new AppException(
                StatusCodes.Status504GatewayTimeout,
                "gemini_timeout",
                "Gemini did not respond within the configured timeout.");
        }
        catch (HttpRequestException ex)
        {
            throw new AppException(
                StatusCodes.Status502BadGateway,
                "gemini_unreachable",
                $"Unable to reach Gemini: {ex.Message}");
        }

        using (response)
        {
            var raw = await response.Content
                .ReadAsStringAsync(cancellationToken);

            if (!response.IsSuccessStatusCode)
            {
                var safeMessage =
                    TryReadGeminiError(raw)
                    ?? $"Gemini returned HTTP {(int)response.StatusCode}.";

                throw new AppException(
                    StatusCodes.Status502BadGateway,
                    "gemini_provider_failed",
                    safeMessage);
            }

            try
            {
                using var document =
                    JsonDocument.Parse(raw);

                var root =
                    document.RootElement;

                var interactionId =
                    root.TryGetProperty(
                        "id",
                        out var idElement)
                        ? idElement.GetString()
                            ?? string.Empty
                        : string.Empty;

                var model =
                    root.TryGetProperty(
                        "model",
                        out var modelElement)
                        ? modelElement.GetString()
                            ?? _options.Model
                        : _options.Model;

                var answer =
                    ExtractOutputText(root);

                if (
                    string.IsNullOrWhiteSpace(interactionId) ||
                    string.IsNullOrWhiteSpace(answer))
                {
                    throw new JsonException(
                        "Gemini response did not contain an interaction id and text output.");
                }

                return new AiProviderResponse(
                    interactionId,
                    answer.Trim(),
                    "Google Gemini",
                    model);
            }
            catch (JsonException ex)
            {
                throw new AppException(
                    StatusCodes.Status502BadGateway,
                    "gemini_invalid_response",
                    $"Gemini returned an unexpected response: {ex.Message}");
            }
        }
    }

    private static string ExtractOutputText(
        JsonElement root)
    {
        if (
            !root.TryGetProperty(
                "steps",
                out var steps) ||
            steps.ValueKind != JsonValueKind.Array)
        {
            return string.Empty;
        }

        var parts =
            new List<string>();

        foreach (var step in steps.EnumerateArray())
        {
            if (
                !step.TryGetProperty(
                    "type",
                    out var stepType) ||
                stepType.GetString() != "model_output")
            {
                continue;
            }

            if (
                !step.TryGetProperty(
                    "content",
                    out var content) ||
                content.ValueKind != JsonValueKind.Array)
            {
                continue;
            }

            foreach (var item in content.EnumerateArray())
            {
                if (
                    item.TryGetProperty(
                        "type",
                        out var contentType) &&
                    contentType.GetString() == "text" &&
                    item.TryGetProperty(
                        "text",
                        out var textElement))
                {
                    var text =
                        textElement.GetString();

                    if (!string.IsNullOrWhiteSpace(text))
                    {
                        parts.Add(text);
                    }
                }
            }
        }

        return string.Join(
            "\n",
            parts);
    }

    private static string? TryReadGeminiError(
        string raw)
    {
        try
        {
            using var document =
                JsonDocument.Parse(raw);

            if (
                document.RootElement.TryGetProperty(
                    "error",
                    out var error) &&
                error.TryGetProperty(
                    "message",
                    out var message))
            {
                return message.GetString();
            }
        }
        catch (JsonException)
        {
        }

        return null;
    }
}