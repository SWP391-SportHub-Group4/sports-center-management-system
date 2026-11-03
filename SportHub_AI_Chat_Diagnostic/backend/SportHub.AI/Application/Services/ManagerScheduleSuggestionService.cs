using System.Diagnostics;
using System.Globalization;
using System.Text.Json;
using System.Text.Json.Nodes;
using Microsoft.EntityFrameworkCore;
using SportHub.AI.Application.DTOs.Manager;
using SportHub.AI.Application.Interfaces;
using SportHub.AI.Domain.Constants;
using SportHub.AI.Domain.Entities;
using SportHub.BuildingBlocks.Abstractions.Persistence;
using SportHub.BuildingBlocks.Abstractions.Scheduling;
using SportHub.BuildingBlocks.SharedKernel.Time;
using SportHub.Scheduling.Catalog.Domain;
using SportHub.Scheduling.Domain.Rules;
using SportHub.Scheduling.Occupancy.Application;

namespace SportHub.AI.Application.Services;

public sealed class ManagerScheduleSuggestionService(
    ISportHubDbContext db,
    IManagerScheduleContextBuilder contextBuilder,
    IPythonAiClient pythonAiClient,
    AvailabilityService availability,
    IClock clock)
    : IManagerScheduleSuggestionService
{
    /*
     * First proposal + maximum two retries.
     */
    private const int MaxAiAttempts = 3;

    public async Task<
        ManagerScheduleSuggestionResponse>
        SuggestAsync(
            Guid managerId,
            ManagerScheduleSuggestionRequest request,
            CancellationToken cancellationToken = default)
    {
        /*
         * -----------------------------------------------
         * BASE CONTEXT
         * -----------------------------------------------
         */
        var contextJson =
            await contextBuilder.BuildAsync(
                managerId,
                request,
                cancellationToken);

        var baseContext =
            JsonNode.Parse(
                contextJson)
            as JsonObject
            ?? new JsonObject();

        var stopwatch =
            Stopwatch.StartNew();

        PythonManagerScheduleResponse?
            finalSuggestion = null;

        ManagerScheduleValidationResult?
            finalValidation = null;

        /*
         * Used only for the next AI attempt.
         */
        JsonObject?
            retryContext = null;

        /*
         * Keep the complete attempt history for AiLog.
         */
        var attemptLogs =
            new List<object>();

        for (
            var attempt = 1;
            attempt <= MaxAiAttempts;
            attempt++)
        {
            Console.WriteLine(
                $"[ManagerAI] Attempt {attempt}/{MaxAiAttempts}");

            /*
             * Each AI call receives a fresh copy
             * of the original SportHub context.
             */
            var attemptContext =
                baseContext.DeepClone()
                as JsonObject
                ?? new JsonObject();

            /*
             * Retry #2/#3 also receives the
             * previous backend validation failure.
             */
            if (retryContext != null)
            {
                attemptContext[
                    "retryContext"
                ] =
                    retryContext
                        .DeepClone();
            }

            var pythonRequest =
                new ManagerSchedulePythonRequest
                {
                    Capacity =
                        request.Capacity,

                    SportId =
                        request.SportId,

                    CoachId =
                        request.CoachId,

                    DefaultRoomId =
                        request.DefaultRoomId,

                    StartDate =
                        request.StartDate,

                    NumSessions =
                        request.NumSessions,

                    ScheduleRules =
                        request.ScheduleRules,

                    Context =
                        attemptContext
                };

            Console.WriteLine(
                "[ManagerAI] Calling Python...");

            var suggestion =
                await pythonAiClient
                    .SuggestManagerScheduleAsync(
                        pythonRequest,
                        cancellationToken);

            Console.WriteLine(
                "[ManagerAI] Python returned");

            Console.WriteLine(
                JsonSerializer.Serialize(
                    suggestion));

            /*
             * -------------------------------------------
             * AUTHORITATIVE BACKEND VALIDATION
             * -------------------------------------------
             */
            var validation =
                await ValidateSuggestionAsync(
                    request,
                    suggestion,
                    cancellationToken);

            attemptLogs.Add(
                new
                {
                    attempt,

                    suggestion,

                    validation
                });

            finalSuggestion =
                suggestion;

            finalValidation =
                validation;

            /*
             * Success.
             *
             * Stop retrying immediately.
             */
            if (
                validation
                    .AllAvailable)
            {
                Console.WriteLine(
                    $"[ManagerAI] Attempt {attempt} passed backend validation.");

                break;
            }

            Console.WriteLine(
                $"[ManagerAI] Attempt {attempt} has conflicts.");

            /*
             * No need to build another retry
             * context after the last attempt.
             */
            if (
                attempt ==
                MaxAiAttempts)
            {
                break;
            }

            /*
             * -------------------------------------------
             * BUILD RETRY CONTEXT
             * -------------------------------------------
             *
             * The LLM is told exactly which sessions
             * failed and why.
             *
             * It must propose a different recurrence
             * schedule while preserving locked fields.
             */
            var conflictSessions =
                validation
                    .Sessions
                    .Where(
                        session =>
                            !session.Available)
                    .Select(
                        session =>
                            new
                            {
                                session.SessionNo,

                                session.StartAtUtc,

                                session.EndAtUtc,

                                session.Reasons
                            })
                    .ToList();

            retryContext =
                new JsonObject
                {
                    [
                        "attempt"
                    ] =
                        attempt,

                    [
                        "instruction"
                    ] =
                        "The previous schedule failed SportHub backend availability validation. "
                        + "Generate a materially different recurring schedule that avoids the reported conflicts. "
                        + "Do not change sportId, coachId, defaultRoomId, capacity, price or costAmount.",

                    [
                        "failedSuggestion"
                    ] =
                        JsonSerializer
                            .SerializeToNode(
                                suggestion),

                    [
                        "conflicts"
                    ] =
                        JsonSerializer
                            .SerializeToNode(
                                conflictSessions)
                };
        }

        stopwatch.Stop();

        /*
         * Defensive check.
         */
        if (
            finalSuggestion is null ||
            finalValidation is null)
        {
            throw new InvalidOperationException(
                "AI schedule suggestion could not be generated.");
        }

        var logId =
            Guid.NewGuid();

        var generatedAt =
            clock.UtcNow;

        var elapsedMs =
            (int)Math.Min(
                int.MaxValue,
                stopwatch
                    .ElapsedMilliseconds);

        /*
         * -----------------------------------------------
         * AI LOG
         * -----------------------------------------------
         */
        db.Set<AiLog>().Add(
            new AiLog
            {
                LogId =
                    logId,

                UserId =
                    managerId,

                QueryType =
                    AiQueryTypes
                        .ManagerScheduleSuggestion,

                InputPayload =
                    JsonSerializer.Serialize(
                        new
                        {
                            request,

                            context =
                                baseContext
                        }),

                ResponsePayload =
                    JsonSerializer.Serialize(
                        new
                        {
                            attempts =
                                attemptLogs,

                            finalSuggestion,

                            finalValidation
                        }),

                ResponseTimeMs =
                    elapsedMs,

                CreatedAt =
                    generatedAt
            });

        await db.SaveChangesAsync(
            cancellationToken);

        Console.WriteLine(
            "[ManagerAI] AiLog saved");

        /*
         * If all attempts failed,
         * return the final one.
         *
         * Frontend will show conflicts
         * and disable Apply.
         */
        return new
            ManagerScheduleSuggestionResponse(
                finalSuggestion
                    .StartDate,

                finalSuggestion
                    .NumSessions,

                finalSuggestion
                    .ScheduleRules,

                finalSuggestion
                    .Rationale,

                finalValidation,

                logId,

                "Python AI Service",

                "Gemini",

                elapsedMs,

                generatedAt);
    }

    private async Task<
        ManagerScheduleValidationResult>
        ValidateSuggestionAsync(
            ManagerScheduleSuggestionRequest originalRequest,
            PythonManagerScheduleResponse suggestion,
            CancellationToken cancellationToken)
    {
        /*
         * -----------------------------------------------
         * GET REAL GROUP COURSE DURATION
         * -----------------------------------------------
         */
        var sport =
            await db.Set<Sport>()
                .AsNoTracking()
                .Where(
                    x =>
                        x.SportId ==
                        originalRequest
                            .SportId)
                .Select(
                    x =>
                        new
                        {
                            DurationMinutes =
                                x.Services
                                    .Where(
                                        service =>
                                            service
                                                .ServiceType ==
                                            SportServiceType
                                                .GroupCourse &&
                                            service
                                                .IsEnabled)
                                    .Select(
                                        service =>
                                            service
                                                .DefaultSessionMinutes)
                                    .FirstOrDefault()
                        })
                .FirstOrDefaultAsync(
                    cancellationToken);

        if (
            sport?.DurationMinutes
                is not int duration ||
            duration <= 0)
        {
            throw new
                InvalidOperationException(
                    "Group course duration is unavailable.");
        }

        /*
         * -----------------------------------------------
         * CONVERT AI RULES
         * -----------------------------------------------
         */
        var rules =
            new List<(
                int DayOfWeek,
                TimeOnly StartTimeLocal)>();

        foreach (
            var rule
            in suggestion
                .ScheduleRules)
        {
            if (
                !TimeOnly
                    .TryParseExact(
                        rule
                            .StartTimeLocal,

                        "HH:mm",

                        CultureInfo
                            .InvariantCulture,

                        DateTimeStyles
                            .None,

                        out var time))
            {
                throw new
                    InvalidOperationException(
                        "AI returned an invalid schedule time.");
            }

            rules.Add(
                (
                    rule
                        .DayOfWeek,

                    time
                ));
        }

        /*
         * -----------------------------------------------
         * GENERATE ACTUAL SESSIONS
         * -----------------------------------------------
         *
         * Same domain generator used by publish.
         */
        var generated =
            CourseRules
                .GenerateSessions(
                    suggestion
                        .StartDate,

                    suggestion
                        .NumSessions,

                    rules,

                    duration);

        var rows =
            new List<
                ManagerScheduleValidationSession>();

        /*
         * -----------------------------------------------
         * VALIDATE EVERY SESSION
         * -----------------------------------------------
         */
        foreach (
            var session
            in generated)
        {
            var checkedSlot =
                await availability
                    .CheckClassSlotAsync(
                        originalRequest
                            .SportId,

                        originalRequest
                            .DefaultRoomId,

                        originalRequest
                            .CoachId,

                        originalRequest
                            .Capacity,

                        session
                            .StartAtUtc,

                        session
                            .EndAtUtc,

                        excludeSessionId:
                            null,

                        ct:
                            cancellationToken);

            rows.Add(
                new
                    ManagerScheduleValidationSession(
                        session
                            .SessionNo,

                        session
                            .StartAtUtc,

                        session
                            .EndAtUtc,

                        checkedSlot
                            .Available,

                        checkedSlot
                            .Reasons));
        }

        return new
            ManagerScheduleValidationResult(
                rows.All(
                    row =>
                        row.Available),

                rows);
    }
}