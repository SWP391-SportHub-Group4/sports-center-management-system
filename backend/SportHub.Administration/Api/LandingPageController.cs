using System.Text.Json;
using System.Text.RegularExpressions;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SportHub.BuildingBlocks.Api;
using SportHub.BuildingBlocks.Abstractions.Persistence;
using SportHub.BuildingBlocks.Abstractions.Audit;
using SportHub.BuildingBlocks.SharedKernel.Errors;
using SportHub.BuildingBlocks.SharedKernel.Time;

namespace SportHub.Administration.Api;

public sealed record LandingPageDocument(Guid Revision, Dictionary<string, string> Values, DateTime? UpdatedAt);

[ApiController]
[Route("api/landing-page")]
public sealed class LandingPageController(ISportHubDbContext db, IAuditWriter audit, IClock clock) : ControllerBase
{
    private static readonly Regex KeyPattern = new(@"^(hero|gallery|bookmarks|arena|booking|faq)\.[a-zA-Z0-9_.]{1,120}$", RegexOptions.Compiled);

    [HttpGet]
    [AllowAnonymous]
    [ResponseCache(NoStore = true, Location = ResponseCacheLocation.None)]
    public async Task<IActionResult> Get(CancellationToken ct)
    {
        var row = await db.Set<LandingPageContent>().AsNoTracking().SingleOrDefaultAsync(ct);
        return Ok(row is null ? new LandingPageDocument(Guid.Empty, [], null) : Document(row));
    }

    [HttpPut]
    [Authorize(Policy = SportHubPolicies.CenterManager)]
    [RequestSizeLimit(256 * 1024)]
    public async Task<IActionResult> Update([FromBody] LandingPageDocument request, CancellationToken ct)
    {
        if (request.Values is null || request.Values.Count > 300)
            throw new BadRequestException("invalid_landing_content", "Provide no more than 300 content fields.");
        foreach (var (key, value) in request.Values)
        {
            if (!KeyPattern.IsMatch(key) || key.Split('.').Any(x => x is "__proto__" or "constructor" or "prototype" or "href" or "id" or "suffix")
                || value is null || string.IsNullOrWhiteSpace(value) || value.Length > 2000)
                throw new BadRequestException("invalid_landing_content", "Content fields must contain between 1 and 2,000 characters.");
            if ((key.EndsWith(".image") || key.EndsWith(".src")) && !ValidImage(value))
                throw new BadRequestException("invalid_landing_image", "Use an HTTPS image URL or a local /sporthub/ image path.");
        }

        // Serialize the first insert as well as updates; stale editors cannot overwrite another manager's changes.
        await using var transaction = await db.Database.BeginTransactionAsync(ct);
        await db.Database.ExecuteSqlRawAsync("SELECT pg_advisory_xact_lock(105, 73)", ct);
        var row = await db.Set<LandingPageContent>().SingleOrDefaultAsync(ct);
        if ((row?.Revision ?? Guid.Empty) != request.Revision)
            throw new ConflictException("landing_content_changed", "Another Manager updated this page. Reload the latest content before saving.");
        if (row is null) { row = new LandingPageContent(); db.Set<LandingPageContent>().Add(row); }
        var previous = row.ValuesJson;
        row.ValuesJson = JsonSerializer.Serialize(request.Values);
        row.Revision = Guid.NewGuid();
        row.UpdatedAt = clock.UtcNow;
        audit.Write(new AuditEntry(User.RequireUserId(), "UPDATE_LANDING_PAGE", nameof(LandingPageContent), "1",
            OldValue: previous, NewValue: row.ValuesJson));
        await db.SaveChangesAsync(ct);
        await transaction.CommitAsync(ct);
        return Ok(Document(row));
    }

    private static bool ValidImage(string value) => value.StartsWith("/sporthub/", StringComparison.Ordinal)
        ? !value.Contains("..") && !value.Contains('\\') && !value.Any(char.IsControl)
        : Uri.TryCreate(value, UriKind.Absolute, out var uri) && uri.Scheme == "https" && string.IsNullOrEmpty(uri.UserInfo);

    private static LandingPageDocument Document(LandingPageContent row)
        => new(row.Revision, JsonSerializer.Deserialize<Dictionary<string, string>>(row.ValuesJson) ?? [], row.UpdatedAt);
}
