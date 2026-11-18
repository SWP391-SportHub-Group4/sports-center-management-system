using System.Diagnostics;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using SportHub.AI.Application.DTOs.Chat;
using SportHub.AI.Application.Interfaces;
using SportHub.AI.Application.Services.Flow6;
using SportHub.AI.Domain.Constants;
using SportHub.BuildingBlocks.Abstractions.Persistence;
using SportHub.BuildingBlocks.SharedKernel.Errors;
using SportHub.BuildingBlocks.SharedKernel.Time;
using SportHub.Identity.Domain.Entities;
using SportHub.Identity.Domain.Enums;

namespace SportHub.AI.Application.Services;

public sealed class AiChatService(
    ISportHubDbContext db,
    IAiContextBuilder contextBuilder,
    IAiChatProvider provider,
    IClock clock,
    ISystemPromptReader promptReader,
    SportHub.AI.Infrastructure.Python.PythonCoachChatProvider coachProvider,
    ILogger<AiChatService> logger) : IAiChatService
{
    public const int MaxQuestionLength = 2000;
    public const int MaxPreviousInteractionIdLength = 512;

    public async Task<AiChatResponse> AskAsync(Guid userId, string question,
        string? previousInteractionId = null, CancellationToken cancellationToken = default)
    {
        question = question?.Trim() ?? string.Empty;
        previousInteractionId = string.IsNullOrWhiteSpace(previousInteractionId) ? null : previousInteractionId.Trim();
        if (string.IsNullOrWhiteSpace(question)) throw new BadRequestException("ai_question_required", "Question is required.");
        if (question.Length > MaxQuestionLength) throw new BadRequestException("ai_question_too_long", $"Question must not exceed {MaxQuestionLength} characters.");
        if (previousInteractionId?.Length > MaxPreviousInteractionIdLength)
            throw new BadRequestException("ai_interaction_id_too_long", "PreviousInteractionId is invalid.");

        // Kept constructor-compatible for existing DI and tests, but the shared broad context builder is NEVER invoked.
        _ = contextBuilder;
        var account = await db.Set<UserAccount>().AsNoTracking().Where(u => u.UserId == userId && u.Role != null && u.Status == UserStatus.Active)
            .Select(u => new { Role = u.Role!.RoleName, u.SecurityStamp }).SingleOrDefaultAsync(cancellationToken);
        if (userId == Guid.Empty || account is null || account.Role is not (UserRole.Member or UserRole.Coach)) throw Forbidden();
        var trustedRole = account.Role;
        var roleName = trustedRole == UserRole.Member ? "Member" : "Coach";
        var timer = Stopwatch.StartNew();
        var published = await promptReader.GetPublishedAsync(roleName, cancellationToken);
        var previousQuestion = await PreviousQuestionAsync(userId, roleName, published.Version, previousInteractionId, cancellationToken);

        // Revalidate role after planning, before every business read, and before returning the answer.
        async Task RequireRoleAsync(CancellationToken ct)
        {
            if (!await db.Set<UserAccount>().AsNoTracking().AnyAsync(u => u.UserId == userId && u.Role != null &&
                u.Role.RoleName == trustedRole && u.Status == UserStatus.Active && u.SecurityStamp == account.SecurityStamp, ct)) throw Forbidden();
        }
        async Task<object> LoadMember(string topic, CancellationToken ct)
        {
            await RequireRoleAsync(ct);
            return await MemberFlow6Chat.LoadAsync(db, userId, topic, clock.UtcNow, ct);
        }
        async Task<object> LoadCoach(string topic, CancellationToken ct)
        {
            await RequireRoleAsync(ct);
            return await CoachFlow6Chat.LoadAsync(db, userId, topic, question, clock.UtcNow, ct);
        }

        Flow6Result result;
        try
        {
            result = trustedRole == UserRole.Member
                ? await MemberFlow6Chat.RunAsync(provider, published.Content, question, previousQuestion,
                    clock.UtcNow, LoadMember, cancellationToken)
                : await CoachFlow6Chat.RunAsync(coachProvider, published.Content, question, previousQuestion,
                    clock.UtcNow, LoadCoach, cancellationToken);
            await RequireRoleAsync(cancellationToken);
        }
        catch (OperationCanceledException) { throw; }
        catch (AppException ex)
        {
            logger.LogWarning("Flow6 {Role} failed: {Code}", roleName, ex.ErrorCode);
            throw; // Existing UI handles typed 502/503/504, auth and rate-limit messages.
        }
        catch (Exception ex)
        {
            // Avoid logging raw question, model answer, DB rows, or credential-bearing exception text.
            logger.LogError("Flow6 {Role} failed: {Type}", roleName, ex.GetType().Name);
            throw new AppException(502, "flow6_chat_failed", "The AI assistant could not verify an answer. Please try again.");
        }

        timer.Stop();
        var logId = Guid.NewGuid();
        // Use backend-generated continuity ID, not an upstream ID. Never send old responses/evidence to the LLM.
        var interactionId = Guid.NewGuid().ToString("N");
        var elapsed = (int)Math.Min(int.MaxValue, timer.ElapsedMilliseconds);
        var createdAt = clock.UtcNow;
        // Only store a previous question for a successful in-scope turn. Clear denied queries and obvious secrets.
        var allowHistory = result.Plan.Intent is "FACTS" or "RECOMMEND" or "ANALYZE" or "GENERAL" or "NAVIGATION" or "CLARIFY";
        var historyText = allowHistory && !ContainsSecretMarker(question) ? question : null;
        db.Set<AiLog>().Add(new AiLog
        {
            LogId = logId, UserId = userId, QueryType = AiQueryTypes.Chat, CreatedAt = createdAt,
            ResponseTimeMs = elapsed,
            InputPayload = JsonSerializer.Serialize(new { version = Flow6ChatEngine.Version, role = roleName,
                promptVersion = published.Version, intent = result.Plan.Intent, language = result.Plan.Language,
                topics = result.Plan.Topics, previousQuestion = historyText, providerCalls = result.ProviderCalls }),
            ResponsePayload = JsonSerializer.Serialize(new { interactionId, answer = "[REDACTED]", result.Provider,
                result.Model, success = true })
        });
        await db.SaveChangesAsync(cancellationToken);
        return new AiChatResponse(logId, interactionId, question, result.Answer,
            result.Provider, result.Model, published.Version, elapsed, createdAt);
    }

    private async Task<string?> PreviousQuestionAsync(Guid userId, string role, string promptVersion,
        string? interactionId, CancellationToken ct)
    {
        if (interactionId is null || !Guid.TryParseExact(interactionId, "N", out _)) return null;
        var since = clock.UtcNow.AddMinutes(-30);
        var recent = await db.Set<AiLog>().AsNoTracking()
            .Where(l => l.UserId == userId && l.QueryType == AiQueryTypes.Chat && l.CreatedAt >= since)
            .OrderByDescending(l => l.CreatedAt).Take(30)
            .Select(l => new { l.InputPayload, l.ResponsePayload }).ToListAsync(ct);
        foreach (var row in recent)
        {
            try
            {
                using var input = JsonDocument.Parse(row.InputPayload);
                using var output = JsonDocument.Parse(row.ResponsePayload);
                var i = input.RootElement;
                var o = output.RootElement;
                if (i.ValueKind != JsonValueKind.Object || o.ValueKind != JsonValueKind.Object) continue;
                string? Read(JsonElement item, string key) => item.TryGetProperty(key, out var p) && p.ValueKind == JsonValueKind.String ? p.GetString() : null;
                if (Read(o, "interactionId") != interactionId || Read(i, "version") != Flow6ChatEngine.Version ||
                    Read(i, "role") != role || Read(i, "promptVersion") != promptVersion) continue;
                var text = Read(i, "previousQuestion");
                return text is not null && text.Length <= MaxQuestionLength && !ContainsSecretMarker(text) ? text : null;
            }
            catch (JsonException) { /* Ignore malformed or legacy logs. */ }
        }
        return null;
    }

    private static bool ContainsSecretMarker(string question) => new[] { "api key", "apikey", "api_key", "password", "access token", "bearer ", "connection string", "system prompt", "mật khẩu", "khóa api", "secret", "-----BEGIN" }
        .Any(term => question.Contains(term, StringComparison.OrdinalIgnoreCase));

    private static ForbiddenException Forbidden() => new("ai_chat_role_forbidden", "Only the authenticated Member and Coach accounts can use chat.");
}
