using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using SportHub.Administration.Application.Interfaces;
using SportHub.BuildingBlocks.Abstractions.Persistence;
using SportHub.BuildingBlocks.SharedKernel.Errors;
using SportHub.Membership.Domain.Entities;
using SportHub.Scheduling.Catalog.Domain;
using SportHub.Scheduling.Domain.Entities;

namespace SportHub.Administration.Application.Services;

public sealed class ServiceImageCleanupService(ISportHubDbContext db, ServiceImageService galleries,
    IMediaImageStorage storage, ILogger<ServiceImageCleanupService> logger)
{
    public async Task ProcessAsync(CancellationToken ct)
    {
        await RemoveOrphanedGalleriesAsync(ct);
        var expiry = DateTime.UtcNow.AddHours(-24);
        var expired = await db.Set<ServiceImageAsset>().AsNoTracking()
            .Where(x => !x.IsPublished && x.CreatedAtUtc < expiry).OrderBy(x => x.CreatedAtUtc)
            .Take(50).Select(x => new { x.ImageId, x.Kind, x.ServiceId }).ToListAsync(ct);
        foreach (var candidate in expired)
        {
            await using var transaction = await db.Database.BeginTransactionAsync(ct);
            try
            {
                try { await galleries.LockTargetAsync(candidate.Kind, candidate.ServiceId, ct); }
                catch (NotFoundException) { /* No editor can publish to a deleted service. */ }
                var image = await db.Set<ServiceImageAsset>().SingleOrDefaultAsync(x => x.ImageId == candidate.ImageId, ct);
                if (image is not null && !image.IsPublished && image.CreatedAtUtc < expiry)
                {
                    galleries.QueueDeletion(image.PublicId, image.Url);
                    db.Set<ServiceImageAsset>().Remove(image);
                    await db.SaveChangesAsync(ct);
                }
                await transaction.CommitAsync(ct);
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                await transaction.RollbackAsync(ct);
                logger.LogWarning("Expired service image cleanup will retry: {FailureType}", ex.GetType().Name);
            }
            finally { db.ChangeTracker.Clear(); }
        }

        var now = DateTime.UtcNow;
        var pending = await db.Set<ServiceImageDeletion>().AsNoTracking().Where(x => x.CompletedAtUtc == null && x.NextAttemptAtUtc <= now)
            .OrderBy(x => x.CreatedAtUtc).Take(50).Select(x => x.DeletionId).ToListAsync(ct);
        foreach (var deletionId in pending)
        {
            await using var transaction = await db.Database.BeginTransactionAsync(ct);
            try
            {
                // Sport/landing writers hold this same lock through commit. A deletion cannot pass their new attachment.
                await MediaImageReferenceGuard.AcquireLockAsync(db, ct);
                var deletion = await db.Set<ServiceImageDeletion>().SingleOrDefaultAsync(x => x.DeletionId == deletionId, ct);
                if (deletion is not null && deletion.CompletedAtUtc is null && deletion.NextAttemptAtUtc <= now)
                {
                    if (await db.Set<ServiceImageAsset>().AnyAsync(x => x.PublicId == deletion.PublicId || x.Url == deletion.Url, ct)
                        || await SportReferencesAsync(deletion, ct) || await LandingReferencesAsync(deletion, ct))
                        deletion.NextAttemptAtUtc = now.AddHours(24);
                    else
                    {
                        try
                        {
                            await storage.DeleteAsync(deletion.PublicId, ct);
                            deletion.CompletedAtUtc = DateTime.UtcNow;
                        }
                        catch (Exception ex) when (ex is not OperationCanceledException)
                        {
                            deletion.Attempts++;
                            deletion.NextAttemptAtUtc = now.AddMinutes(Math.Min(1440, Math.Pow(2, Math.Min(deletion.Attempts, 10))));
                            logger.LogWarning("Service image deletion will retry: {FailureType}", ex.GetType().Name);
                        }
                    }
                    await db.SaveChangesAsync(ct);
                }
                await transaction.CommitAsync(ct);
            }
            catch (DbUpdateConcurrencyException) { await transaction.RollbackAsync(ct); db.ChangeTracker.Clear(); }
        }
    }

    private async Task RemoveOrphanedGalleriesAsync(CancellationToken ct)
    {
        // Rooms can be physically removed before any bookings exist. Gallery storage must not outlive a deleted owner.
        var orphaned = await db.Set<ServiceImageGallery>().Where(x =>
                (x.Kind == "membership" && !db.Set<MembershipPackage>().Any(p => p.PackageId == x.ServiceId))
                || (x.Kind == "class" && !db.Set<Class>().Any(c => c.ClassId == x.ServiceId))
                || (x.Kind == "room" && !db.Set<Room>().Any(r => r.RoomId == x.ServiceId)))
            .Take(50).ToListAsync(ct);
        foreach (var gallery in orphaned)
        {
            await using var transaction = await db.Database.BeginTransactionAsync(ct);
            try
            {
                var exists = true;
                try { await galleries.LockTargetAsync(gallery.Kind, gallery.ServiceId, ct); }
                catch (NotFoundException) { exists = false; }
                if (!exists)
                {
                    var assets = await db.Set<ServiceImageAsset>().Where(x => x.Kind == gallery.Kind && x.ServiceId == gallery.ServiceId).ToListAsync(ct);
                    foreach (var asset in assets) galleries.QueueDeletion(asset.PublicId, asset.Url);
                    db.Set<ServiceImageAsset>().RemoveRange(assets);
                    db.Set<ServiceImageGallery>().Remove(gallery);
                    await db.SaveChangesAsync(ct);
                }
                await transaction.CommitAsync(ct);
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                await transaction.RollbackAsync(ct);
                logger.LogWarning("Orphaned service image cleanup will retry: {FailureType}", ex.GetType().Name);
            }
            finally { db.ChangeTracker.Clear(); }
        }
    }

    private async Task<bool> SportReferencesAsync(ServiceImageDeletion deletion, CancellationToken ct)
    {
        var urls = await db.Set<Sport>().AsNoTracking().Where(x => x.ImageUrl != null).Select(x => x.ImageUrl).ToListAsync(ct);
        return urls.Any(url => References(url, deletion));
    }

    private async Task<bool> LandingReferencesAsync(ServiceImageDeletion deletion, CancellationToken ct)
    {
        var values = await db.Set<LandingPageContent>().AsNoTracking().Select(x => x.ValuesJson).ToListAsync(ct);
        foreach (var json in values)
        {
            using var document = JsonDocument.Parse(json);
            if (ContainsUrl(document.RootElement, deletion) || MediaImageReferenceGuard.PublicIds([json]).Contains(deletion.PublicId)) return true;
        }
        return false;
    }

    private static bool ContainsUrl(JsonElement element, ServiceImageDeletion deletion)
        => element.ValueKind switch {
            JsonValueKind.String => References(element.GetString(), deletion),
            JsonValueKind.Array => element.EnumerateArray().Any(x => ContainsUrl(x, deletion)),
            JsonValueKind.Object => element.EnumerateObject().Any(x => ContainsUrl(x.Value, deletion)),
            _ => false
        };

    private static bool References(string? value, ServiceImageDeletion deletion)
    {
        if (value == deletion.Url) return true;
        if (!Uri.TryCreate(value, UriKind.Absolute, out var url)
            || !url.Host.Equals("res.cloudinary.com", StringComparison.OrdinalIgnoreCase)) return false;
        var path = Uri.UnescapeDataString(url.AbsolutePath);
        return path.Contains('/' + deletion.PublicId + '.', StringComparison.Ordinal)
            || path.EndsWith('/' + deletion.PublicId, StringComparison.Ordinal);
    }
}
