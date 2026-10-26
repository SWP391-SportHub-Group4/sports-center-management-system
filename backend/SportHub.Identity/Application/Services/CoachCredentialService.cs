using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using SportHub.BuildingBlocks.Abstractions.Audit;
using SportHub.BuildingBlocks.Abstractions.Persistence;
using SportHub.BuildingBlocks.SharedKernel.Errors;
using SportHub.BuildingBlocks.SharedKernel.Time;
using SportHub.BuildingBlocks.Api;
using SportHub.Identity.Application.Interfaces;
using SportHub.Identity.Domain.Entities;
using SportHub.Identity.Domain.Enums;

namespace SportHub.Identity.Application.Services;

public sealed record CoachCredentialResponse(Guid CredentialId, [property: WireEnum] string Kind, string Title,
    string? Issuer, DateOnly? IssuedOn, string FileName, string FileUrl, string ContentType, long SizeBytes,
    bool IsPublished, int Version, DateTime CreatedAtUtc, string? ContentUrl = null);

public sealed record CoachCredentialFile(byte[] Content, string FileName, string ContentType);

public sealed class CoachCredentialService(ISportHubDbContext db, ICoachCredentialStorage storage,
    IAuditWriter audit, IClock clock, ILogger<CoachCredentialService> logger)
{
    public const int MaxUploadBytes = 10 * 1024 * 1024;
    public const int MaxDocuments = 20;
    private static CoachCredentialResponse Response(CoachCredential c) => new(c.CredentialId, c.Kind.ToString(), c.Title,
        c.Issuer, c.IssuedOn, c.FileName, c.FileUrl, c.ContentType, c.SizeBytes, c.IsPublished, c.Version, c.CreatedAtUtc,
        c.ContentType == "application/pdf" ? $"/api/coaches/{c.CoachUserId:D}/credentials/{c.CredentialId:D}/file" : null);

    public async Task<IReadOnlyList<CoachCredentialResponse>> ListAsync(Guid coachId, bool mine, CancellationToken ct)
    {
        await RequireCoachAsync(coachId, ct);
        return (await db.Set<CoachCredential>().AsNoTracking().Where(c => c.CoachUserId == coachId
            && c.DeletedAtUtc == null && (mine || c.IsPublished))
            .OrderByDescending(c => c.IssuedOn).ThenByDescending(c => c.CreatedAtUtc).ThenBy(c => c.CredentialId)
            .ToListAsync(ct)).Select(Response).ToList();
    }

    public async Task<CoachCredentialFile> ReadPdfAsync(Guid coachId, Guid credentialId, Guid? viewerUserId, CancellationToken ct)
    {
        await RequireCoachAsync(coachId, ct);
        var owner = viewerUserId == coachId;
        var row = await db.Set<CoachCredential>().AsNoTracking()
            .SingleOrDefaultAsync(c => c.CoachUserId == coachId && c.CredentialId == credentialId
                && c.DeletedAtUtc == null && c.ContentType == "application/pdf" && (c.IsPublished || owner), ct)
            ?? throw new NotFoundException("credential_not_found", "Document not found.");
        var content = await storage.DownloadPdfAsync(row.FilePublicId, ct);
        return new(content, row.FileName, "application/pdf");
    }

    public async Task<CoachCredentialResponse> UploadAsync(Guid coachId, string kind, string title, string? issuer,
        DateOnly? issuedOn, bool published, byte[] bytes, string contentType, string fileName, CancellationToken ct)
    {
        await RequireCoachAsync(coachId, ct);
        var metadata = Metadata(kind, title, issuer, issuedOn);
        ValidateFile(bytes, contentType);
        if (await db.Set<CoachCredential>().CountAsync(c => c.CoachUserId == coachId && c.DeletedAtUtc == null, ct) >= MaxDocuments)
            throw new ConflictException("credential_limit_reached", "You can keep up to 20 documents. Remove one before adding another.");
        var id = Guid.NewGuid();
        var uploaded = await storage.UploadAsync(coachId, id, bytes, contentType, ct);
        var saved = false;
        try
        {
            await using var tx = await db.Database.BeginTransactionAsync(ct);
            // Only serialize the short database write, never the network upload.
            await db.Database.ExecuteSqlInterpolatedAsync($"SELECT pg_advisory_xact_lock(hashtextextended({$"coach-credentials:{coachId}"}, 0))", ct);
            await RequireCoachAsync(coachId, ct);
            if (await db.Set<CoachCredential>().CountAsync(c => c.CoachUserId == coachId && c.DeletedAtUtc == null, ct) >= MaxDocuments)
                throw new ConflictException("credential_limit_reached", "You can keep up to 20 documents. Remove one before adding another.");
            var cleanName = new string(fileName.Replace('\\', '/').Split('/').Last().Where(c => !char.IsControl(c)).Take(180).ToArray());
            var row = new CoachCredential { CredentialId = id, CoachUserId = coachId, Kind = metadata.Kind, Title = metadata.Title,
                Issuer = metadata.Issuer, IssuedOn = issuedOn, IsPublished = published, FileName = cleanName.Length > 0 ? cleanName : "Document",
                FileUrl = uploaded.Url, FilePublicId = uploaded.PublicId, ContentType = contentType, SizeBytes = bytes.Length,
                CreatedAtUtc = clock.UtcNow, UpdatedAtUtc = clock.UtcNow };
            db.Set<CoachCredential>().Add(row);
            audit.Write(new(coachId, "UPLOAD_COACH_CREDENTIAL", nameof(CoachCredential), id.ToString()));
            await db.SaveChangesAsync(ct);
            await tx.CommitAsync(ct);
            saved = true;
            return Response(row);
        }
        finally
        {
            if (!saved)
            {
                try { using var cleanup = new CancellationTokenSource(TimeSpan.FromSeconds(15)); await storage.DeleteAsync(uploaded.PublicId, contentType, cleanup.Token); }
                catch (Exception ex) { logger.LogWarning(ex, "Could not clean unused coach credential {CredentialId}", id); }
            }
        }
    }

    public async Task<CoachCredentialResponse> UpdateAsync(Guid coachId, Guid id, string kind, string title,
        string? issuer, DateOnly? issuedOn, bool published, int version, CancellationToken ct)
    {
        await RequireCoachAsync(coachId, ct);
        var metadata = Metadata(kind, title, issuer, issuedOn);
        var row = await db.Set<CoachCredential>().SingleOrDefaultAsync(c => c.CoachUserId == coachId && c.CredentialId == id && c.DeletedAtUtc == null, ct)
            ?? throw new NotFoundException("credential_not_found", "Document not found.");
        if (row.Version != version) throw Changed();
        row.Kind = metadata.Kind; row.Title = metadata.Title; row.Issuer = metadata.Issuer; row.IssuedOn = issuedOn;
        row.IsPublished = published; row.UpdatedAtUtc = clock.UtcNow; row.Version++;
        audit.Write(new(coachId, "UPDATE_COACH_CREDENTIAL", nameof(CoachCredential), id.ToString()));
        try { await db.SaveChangesAsync(ct); }
        catch (DbUpdateConcurrencyException) { throw Changed(); }
        return Response(row);
    }

    public async Task DeleteAsync(Guid coachId, Guid id, CancellationToken ct)
    {
        await RequireCoachAsync(coachId, ct);
        var row = await db.Set<CoachCredential>().SingleOrDefaultAsync(c => c.CoachUserId == coachId && c.CredentialId == id, ct)
            ?? throw new NotFoundException("credential_not_found", "Document not found.");
        if (row.DeletedAtUtc is not null) return;
        row.DeletedAtUtc = clock.UtcNow; row.IsPublished = false; row.Version++;
        audit.Write(new(coachId, "DELETE_COACH_CREDENTIAL", nameof(CoachCredential), id.ToString()));
        try { await db.SaveChangesAsync(ct); }
        catch (DbUpdateConcurrencyException) { throw Changed(); }
        try { await CleanupAsync(row, ct); }
        catch (Exception ex) when (ex is not OperationCanceledException)
        { logger.LogWarning(ex, "Coach credential removed; asset cleanup will retry for {CredentialId}", id); }
    }

    public async Task ProcessPendingDeletionsAsync(CancellationToken ct)
    {
        var rows = await db.Set<CoachCredential>().Where(c => c.DeletedAtUtc != null && c.AssetDeletedAtUtc == null)
            .OrderBy(c => c.DeletedAtUtc).Take(20).ToListAsync(ct);
        foreach (var row in rows)
        {
            try { await CleanupAsync(row, ct); }
            catch (Exception ex) when (ex is not OperationCanceledException)
            { logger.LogWarning(ex, "Credential cleanup will retry for {CredentialId}", row.CredentialId); }
        }
    }

    private async Task CleanupAsync(CoachCredential row, CancellationToken ct)
    {
        await storage.DeleteAsync(row.FilePublicId, row.ContentType, ct);
        row.AssetDeletedAtUtc = clock.UtcNow;
        await db.SaveChangesAsync(ct);
    }

    private async Task RequireCoachAsync(Guid id, CancellationToken ct)
    {
        if (!await db.Set<UserAccount>().AnyAsync(u => u.UserId == id && u.Status == UserStatus.Active && u.Role!.RoleName == UserRole.Coach, ct))
            throw new NotFoundException("coach_not_found", "Coach profile is unavailable.");
    }

    private static (CoachCredentialKind Kind, string Title, string? Issuer) Metadata(string kind, string title, string? issuer, DateOnly? issuedOn)
    {
        var type = kind.ToUpperInvariant() switch { "CERTIFICATE" => CoachCredentialKind.Certificate, "AWARD" => CoachCredentialKind.Award,
            _ => throw new BadRequestException("credential_kind_invalid", "Choose Certificate or Award.") };
        if (string.IsNullOrWhiteSpace(title) || title.Trim().Length > 200 || issuer?.Trim().Length > 200)
            throw new BadRequestException("credential_details_invalid", "Enter a title and use no more than 200 characters for each field.");
        return (type, title.Trim(), string.IsNullOrWhiteSpace(issuer) ? null : issuer.Trim());
    }

    private static ConflictException Changed() => new("credential_changed", "This document has changed. Reload it and try again.");

    public static void ValidateFile(byte[] bytes, string contentType)
    {
        if (bytes.Length == 0 || bytes.Length > MaxUploadBytes)
            throw new BadRequestException("credential_size_invalid", "Choose a document no larger than 10 MB.");
        var valid = contentType switch
        {
            "image/jpeg" => bytes.AsSpan().StartsWith(new byte[] { 0xff, 0xd8, 0xff }),
            "image/png" => bytes.AsSpan().StartsWith(new byte[] { 137, 80, 78, 71, 13, 10, 26, 10 }),
            "image/webp" => bytes.Length >= 12 && bytes.AsSpan(0, 4).SequenceEqual("RIFF"u8) && bytes.AsSpan(8, 4).SequenceEqual("WEBP"u8),
            "application/pdf" => bytes.AsSpan().StartsWith("%PDF-"u8),
            _ => false
        };
        if (!valid) throw new BadRequestException("credential_type_invalid", "Choose a valid JPG, PNG, WebP or PDF document.");
    }
}
