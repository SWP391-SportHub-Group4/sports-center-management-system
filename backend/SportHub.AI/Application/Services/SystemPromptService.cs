using System.Data.Common;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using SportHub.AI.Application.Interfaces;
using SportHub.AI.Prompts;
using SportHub.BuildingBlocks.Abstractions.Persistence;
using SportHub.BuildingBlocks.SharedKernel.Errors;
using SportHub.BuildingBlocks.SharedKernel.Time;

namespace SportHub.AI.Application.Services;

public sealed record PromptContent(string Title, string Audience, string Category, string Content);
public sealed record PromptRevision(string Title, string Audience, string Category, string Content,
    int Version, DateTime SavedAt, string Author, Guid? AuthorId, string Action);
public sealed record ManagedPromptResponse(string Id, string SourceVersion, string SourceFile, PromptContent? Draft,
    PromptRevision? Active, IReadOnlyList<PromptRevision> History, DateTime CreatedAt, DateTime UpdatedAt, int Revision);
public sealed record SaveSystemPromptRequest(string Title, string Audience, string Category, string Content, int ExpectedRevision);
public sealed record RestoreSystemPromptRequest(int Version, int ExpectedRevision);

public sealed class SystemPromptService(ISportHubDbContext db, IClock clock) : ISystemPromptReader
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);
    private static string RoleFor(string id) => id switch {
        "member-system-prompt" => "Member", "coach-system-prompt" => "Coach",
        _ => throw new BadRequestException("system_prompt_id_invalid", "Only the Member and Coach system prompts can be managed.")
    };
    public static PublishedSystemPrompt DefaultFor(string role) => role switch {
        "Member" => new(SportHubAssistantSystemPrompt.Content, SportHubAssistantSystemPrompt.Version),
        "Coach" => new(CoachAiSystemPrompt.Content, CoachAiSystemPrompt.Version),
        _ => throw new BadRequestException("system_prompt_role_invalid", "Choose Member or Coach.")
    };
    private static PromptRevision? ReadRevision(string? payload) => payload is null ? null : JsonSerializer.Deserialize<PromptRevision>(payload, Json);
    private static List<PromptRevision> History(SystemPrompt row)
    {
        var active = ReadRevision(row.ActivePayload);
        if (active is null) return [];
        return (JsonSerializer.Deserialize<List<PromptRevision>>(row.HistoryPayload, Json) ?? [])
            .Where(r => r.Version < active.Version && r.Action is "Initial" or "Publish" or "Restore")
            .OrderByDescending(r => r.Version).Take(1).ToList();
    }
    private static string ManagedVersion(string role, int version) => $"managed-{role.ToLowerInvariant()}-v{version}";

    // Deliberately not cached: the next chat request sees the last committed publication.
    public async Task<PublishedSystemPrompt> GetPublishedAsync(string role, CancellationToken ct = default)
    {
        var fallback = DefaultFor(role);
        var payload = await db.Set<SystemPrompt>().AsNoTracking().Where(p => p.Audience == role)
            .Select(p => p.ActivePayload).SingleOrDefaultAsync(ct);
        var active = ReadRevision(payload);
        return active is null ? fallback : new(active.Content, ManagedVersion(role, active.Version));
    }

    public async Task<IReadOnlyList<ManagedPromptResponse>> ListAsync(CancellationToken ct = default)
        => (await db.Set<SystemPrompt>().AsNoTracking().OrderByDescending(p => p.CreatedAt).ThenBy(p => p.Id).ToListAsync(ct)).Select(Response).ToList();

    public async Task<ManagedPromptResponse> SaveAsync(string id, SaveSystemPromptRequest request, bool publish, Guid managerId, string author, CancellationToken ct = default)
    {
        var role = RoleFor(id);
        if (request.Audience != role)
            throw new BadRequestException("system_prompt_role_mismatch", "The prompt audience cannot be changed. Edit the other role's prompt instead.");
        if (string.IsNullOrWhiteSpace(request.Title) || request.Title.Trim().Length > 180 ||
            string.IsNullOrWhiteSpace(request.Content) || request.Content.Length > PromptTestChatService.MaxPromptLength ||
            request.Category is not ("Rules" or "Policies" or "Procedures" or "General") || request.ExpectedRevision < 0)
            throw new BadRequestException("system_prompt_invalid", "Provide a title (up to 180 characters), a valid category and prompt content (up to 30,000 characters).");
        var row = await db.Set<SystemPrompt>().SingleOrDefaultAsync(p => p.Id == id, ct);
        if (row is null)
        {
            if (request.ExpectedRevision != 0) throw Conflict();
            row = new SystemPrompt { Id = id, Audience = role, CreatedAt = clock.UtcNow };
            db.Set<SystemPrompt>().Add(row);
        }
        else if (row.Revision != request.ExpectedRevision) throw Conflict();
        var revision = new PromptRevision(request.Title.Trim(), role, request.Category, request.Content,
            row.Revision + 1, clock.UtcNow, author, managerId, publish ? "Publish" : "Draft");
        RecordChange(row, revision, managerId, publish);
        if (publish) { row.ActivePayload = JsonSerializer.Serialize(revision, Json); row.DraftPayload = null; }
        else row.DraftPayload = JsonSerializer.Serialize(new PromptContent(revision.Title, role, revision.Category, revision.Content), Json);
        await SaveChangesAsync(ct);
        return Response(row);
    }

    public async Task<ManagedPromptResponse> RestoreAsync(string id, RestoreSystemPromptRequest request, Guid managerId, string author, CancellationToken ct = default)
    {
        RoleFor(id);
        var row = await db.Set<SystemPrompt>().SingleOrDefaultAsync(p => p.Id == id, ct)
            ?? throw new NotFoundException("system_prompt_not_found", "This prompt no longer exists. Reload the list.");
        if (row.Revision != request.ExpectedRevision) throw Conflict();
        var source = History(row).SingleOrDefault(r => r.Version == request.Version)
            ?? throw new NotFoundException("system_prompt_version_not_found", "This prompt version does not exist.");
        var revision = source with { Version = row.Revision + 1, SavedAt = clock.UtcNow, Author = author, AuthorId = managerId, Action = "Restore" };
        RecordChange(row, revision, managerId, true);
        row.ActivePayload = JsonSerializer.Serialize(revision, Json);
        await SaveChangesAsync(ct);
        return Response(row);
    }

    public async Task DeleteAsync(string id, int expectedRevision, CancellationToken ct = default)
    {
        RoleFor(id);
        var row = await db.Set<SystemPrompt>().SingleOrDefaultAsync(p => p.Id == id, ct)
            ?? throw new NotFoundException("system_prompt_not_found", "This prompt no longer exists. Reload the list.");
        if (row.Revision != expectedRevision) throw Conflict();
        db.Set<SystemPrompt>().Remove(row);
        await SaveChangesAsync(ct);
    }
    private static void RecordChange(SystemPrompt row, PromptRevision revision, Guid managerId, bool publish)
    {
        var previous = ReadRevision(row.ActivePayload);
        var history = publish ? previous is null ? new List<PromptRevision>() : [previous] : History(row);
        row.HistoryPayload = JsonSerializer.Serialize(history, Json);
        row.Revision = revision.Version; row.UpdatedAt = revision.SavedAt; row.UpdatedBy = managerId;
    }
    private static ManagedPromptResponse Response(SystemPrompt row)
    {
        var active = ReadRevision(row.ActivePayload);
        var source = row.Audience == "Coach" ? "CoachAiSystemPrompt.cs" : "SportHubAssistantSystemPrompt.cs";
        return new(row.Id, active is null ? DefaultFor(row.Audience).Version : ManagedVersion(row.Audience, active.Version),
            $"backend/SportHub.AI/Prompts/{source}", row.DraftPayload is null ? null : JsonSerializer.Deserialize<PromptContent>(row.DraftPayload, Json),
            active, History(row), row.CreatedAt, row.UpdatedAt, row.Revision);
    }
    private static ConflictException Conflict() => new("system_prompt_conflict", "Another manager changed this prompt. Keep your edits, reload the latest version and review before saving again.");
    private async Task SaveChangesAsync(CancellationToken ct)
    {
        try { await db.SaveChangesAsync(ct); }
        catch (DbUpdateConcurrencyException) { throw Conflict(); }
        catch (DbUpdateException ex) when (ex.InnerException is DbException { SqlState: "23505" }) { throw Conflict(); }
    }
}
