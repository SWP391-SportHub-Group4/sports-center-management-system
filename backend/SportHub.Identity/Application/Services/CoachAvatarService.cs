using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using SportHub.BuildingBlocks.Abstractions.Persistence;
using SportHub.BuildingBlocks.SharedKernel.Errors;
using SportHub.Identity.Infrastructure.Media;

namespace SportHub.Identity.Application.Services;

public sealed class CoachAvatarService(ISportHubDbContext db, CloudinaryAvatarStore store)
{
    public const int MaxBytes = 5 * 1024 * 1024;

    public async Task UploadAsync(Guid userId, IFormFile file, CancellationToken ct)
    {
        var user = await db.Set<UserAccount>().AsNoTracking().Include(u => u.Role).Include(u => u.Profile)
            .SingleOrDefaultAsync(u => u.UserId == userId, ct)
            ?? throw new NotFoundException("user_not_found", "Không tìm thấy tài khoản.");
        if (user.Role?.RoleName != UserRole.Coach)
            throw new ForbiddenException("coach_required", "Chỉ Coach được cập nhật ảnh đại diện tại đây.");
        if (user.Profile is null) throw new NotFoundException("profile_not_found", "Không tìm thấy hồ sơ.");
        if (file.Length <= 0 || file.Length > MaxBytes)
            throw new BadRequestException("invalid_avatar_size", "Chọn ảnh JPG, PNG hoặc WebP không quá 5 MB.");
        // Check actual bytes, not user-provided extension/MIME alone. Cloudinary decodes and normalizes the image.
        using var stream = file.OpenReadStream();
        using var buffer = new MemoryStream();
        var chunk = new byte[81920];
        int count;
        while ((count = await stream.ReadAsync(chunk, ct)) > 0)
        {
            if (buffer.Length + count > MaxBytes)
                throw new BadRequestException("invalid_avatar_size", "Ảnh không được vượt quá 5 MB.");
            buffer.Write(chunk, 0, count);
        }
        var bytes = buffer.ToArray();
        var mediaType = DetectType(bytes);
        if (mediaType is null || !string.Equals(mediaType, file.ContentType, StringComparison.OrdinalIgnoreCase))
            throw new BadRequestException("invalid_avatar_type", "Chỉ chấp nhận ảnh JPG, PNG hoặc WebP hợp lệ.");
        var avatar = await store.UploadAsync(userId, bytes, mediaType, ct);
        var previousId = user.Profile.AvatarPublicId;
        try
        {
            // Compare-and-swap protects concurrent uploads and does not overwrite name/phone edits.
            var updated = await db.Set<UserProfile>()
                .Where(p => p.UserId == userId && p.AvatarPublicId == previousId)
                .ExecuteUpdateAsync(setters => setters
                    .SetProperty(p => p.AvatarUrl, avatar.Url)
                    .SetProperty(p => p.AvatarPublicId, avatar.PublicId), ct);
            if (updated == 0)
                throw new ConflictException("avatar_changed", "Ảnh vừa được cập nhật ở phiên khác. Hãy tải lại hồ sơ.");
        }
        catch
        {
            await store.DeleteAsync(userId, avatar.PublicId);
            throw;
        }
        if (previousId is not null) await store.DeleteAsync(userId, previousId);
    }

    private static string? DetectType(byte[] bytes)
    {
        if (bytes.Length >= 3 && bytes[0] == 0xff && bytes[1] == 0xd8 && bytes[2] == 0xff) return "image/jpeg";
        if (bytes.Length >= 8 && bytes.AsSpan(0, 8).SequenceEqual(new byte[] { 137, 80, 78, 71, 13, 10, 26, 10 })) return "image/png";
        if (bytes.Length >= 12 && bytes.AsSpan(0, 4).SequenceEqual("RIFF"u8) && bytes.AsSpan(8, 4).SequenceEqual("WEBP"u8)) return "image/webp";
        return null;
    }
}
