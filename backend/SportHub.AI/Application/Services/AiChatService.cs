using Microsoft.AspNetCore.Http;
using SportHub.AI.Application.DTOs.Chat;
using SportHub.AI.Application.Interfaces;
using SportHub.AI.Domain.Constants;
using SportHub.AI.Prompts;
using SportHub.BuildingBlocks.Abstractions.Persistence;
using SportHub.BuildingBlocks.SharedKernel.Errors;
using SportHub.BuildingBlocks.SharedKernel.Time;
using System.Diagnostics;
using System.Text.Json;

namespace SportHub.AI.Application.Services;

public sealed class AiChatService(
    ISportHubDbContext db,
    IAiContextBuilder contextBuilder,
    IAiChatProvider provider,
    IClock clock) : IAiChatService
{
    public const int MaxQuestionLength = 2000;

    public const int MaxPreviousInteractionIdLength = 512;

    public async Task<AiChatResponse> AskAsync(
        Guid userId,
        string question,
        string? previousInteractionId = null,
        CancellationToken cancellationToken = default)
    {
        question =
            question?.Trim()
            ?? string.Empty;

        previousInteractionId =
            string.IsNullOrWhiteSpace(
                previousInteractionId)
                ? null
                : previousInteractionId.Trim();

        if (string.IsNullOrWhiteSpace(question))
        {
            throw new BadRequestException(
                "ai_question_required",
                "Question is required.");
        }

        if (question.Length > MaxQuestionLength)
        {
            throw new BadRequestException(
                "ai_question_too_long",
                $"Question must not exceed {MaxQuestionLength} characters.");
        }

        if (
            previousInteractionId?.Length
            > MaxPreviousInteractionIdLength)
        {
            throw new BadRequestException(
                "ai_interaction_id_too_long",
                "PreviousInteractionId is invalid.");
        }

        var context =
            await contextBuilder.BuildAsync(
                userId,
                question,
                cancellationToken);

        var stopwatch =
            Stopwatch.StartNew();

        AiProviderResponse? providerResponse = null;
        Exception? providerFailure = null;

        try
        {
            providerResponse =
                await provider.AskAsync(
                    SportHubAssistantSystemPrompt.Content,
                    context,
                    question,
                    previousInteractionId,
                    cancellationToken);
        }
        catch (Exception ex)
            when (ex is not OperationCanceledException)
        {
            providerFailure = ex;
        }

        stopwatch.Stop();

        var elapsedMs =
            (int)Math.Min(
                int.MaxValue,
                stopwatch.ElapsedMilliseconds);

        var createdAt =
            clock.UtcNow;

        var logId =
            Guid.NewGuid();

        db.Set<AiLog>().Add(
            new AiLog
            {
                LogId = logId,
                UserId = userId,

                QueryType =
                    AiQueryTypes.Chat,

                InputPayload =
                    JsonSerializer.Serialize(
                        new
                        {
                            question,
                            previousInteractionId,

                            promptVersion =
                                SportHubAssistantSystemPrompt.Version
                        }),

                ResponsePayload =
                    JsonSerializer.Serialize(
                        new
                        {
                            interactionId =
                                providerResponse?.InteractionId,

                            answer =
                                providerResponse?.Answer,

                            provider =
                                providerResponse?.Provider
                                ?? "Google Gemini",

                            model =
                                providerResponse?.Model,

                            success =
                                providerFailure is null,

                            errorCode =
                                providerFailure
                                is AppException appError
                                    ? appError.ErrorCode
                                    : providerFailure?
                                        .GetType()
                                        .Name
                        }),

                ResponseTimeMs =
                    elapsedMs,

                CreatedAt =
                    createdAt
            });

        await db.SaveChangesAsync(
            cancellationToken);

        if (providerFailure is not null)
        {
            if (providerFailure is AppException appException)
            {
                throw appException;
            }

            throw new AppException(
                StatusCodes.Status502BadGateway,
                "ai_provider_failed",
                "The AI assistant is temporarily unavailable.");
        }

        return new AiChatResponse(
            logId,
            providerResponse!.InteractionId,
            question,
            providerResponse.Answer,
            providerResponse.Provider,
            providerResponse.Model,
            SportHubAssistantSystemPrompt.Version,
            elapsedMs,
            createdAt);
    }
}