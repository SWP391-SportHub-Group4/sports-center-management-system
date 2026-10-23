using Microsoft.AspNetCore.Http;
using SportHub.BuildingBlocks.SharedKernel.Errors;
using SportHub.Identity.Domain.Entities;

namespace SportHub.Identity.Api;

/// <summary>Đọc và kiểm tra ảnh đính kèm yêu cầu hỗ trợ: tối đa 3 tệp, JPG/PNG/WebP (nhận diện theo nội dung), mỗi tệp ≤ 5 MB.</summary>
public static class SupportImageUploads
{
    public const int MaxFiles = 3;
    public const int MaxFileBytes = 5 * 1024 * 1024;

    public static async Task<List<MemberSupportAttachment>> ReadAsync(IReadOnlyCollection<IFormFile>? files, string kind,
        Guid uploadedBy, DateTime now, bool required, CancellationToken ct)
    {
        files ??= [];
        if (files.Count > MaxFiles)
            throw new BadRequestException("support_attachment_count", $"You can attach up to {MaxFiles} images.");
        if (required && files.Count == 0)
            throw new BadRequestException("support_attachment_required", "Attach at least one image.");
        var result = new List<MemberSupportAttachment>();
        foreach (var file in files)
        {
            if (file.Length == 0 || file.Length > MaxFileBytes)
                throw new BadRequestException("support_attachment_size", "Each image must be no larger than 5 MB.");
            await using var input = file.OpenReadStream();
            await using var buffer = new MemoryStream();
            await input.CopyToAsync(buffer, ct);
            var bytes = buffer.ToArray();
            var type = SniffImage(bytes)
                ?? throw new BadRequestException("support_attachment_type", "Attachments must be JPG, PNG or WebP images.");
            result.Add(new MemberSupportAttachment
            {
                AttachmentId = Guid.NewGuid(),
                FileName = SafeName(file.FileName),
                ContentType = type,
                Content = bytes,
                CreatedAt = now,
                Kind = kind,
                UploadedByUserId = uploadedBy
            });
        }
        return result;
    }

    public static string? SniffImage(byte[] b)
    {
        if (b.Length > 12 && b[0] == 0xFF && b[1] == 0xD8 && b[2] == 0xFF) return "image/jpeg";
        if (b.Length > 8 && b[0] == 0x89 && b[1] == 0x50 && b[2] == 0x4E && b[3] == 0x47) return "image/png";
        if (b.Length > 12 && b[0] == 'R' && b[1] == 'I' && b[2] == 'F' && b[3] == 'F'
            && b[8] == 'W' && b[9] == 'E' && b[10] == 'B' && b[11] == 'P') return "image/webp";
        return null;
    }

    private static string SafeName(string? name)
    {
        var value = Path.GetFileName(name ?? "image");
        return string.IsNullOrWhiteSpace(value) ? "image" : value.Length > 120 ? value[^120..] : value;
    }
}
