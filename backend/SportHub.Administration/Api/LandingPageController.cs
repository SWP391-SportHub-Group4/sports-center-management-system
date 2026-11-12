using System.Text.Json;
using System.Text.RegularExpressions;
using System.Globalization;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SportHub.BuildingBlocks.Api;
using SportHub.BuildingBlocks.Abstractions.Persistence;
using SportHub.BuildingBlocks.Abstractions.Audit;
using SportHub.BuildingBlocks.SharedKernel.Errors;
using SportHub.BuildingBlocks.SharedKernel.Time;
using SportHub.Identity.Domain.Entities;
using SportHub.Identity.Domain.Enums;

namespace SportHub.Administration.Api;

public sealed record LandingPageDocument(Guid Revision, Dictionary<string, string> Values, DateTime? UpdatedAt);

[ApiController]
[Route("api/landing-page")]
public sealed class LandingPageController(ISportHubDbContext db, IAuditWriter audit, IClock clock) : ControllerBase
{
    private static readonly Regex KeyPattern = new(@"^((hero|gallery|bookmarks|arena|booking|faq)\.[a-zA-Z0-9_.]{1,120}|brand\.logo\.image)$", RegexOptions.Compiled);
    private static readonly Regex LegacyGalleryCaption = new(@"^gallery\.photos\.[0-9]+\.(en|vi)$", RegexOptions.Compiled);
    private static readonly Regex SportGalleryImage = new(@"^gallery\.sports\.[1-9][0-9]*\.image$", RegexOptions.Compiled);

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
        // Old editorial captions no longer own sport names. Retain existing image overrides.
        var values = request.Values.Where(pair => !pair.Key.StartsWith("bookmarks.0.items.", StringComparison.Ordinal)
            && !LegacyGalleryCaption.IsMatch(pair.Key)).ToDictionary(pair => pair.Key, pair => pair.Value);
        var coachIds = values.GetValueOrDefault("bookmarks.coachIds")?.Split(',') ?? [];
        if (coachIds.Length != 3 || coachIds.Any(id => !Guid.TryParse(id, out _))
            || coachIds.Select(Guid.Parse).Distinct().Count() != 3)
            throw new BadRequestException("featured_coaches_required", "Select exactly three different active Coaches before publishing.");
        var featuredIds = coachIds.Select(Guid.Parse).ToArray();
        values["bookmarks.coachIds"] = string.Join(',', featuredIds.Select(id => id.ToString()));
        foreach (var (key, value) in values)
        {
            if (key.StartsWith("gallery.sports.", StringComparison.Ordinal) && !SportGalleryImage.IsMatch(key))
                throw new BadRequestException("gallery_sport_name_read_only", "Gallery sport names come from the Sports catalog. Only the gallery image can be changed here.");
            if (!KeyPattern.IsMatch(key) || key.Split('.').Any(x => x is "__proto__" or "constructor" or "prototype" or "href" or "id" or "suffix")
                || value is null || string.IsNullOrWhiteSpace(value) || value.Length > 2000)
                throw new BadRequestException("invalid_landing_content", "Content fields must contain between 1 and 2,000 characters.");
            if ((key.EndsWith(".image") || key.EndsWith(".src")) && !ValidImage(value))
                throw new BadRequestException("invalid_landing_image", "Use an HTTPS image URL or a local /sporthub/ image path.");
            if ((key is "hero.background.webm" or "hero.background.mp4")
                && (!ValidImage(value) || !value.Split('?', '#')[0].EndsWith(key.EndsWith("webm") ? ".webm" : ".mp4", StringComparison.OrdinalIgnoreCase)))
                throw new BadRequestException("invalid_landing_video", "Use a valid HTTPS video URL or a local /sporthub/ video path with the matching format.");
            if (key == "hero.background.playlist") ValidatePlaylist(value);
            if (key.StartsWith("bookmarks.coachFrame.", StringComparison.Ordinal))
            {
                var parts = key.Split('.');
                if (parts.Length != 4 || !Guid.TryParseExact(parts[2], "N", out _)
                    || (parts[3] == "fit" ? value is not ("contain" or "cover")
                    : !new[] { "x", "y", "zoom" }.Contains(parts[3])
                        || !decimal.TryParse(value, NumberStyles.AllowDecimalPoint, CultureInfo.InvariantCulture, out var number)
                        || (parts[3] == "zoom" ? number < 1 || number > 2 : number < 0 || number > 100)))
                    throw new BadRequestException("invalid_coach_image_frame", "Image framing must use a valid Coach ID, fit mode, position (0–100) and zoom (1–2).");
            }
        }

        // Serialize the first insert as well as updates; stale editors cannot overwrite another manager's changes.
        await using var transaction = await db.Database.BeginTransactionAsync(ct);
        await db.Database.ExecuteSqlRawAsync("SELECT pg_advisory_xact_lock(105, 73)", ct);
        var row = await db.Set<LandingPageContent>().SingleOrDefaultAsync(ct);
        if ((row?.Revision ?? Guid.Empty) != request.Revision)
            throw new ConflictException("landing_content_changed", "Another Manager updated this page. Reload the latest content before saving.");
        var eligibleCount = await db.Set<UserAccount>().AsNoTracking().CountAsync(user => featuredIds.Contains(user.UserId)
            && user.Status == UserStatus.Active && user.Role != null && user.Role.RoleName == UserRole.Coach && user.Profile != null, ct);
        if (eligibleCount != 3)
            throw new ConflictException("featured_coach_unavailable", "A selected Coach is no longer available. Reload the Coach list and choose a replacement.");
        if (row is null) { row = new LandingPageContent(); db.Set<LandingPageContent>().Add(row); }
        var previous = row.ValuesJson;
        row.ValuesJson = JsonSerializer.Serialize(values);
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

    private static void ValidatePlaylist(string value)
    {
        try
        {
            using var json = JsonDocument.Parse(value);
            var list = json.RootElement;
            if (list.ValueKind != JsonValueKind.Array || list.GetArrayLength() is < 1 or > 3) throw new JsonException();
            foreach (var item in list.EnumerateArray())
            {
                if (item.ValueKind != JsonValueKind.Object
                    || !item.TryGetProperty("url", out var url) || url.ValueKind != JsonValueKind.String
                    || !item.TryGetProperty("poster", out var poster) || poster.ValueKind != JsonValueKind.String
                    || !item.TryGetProperty("name", out var name) || name.ValueKind != JsonValueKind.String
                    || string.IsNullOrWhiteSpace(name.GetString()) || name.GetString()!.Length > 120
                    || !ValidImage(url.GetString()!) || !url.GetString()!.Split('?', '#')[0].EndsWith(".webm", StringComparison.OrdinalIgnoreCase)
                    || !ValidImage(poster.GetString()!)) throw new JsonException();
            }
        }
        catch (JsonException) { throw new BadRequestException("invalid_hero_playlist", "Choose between one and three WebM videos with valid poster images."); }
    }

    private static LandingPageDocument Document(LandingPageContent row)
        => new(row.Revision, (JsonSerializer.Deserialize<Dictionary<string, string>>(row.ValuesJson) ?? [])
            .Where(pair => !LegacyGalleryCaption.IsMatch(pair.Key)).ToDictionary(pair => pair.Key, pair => pair.Value), row.UpdatedAt);
}
