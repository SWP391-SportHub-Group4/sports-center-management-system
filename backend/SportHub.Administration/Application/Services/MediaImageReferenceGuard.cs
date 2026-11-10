using System.Text.Json;
using System.Text.RegularExpressions;
using Microsoft.EntityFrameworkCore;
using SportHub.BuildingBlocks.Abstractions.Media;
using SportHub.BuildingBlocks.Abstractions.Persistence;
using SportHub.BuildingBlocks.SharedKernel.Errors;

namespace SportHub.Administration.Application.Services;

public sealed class MediaImageReferenceGuard(ISportHubDbContext db) : IMediaImageReferenceGuard
{
    private static readonly Regex ManagedId = new(@"(?:^|/)(sporthub/media/[a-f0-9]{32}/[a-f0-9]{32})(?=\.|$)", RegexOptions.Compiled);

    public async Task ProtectAttachmentsAsync(IEnumerable<string?> candidateValues, IEnumerable<string?> existingValues, CancellationToken ct = default)
    {
        await AcquireLockAsync(db, ct);
        var existing = PublicIds(existingValues);
        var attaching = PublicIds(candidateValues).Except(existing).ToArray();
        // Completed deletions remain as tombstones: a writer waiting behind cleanup must not reattach its deleted URL.
        if (attaching.Length > 0 && await db.Set<ServiceImageDeletion>().AnyAsync(x => attaching.Contains(x.PublicId), ct))
            throw new ConflictException("media_image_retired", "This image has been removed from its service. Upload a new image before attaching it here.");
    }

    internal static Task AcquireLockAsync(ISportHubDbContext db, CancellationToken ct)
    {
        if (db.Database.CurrentTransaction is null) throw new InvalidOperationException("Image reference changes require a transaction.");
        return db.Database.ExecuteSqlRawAsync("SELECT pg_advisory_xact_lock(105, 74)", ct);
    }

    internal static HashSet<string> PublicIds(IEnumerable<string?> values)
    {
        var ids = new HashSet<string>(StringComparer.Ordinal);
        foreach (var value in values) AddValue(value, ids);
        return ids;
    }

    private static void AddValue(string? value, HashSet<string> ids)
    {
        if (string.IsNullOrWhiteSpace(value)) return;
        if (Uri.TryCreate(value, UriKind.Absolute, out var url) && url.Host.Equals("res.cloudinary.com", StringComparison.OrdinalIgnoreCase))
        {
            var match = ManagedId.Match(Uri.UnescapeDataString(url.AbsolutePath));
            if (match.Success) ids.Add(match.Groups[1].Value);
            return;
        }
        if (value.TrimStart().StartsWith('[') || value.TrimStart().StartsWith('{'))
        {
            try { using var json = JsonDocument.Parse(value); AddElement(json.RootElement, ids); }
            catch (JsonException) { /* Ordinary editorial text need not be JSON. */ }
        }
    }

    private static void AddElement(JsonElement element, HashSet<string> ids)
    {
        if (element.ValueKind == JsonValueKind.String) AddValue(element.GetString(), ids);
        else if (element.ValueKind == JsonValueKind.Array) foreach (var item in element.EnumerateArray()) AddElement(item, ids);
        else if (element.ValueKind == JsonValueKind.Object) foreach (var property in element.EnumerateObject()) AddElement(property.Value, ids);
    }
}
