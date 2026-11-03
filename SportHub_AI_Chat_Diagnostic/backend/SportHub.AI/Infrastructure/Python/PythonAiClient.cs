using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.Http;
using SportHub.AI.Application.DTOs.Manager;
using SportHub.AI.Application.Interfaces;
using SportHub.BuildingBlocks.SharedKernel.Errors;

namespace SportHub.AI.Infrastructure.Python;

public sealed class PythonAiClient(
    IHttpClientFactory httpClientFactory)
    : IPythonAiClient
{
    private static readonly JsonSerializerOptions
        JsonOptions =
            new(JsonSerializerDefaults.Web)
            {
                PropertyNameCaseInsensitive = true
            };

    public async Task<PythonManagerScheduleResponse>
        SuggestManagerScheduleAsync(
            ManagerSchedulePythonRequest request,
            CancellationToken cancellationToken = default)
    {
        var client =
            httpClientFactory.CreateClient(
                "SportHubPythonAI");

        HttpResponseMessage response;

        try
        {
            response =
                await client.PostAsJsonAsync(
                    "/manager/schedule-suggestions",
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
                await response.Content
                    .ReadAsStringAsync(
                        cancellationToken);

            throw new AppException(
                StatusCodes.Status502BadGateway,
                "ai_service_error",
                $"AI service returned {(int)response.StatusCode}: {body}");
        }

        var result =
            await response.Content
                .ReadFromJsonAsync<
                    PythonManagerScheduleResponse>(
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