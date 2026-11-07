using System.Globalization;
using System.Data;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using SportHub.Administration.Application.Interfaces;
using SportHub.BuildingBlocks.Abstractions.Audit;
using SportHub.BuildingBlocks.Abstractions.Persistence;
using SportHub.BuildingBlocks.SharedKernel.Errors;
using SportHub.Membership.Domain.Entities;
using SportHub.Scheduling.Catalog.Domain;
using SportHub.Scheduling.Domain.Entities;
using SportHub.Scheduling.Domain.Enums;

namespace SportHub.Administration.Application.Services;

public sealed record ServiceImageItem(string ImageId, string Url, string AltText, int SortOrder, int Width, int Height);
public sealed record ServiceGallery(string Kind, int Id, string Version, string? CoverImageId, IReadOnlyList<ServiceImageItem> Images);
public sealed record SaveServiceGalleryRequest(string Version, string[] ImageIds, string? CoverImageId,
    Dictionary<string, string>? AltTexts = null);

public sealed class ServiceImageService(ISportHubDbContext db, IMediaImageStorage storage,
    IAuditWriter audit, ILogger<ServiceImageService> logger)
{
    public const int MaxPublishedImages = 6;
    public const int MaxPendingImages = 12;

    public Task<IReadOnlyList<ServiceGallery>> ReadBatchAsync(string kind, int[] ids, bool manager, CancellationToken ct)
        => ReadBatchCoreAsync(kind, ids, manager, null, ct);

    public Task<IReadOnlyList<ServiceGallery>> ReadCoachClassesAsync(int[] ids, Guid coachId, CancellationToken ct)
        => ReadBatchCoreAsync("class", ids, false, coachId, ct);

    private async Task<IReadOnlyList<ServiceGallery>> ReadBatchCoreAsync(string kind, int[] ids, bool manager, Guid? coachId, CancellationToken ct)
    {
        ValidateKind(kind);
        if (ids.Length is < 1 or > 100 || ids.Any(x => x <= 0))
            throw new BadRequestException("service_image_ids_invalid", "Choose between 1 and 100 positive service IDs.");
        var requested = ids.Distinct().ToArray();
        await using var transaction = await db.Database.BeginTransactionAsync(IsolationLevel.RepeatableRead, ct);
        // Match /coaches/me/classes. This grants image reads only, never access to class-wide student data.
        var visible = coachId.HasValue
            ? await db.Set<Class>().AsNoTracking().Where(c => requested.Contains(c.ClassId)
                && (c.Status == ClassStatus.Published || c.Status == ClassStatus.InProgress)
                && (c.CoachId == coachId.Value || db.Set<ClassSession>().Any(s => s.ClassId == c.ClassId
                    && s.CoachId == coachId.Value && s.Status != ClassSessionStatus.Cancelled)))
                .Select(c => c.ClassId).ToArrayAsync(ct)
            : await EligibleIdsAsync(kind, requested, manager, ct);
        var galleries = await db.Set<ServiceImageGallery>().AsNoTracking()
            .Where(x => x.Kind == kind && visible.Contains(x.ServiceId)).ToDictionaryAsync(x => x.ServiceId, ct);
        var images = await db.Set<ServiceImageAsset>().AsNoTracking()
            .Where(x => x.Kind == kind && visible.Contains(x.ServiceId) && x.IsPublished)
            .OrderBy(x => x.SortOrder).ToListAsync(ct);
        var result = requested.Where(visible.Contains).Select(id => Map(kind, id, galleries.GetValueOrDefault(id),
            images.Where(x => x.ServiceId == id))).ToArray();
        await transaction.CommitAsync(ct);
        return result;
    }

    public async Task<ServiceGallery> ReadAsync(string kind, int id, bool manager, CancellationToken ct)
        => (await ReadBatchAsync(kind, [id], manager, ct)).SingleOrDefault()
            ?? throw Missing();

    public async Task<ServiceImageItem> UploadAsync(string kind, int id, Guid actor, byte[] bytes,
        string contentType, string? altText, CancellationToken ct)
    {
        ValidateTarget(kind, id);
        ServiceImageValidation.Validate(bytes, contentType);
        var alt = ValidateAltText(altText ?? "");
        StoredMediaImage? uploaded = null;
        await using var transaction = await db.Database.BeginTransactionAsync(ct);
        try
        {
            await LockTargetAsync(kind, id, ct);
            if (await db.Set<ServiceImageAsset>().CountAsync(x => x.Kind == kind && x.ServiceId == id && !x.IsPublished, ct) >= MaxPendingImages)
                throw new ConflictException("service_image_pending_limit", "Save or discard existing uploads before adding more images.");
            var gallery = await db.Set<ServiceImageGallery>().SingleOrDefaultAsync(x => x.Kind == kind && x.ServiceId == id, ct);
            if (gallery is null) db.Set<ServiceImageGallery>().Add(new() { Kind = kind, ServiceId = id });
            uploaded = await storage.UploadAsync(actor, bytes, contentType, ct);
            ValidateStoredImage(uploaded, actor);
            var image = new ServiceImageAsset {
                ImageId = Guid.NewGuid(), Kind = kind, ServiceId = id, UploadedByUserId = actor,
                PublicId = uploaded.PublicId, Url = uploaded.Url, Width = uploaded.Width, Height = uploaded.Height,
                AltText = alt, CreatedAtUtc = DateTime.UtcNow
            };
            db.Set<ServiceImageAsset>().Add(image);
            audit.Write(new(actor, "UPLOAD_SERVICE_IMAGE", TargetName(kind), id.ToString(CultureInfo.InvariantCulture),
                NewValue: JsonSerializer.Serialize(new { image.ImageId, kind, image.Width, image.Height })));
            await db.SaveChangesAsync(ct);
            await transaction.CommitAsync(ct);
            return MapItem(image);
        }
        catch
        {
            await transaction.RollbackAsync(CancellationToken.None);
            await transaction.DisposeAsync();
            // This is an uncommitted upload only. Published assets are removed by the durable queue.
            if (uploaded is not null && IsOwnedPublicId(uploaded.PublicId, actor))
            {
                db.ChangeTracker.Clear();
                using var cleanup = new CancellationTokenSource(TimeSpan.FromSeconds(15));
                try
                {
                    // A lost commit response must never lead to deleting an attached image.
                    if (!await db.Set<ServiceImageAsset>().AnyAsync(x => x.PublicId == uploaded.PublicId, cleanup.Token))
                    {
                        QueueDeletion(uploaded.PublicId, uploaded.Url);
                        await db.SaveChangesAsync(cleanup.Token);
                    }
                }
                catch (Exception ex) { logger.LogWarning("Uncommitted service image cleanup could not be queued: {FailureType}", ex.GetType().Name); }
            }
            throw;
        }
    }

    public async Task<ServiceGallery> PublishAsync(string kind, int id, Guid actor, SaveServiceGalleryRequest request, CancellationToken ct)
    {
        ValidateTarget(kind, id);
        if (!long.TryParse(request.Version, NumberStyles.None, CultureInfo.InvariantCulture, out var version) || version < 0)
            throw new BadRequestException("service_image_version_invalid", "Reload the images before saving.");
        if (request.ImageIds is null || request.ImageIds.Length > MaxPublishedImages)
            throw new BadRequestException("service_image_limit", "Choose one cover and up to five gallery photos.");
        var imageIds = request.ImageIds.Select(ParseImageId).ToArray();
        if (imageIds.Distinct().Count() != imageIds.Length)
            throw new BadRequestException("service_image_duplicate", "Each image can appear only once.");
        var coverId = request.CoverImageId is null ? (Guid?)null : ParseImageId(request.CoverImageId);
        if ((imageIds.Length == 0 && coverId is not null) || (imageIds.Length > 0 && (coverId is null || !imageIds.Contains(coverId.Value))))
            throw new BadRequestException("service_image_cover_invalid", "Choose a cover from the selected images.");
        var altTexts = new Dictionary<Guid, string>();
        foreach (var (key, value) in request.AltTexts ?? [])
        {
            var imageId = ParseImageId(key);
            if (!imageIds.Contains(imageId))
                throw new BadRequestException("service_image_alt_invalid", "Alternative text must belong to a selected image.");
            altTexts[imageId] = ValidateAltText(value);
        }
        await using var transaction = await db.Database.BeginTransactionAsync(ct);
        await LockTargetAsync(kind, id, ct);
        var gallery = await db.Set<ServiceImageGallery>().SingleOrDefaultAsync(x => x.Kind == kind && x.ServiceId == id, ct);
        if ((gallery?.Version ?? 0) != version)
            throw new ConflictException("service_image_version_conflict", "These images changed. Reload them before saving.");
        if (gallery is null)
        {
            gallery = new() { Kind = kind, ServiceId = id };
            db.Set<ServiceImageGallery>().Add(gallery);
        }
        var all = await db.Set<ServiceImageAsset>().Where(x => x.Kind == kind && x.ServiceId == id).ToListAsync(ct);
        var chosen = all.Where(x => imageIds.Contains(x.ImageId)).ToDictionary(x => x.ImageId);
        if (chosen.Count != imageIds.Length)
            throw new BadRequestException("service_image_not_owned", "Use images uploaded for this service.");
        if (chosen.Values.Any(x => !x.IsPublished && x.UploadedByUserId != actor))
            throw new ForbiddenException("service_image_upload_not_owned", "Only the manager who uploaded a pending image can publish it.");
        var before = Map(kind, id, gallery, all.Where(x => x.IsPublished));
        foreach (var removed in all.Where(x => x.IsPublished && !imageIds.Contains(x.ImageId)))
        {
            db.Set<ServiceImageAsset>().Remove(removed);
            QueueDeletion(removed.PublicId, removed.Url);
        }
        for (var i = 0; i < imageIds.Length; i++)
        {
            var image = chosen[imageIds[i]];
            image.IsPublished = true;
            image.SortOrder = i;
            if (altTexts.TryGetValue(image.ImageId, out var text)) image.AltText = text;
        }
        gallery.CoverImageId = coverId;
        gallery.Version++;
        var result = Map(kind, id, gallery, chosen.Values);
        audit.Write(new(actor, "PUBLISH_SERVICE_IMAGES", TargetName(kind), id.ToString(CultureInfo.InvariantCulture),
            OldValue: JsonSerializer.Serialize(before), NewValue: JsonSerializer.Serialize(result)));
        try { await db.SaveChangesAsync(ct); }
        catch (DbUpdateConcurrencyException) { throw new ConflictException("service_image_version_conflict", "These images changed. Reload them before saving."); }
        await transaction.CommitAsync(ct);
        return result;
    }

    public async Task DiscardAsync(string kind, int id, string imageId, Guid actor, CancellationToken ct)
    {
        ValidateTarget(kind, id);
        var parsed = ParseImageId(imageId);
        await using var transaction = await db.Database.BeginTransactionAsync(ct);
        await LockTargetAsync(kind, id, ct);
        var image = await db.Set<ServiceImageAsset>().SingleOrDefaultAsync(x => x.Kind == kind && x.ServiceId == id && x.ImageId == parsed, ct)
            ?? throw new NotFoundException("service_image_not_found", "Image not found.");
        if (image.IsPublished)
            throw new ConflictException("service_image_published", "Remove a published image by saving the gallery.");
        if (image.UploadedByUserId != actor)
            throw new ForbiddenException("service_image_upload_not_owned", "Only the manager who uploaded this image can discard it.");
        db.Set<ServiceImageAsset>().Remove(image);
        QueueDeletion(image.PublicId, image.Url);
        audit.Write(new(actor, "DISCARD_SERVICE_IMAGE", TargetName(kind), id.ToString(CultureInfo.InvariantCulture),
            OldValue: JsonSerializer.Serialize(new { image.ImageId })));
        await db.SaveChangesAsync(ct);
        await transaction.CommitAsync(ct);
    }

    internal async Task LockTargetAsync(string kind, int id, CancellationToken ct)
    {
        // Lock the real service row, including for a legacy service with no gallery row yet.
        // Upload, save, discard and expiry all use this lock so first-save and pending-limit races are serialized.
        var exists = kind switch {
            "membership" => await db.Set<MembershipPackage>().FromSqlInterpolated($"SELECT * FROM membership_packages WHERE package_id = {id} FOR UPDATE").AnyAsync(ct),
            "class" => await db.Set<Class>().FromSqlInterpolated($"SELECT * FROM classes WHERE class_id = {id} FOR UPDATE").AnyAsync(ct),
            "room" => await db.Set<Room>().FromSqlInterpolated($"SELECT * FROM rooms WHERE room_id = {id} FOR UPDATE").AnyAsync(ct),
            _ => false
        };
        if (!exists) throw Missing();
    }

    private async Task<int[]> EligibleIdsAsync(string kind, int[] ids, bool manager, CancellationToken ct)
        => kind switch {
            "membership" => await db.Set<MembershipPackage>().Where(x => ids.Contains(x.PackageId) && (manager || x.IsActive)).Select(x => x.PackageId).ToArrayAsync(ct),
            "class" => await db.Set<Class>().Where(x => ids.Contains(x.ClassId) && (manager ||
                ((x.Status == ClassStatus.Published || x.Status == ClassStatus.InProgress) && x.Sport != null && x.Sport.IsActive)))
                .Select(x => x.ClassId).ToArrayAsync(ct),
            "room" => await db.Set<Room>().Where(x => ids.Contains(x.RoomId) && (manager || (x.IsActive && x.AllowRental &&
                (x.RoomTypeId == null || db.Set<RoomType>().Any(t => t.RoomTypeId == x.RoomTypeId && t.IsActive)))))
                .Select(x => x.RoomId).ToArrayAsync(ct),
            _ => []
        };

    internal void QueueDeletion(string publicId, string url)
        => db.Set<ServiceImageDeletion>().Add(new() { DeletionId = Guid.NewGuid(), PublicId = publicId,
            Url = url, CreatedAtUtc = DateTime.UtcNow, NextAttemptAtUtc = DateTime.UtcNow });

    private static ServiceGallery Map(string kind, int id, ServiceImageGallery? gallery, IEnumerable<ServiceImageAsset> images)
        => new(kind, id, (gallery?.Version ?? 0).ToString(CultureInfo.InvariantCulture), gallery?.CoverImageId?.ToString(),
            images.OrderBy(x => x.SortOrder).Select(MapItem).ToArray());
    private static ServiceImageItem MapItem(ServiceImageAsset image)
        => new(image.ImageId.ToString(), image.Url, image.AltText, image.SortOrder, image.Width, image.Height);
    private static Guid ParseImageId(string value)
        => Guid.TryParseExact(value, "D", out var id) && id != Guid.Empty ? id
            : throw new BadRequestException("service_image_id_invalid", "Choose a valid uploaded image.");
    private static string ValidateAltText(string? value)
    {
        var text = (value ?? "").Trim();
        if (text.Length > 300) throw new BadRequestException("service_image_alt_too_long", "Alternative text must be no longer than 300 characters.");
        return text;
    }
    private static void ValidateTarget(string kind, int id)
    {
        ValidateKind(kind);
        if (id <= 0) throw new BadRequestException("service_image_id_invalid", "Choose a positive service ID.");
    }
    private static void ValidateKind(string kind)
    {
        if (kind is not ("membership" or "class" or "room"))
            throw new BadRequestException("service_image_kind_invalid", "Choose a membership, class or room.");
    }
    private static string TargetName(string kind) => kind switch { "membership" => "MembershipPackage", "class" => "Class", _ => "Room" };
    private static NotFoundException Missing() => new("service_not_found", "Service not found.");
    private static bool IsOwnedPublicId(string publicId, Guid actor)
    {
        var prefix = $"sporthub/media/{actor:N}/";
        return publicId.StartsWith(prefix, StringComparison.Ordinal)
            && Guid.TryParseExact(publicId[prefix.Length..], "N", out _);
    }
    private static void ValidateStoredImage(StoredMediaImage image, Guid actor)
    {
        if (!IsOwnedPublicId(image.PublicId, actor) || !Uri.TryCreate(image.Url, UriKind.Absolute, out var url)
            || url.Scheme != "https" || !url.Host.Equals("res.cloudinary.com", StringComparison.OrdinalIgnoreCase)
            || image.Url.Length > 2048 || image.Width <= 0 || image.Height <= 0 || image.Width > 2560 || image.Height > 2560
            || !(Uri.UnescapeDataString(url.AbsolutePath).Contains('/' + image.PublicId + '.', StringComparison.Ordinal)
                || Uri.UnescapeDataString(url.AbsolutePath).EndsWith('/' + image.PublicId, StringComparison.Ordinal)))
            throw new AppException(503, "service_image_storage_invalid", "Image storage returned invalid image data.");
    }
}
