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
    public static readonly string[] Categories = ["Rules", "Policies", "Procedures", "General", "Api"];
    public static readonly string[] Roles = ["Coach", "Member"];

    public static string PromptId(string role, string category)
        => $"{role.ToLowerInvariant()}-{category.ToLowerInvariant()}-prompt";

    private static (string Role, string Category) IdentityFor(string id)
    {
        foreach (var role in Roles)
        foreach (var category in Categories)
            if (id == PromptId(role, category)) return (role, category);
        throw new BadRequestException("system_prompt_id_invalid",
            "Choose an existing Coach or Member prompt category.");
    }

    public static PublishedSystemPrompt DefaultFor(string role) => role switch
    {
        "Member" => new(SportHubAssistantSystemPrompt.Content, SportHubAssistantSystemPrompt.Version),
        "Coach" => new(CoachAiSystemPrompt.Content, CoachAiSystemPrompt.Version),
        _ => throw new BadRequestException("system_prompt_role_invalid", "Choose Member or Coach.")
    };

    private static PromptRevision? ReadRevision(string? payload) =>
        payload is null ? null : JsonSerializer.Deserialize<PromptRevision>(payload, Json);

    private static List<PromptRevision> History(SystemPrompt row)
    {
        var active = ReadRevision(row.ActivePayload);
        if (active is null) return [];
        return (JsonSerializer.Deserialize<List<PromptRevision>>(row.HistoryPayload, Json) ?? [])
            .Where(r => r.Version < active.Version && r.Action is "Initial" or "Publish" or "Restore")
            .OrderByDescending(r => r.Version).Take(1).ToList();
    }

    // The next chat request sees all committed publications, in a deterministic order.
    // Built-in rules remain present even if a Manager publishes only one category.
    public async Task<PublishedSystemPrompt> GetPublishedAsync(string role, CancellationToken ct = default)
    {
        if (!Roles.Contains(role)) throw new BadRequestException("system_prompt_role_invalid", "Choose Member or Coach.");
        var fallback = DefaultFor(role);
        var rows = await db.Set<SystemPrompt>().AsNoTracking().Where(p => p.Audience == role)
            .Select(p => new { p.Id, p.ActivePayload }).ToListAsync(ct);
        var parts = new List<string> { fallback.Content };
        var versions = new List<string> { fallback.Version };
        foreach (var category in Categories)
        {
            var row = rows.SingleOrDefault(p => p.Id == PromptId(role, category));
            var active = ReadRevision(row?.ActivePayload);
            if (active is null || string.IsNullOrWhiteSpace(active.Content)) continue;
            parts.Add($"\n\n=== {category.ToUpperInvariant()} : {role.ToUpperInvariant()} ===\n{active.Content}");
            versions.Add($"{category}:{active.Version}:{row!.Id}");
        }
        var digest = Convert.ToHexString(System.Security.Cryptography.SHA256.HashData(
            System.Text.Encoding.UTF8.GetBytes(string.Join("|", versions))))[..16];
        return new PublishedSystemPrompt(string.Join("\n", parts), $"managed-{role.ToLowerInvariant()}-{digest}");
    }

    // The editor displays 10 independent slots, even when a category is not yet saved.
    public async Task<IReadOnlyList<ManagedPromptResponse>> ListAsync(CancellationToken ct = default)
    {
        var rows = await db.Set<SystemPrompt>().AsNoTracking().ToListAsync(ct);
        var result = new List<ManagedPromptResponse>();
        foreach (var role in Roles)
        foreach (var category in Categories)
        {
            var id = PromptId(role, category);
            var row = rows.SingleOrDefault(x => x.Id == id);
            if (row is not null) result.Add(Response(row));
            else result.Add(new ManagedPromptResponse(id, DefaultFor(role).Version,
                "Manager AI Knowledge", new PromptContent($"{role} {category} prompt", role, category, ""),
                null, [], DateTime.UnixEpoch, DateTime.UnixEpoch, 0));
        }
        return result;
    }

    public async Task<ManagedPromptResponse> SaveAsync(string id, SaveSystemPromptRequest request, bool publish,
        Guid managerId, string author, CancellationToken ct = default)
    {
        var (role, category) = IdentityFor(id);
        if (request.Audience != role || request.Category != category)
            throw new BadRequestException("system_prompt_category_mismatch",
                "The role and category are fixed. Open the corresponding prompt instead.");
        if (string.IsNullOrWhiteSpace(request.Title) || request.Title.Trim().Length > 180 ||
            string.IsNullOrWhiteSpace(request.Content) || request.Content.Length > PromptTestChatService.MaxPromptLength ||
            request.ExpectedRevision < 0)
            throw new BadRequestException("system_prompt_invalid",
                "Provide a title and prompt content up to 30,000 characters.");
        var row = await db.Set<SystemPrompt>().SingleOrDefaultAsync(p => p.Id == id, ct);
        if (row is null)
        {
            if (request.ExpectedRevision != 0) throw Conflict();
            row = new SystemPrompt { Id = id, Audience = role, CreatedAt = clock.UtcNow };
            db.Set<SystemPrompt>().Add(row);
        }
        else if (row.Revision != request.ExpectedRevision) throw Conflict();
        var revision = new PromptRevision(request.Title.Trim(), role, category, request.Content,
            row.Revision + 1, clock.UtcNow, author, managerId, publish ? "Publish" : "Draft");
        RecordChange(row, revision, managerId, publish);
        if (publish) { row.ActivePayload = JsonSerializer.Serialize(revision, Json); row.DraftPayload = null; }
        else row.DraftPayload = JsonSerializer.Serialize(new PromptContent(revision.Title, role, category, revision.Content), Json);
        await SaveChangesAsync(ct);
        return Response(row);
    }

    public async Task<ManagedPromptResponse> RestoreAsync(string id, RestoreSystemPromptRequest request,
        Guid managerId, string author, CancellationToken ct = default)
    {
        IdentityFor(id);
        var row = await db.Set<SystemPrompt>().SingleOrDefaultAsync(p => p.Id == id, ct)
            ?? throw new NotFoundException("system_prompt_not_found", "This prompt no longer exists. Reload the list.");
        if (row.Revision != request.ExpectedRevision) throw Conflict();
        var source = History(row).SingleOrDefault(r => r.Version == request.Version)
            ?? throw new NotFoundException("system_prompt_version_not_found", "This prompt version does not exist.");
        var revision = source with { Version = row.Revision + 1, SavedAt = clock.UtcNow,
            Author = author, AuthorId = managerId, Action = "Restore" };
        RecordChange(row, revision, managerId, true);
        row.ActivePayload = JsonSerializer.Serialize(revision, Json);
        await SaveChangesAsync(ct);
        return Response(row);
    }

    public async Task DeleteAsync(string id, int expectedRevision, CancellationToken ct = default)
    {
        IdentityFor(id);
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
        row.Revision = revision.Version;
        row.UpdatedAt = revision.SavedAt;
        row.UpdatedBy = managerId;
    }

    private static ManagedPromptResponse Response(SystemPrompt row)
    {
        var (role, _) = IdentityFor(row.Id);
        var active = ReadRevision(row.ActivePayload);
        return new ManagedPromptResponse(row.Id,
            active is null ? DefaultFor(role).Version : $"{row.Id}-v{active.Version}",
            "Manager AI Knowledge", row.DraftPayload is null ? null :
            JsonSerializer.Deserialize<PromptContent>(row.DraftPayload, Json),
            active, History(row), row.CreatedAt, row.UpdatedAt, row.Revision);
    }

    private static ConflictException Conflict() => new("system_prompt_conflict",
        "Another manager changed this prompt. Reload the latest version before saving again.");

    private async Task SaveChangesAsync(CancellationToken ct)
    {
        try { await db.SaveChangesAsync(ct); }
        catch (DbUpdateConcurrencyException) { throw Conflict(); }
        catch (DbUpdateException ex) when (ex.InnerException is DbException { SqlState: "23505" }) { throw Conflict(); }
    }
}
