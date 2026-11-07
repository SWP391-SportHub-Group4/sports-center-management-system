using System.Buffers.Binary;
using SportHub.BuildingBlocks.SharedKernel.Errors;

namespace SportHub.Administration.Application.Services;

internal static class ServiceImageValidation
{
    public const int MaxBytes = 10 * 1024 * 1024;

    // Read encoded dimensions before sending the file to the image decoder at storage.
    // Limits reject malformed headers and oversized decompression workloads.
    public static void Validate(byte[] bytes, string contentType)
    {
        if (bytes.Length == 0 || bytes.Length > MaxBytes)
            throw new BadRequestException("service_image_size_invalid", "Choose an image no larger than 10 MB.");
        var span = bytes.AsSpan();
        var width = 0;
        var height = 0;
        var validType = false;
        if (contentType == "image/png" && span.Length >= 24
            && span[..8].SequenceEqual(new byte[] { 137, 80, 78, 71, 13, 10, 26, 10 })
            && span.Slice(12, 4).SequenceEqual("IHDR"u8))
        {
            validType = true;
            width = BinaryPrimitives.ReadInt32BigEndian(span.Slice(16, 4));
            height = BinaryPrimitives.ReadInt32BigEndian(span.Slice(20, 4));
        }
        else if (contentType == "image/jpeg" && span.Length >= 3 && span[0] == 255 && span[1] == 216 && span[2] == 255)
        {
            validType = true;
            for (var offset = 2; offset + 3 < span.Length;)
            {
                if (span[offset++] != 255) break;
                while (offset < span.Length && span[offset] == 255) offset++;
                if (offset >= span.Length) break;
                var marker = span[offset++];
                if (marker is 0xd9 or 0xda) break;
                if (marker is 0x01 or >= 0xd0 and <= 0xd7) continue;
                if (offset + 2 > span.Length) break;
                var size = BinaryPrimitives.ReadUInt16BigEndian(span.Slice(offset, 2));
                if (size < 2 || offset + size > span.Length) break;
                if (marker is >= 0xc0 and <= 0xcf && marker is not (0xc4 or 0xc8 or 0xcc) && size >= 8)
                {
                    height = BinaryPrimitives.ReadUInt16BigEndian(span.Slice(offset + 3, 2));
                    width = BinaryPrimitives.ReadUInt16BigEndian(span.Slice(offset + 5, 2));
                    break;
                }
                offset += size;
            }
        }
        else if (contentType == "image/webp" && span.Length >= 30
            && span[..4].SequenceEqual("RIFF"u8) && span.Slice(8, 4).SequenceEqual("WEBP"u8))
        {
            validType = true;
            if (span.Slice(12, 4).SequenceEqual("VP8X"u8))
            {
                width = 1 + span[24] + (span[25] << 8) + (span[26] << 16);
                height = 1 + span[27] + (span[28] << 8) + (span[29] << 16);
            }
            else if (span.Slice(12, 4).SequenceEqual("VP8L"u8) && span[20] == 0x2f)
            {
                width = 1 + span[21] + ((span[22] & 0x3f) << 8);
                height = 1 + (span[22] >> 6) + (span[23] << 2) + ((span[24] & 0x0f) << 10);
            }
            else if (span.Slice(12, 4).SequenceEqual("VP8 "u8) && span.Slice(23, 3).SequenceEqual(new byte[] { 0x9d, 0x01, 0x2a }))
            {
                width = BinaryPrimitives.ReadUInt16LittleEndian(span.Slice(26, 2)) & 0x3fff;
                height = BinaryPrimitives.ReadUInt16LittleEndian(span.Slice(28, 2)) & 0x3fff;
            }
        }
        if (!validType)
            throw new BadRequestException("service_image_type_invalid", "Choose a JPG, PNG or WebP image.");
        if (width <= 0 || height <= 0 || width > 16384 || height > 16384 || (long)width * height > 50_000_000)
            throw new BadRequestException("service_image_dimensions_invalid", "Choose an image with valid dimensions, up to 50 megapixels.");
    }
}
