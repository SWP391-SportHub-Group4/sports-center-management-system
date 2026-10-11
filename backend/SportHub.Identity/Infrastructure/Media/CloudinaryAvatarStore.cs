using System.Globalization;
using System.Net.Http.Headers;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using SportHub.BuildingBlocks.SharedKernel.Errors;

namespace SportHub.Identity.Infrastructure.Media;

public sealed class CloudinaryOptions
{
    public string CloudName { get; set; } = string.Empty;
    public string ApiKey { get; set; } = string.Empty;
    public string ApiSecret { get; set; } = string.Empty;
}

public sealed record StoredAvatar(string Url, string PublicId);

/// <summary>Signed server uploads. Credentials and signing never reach the browser.</summary>
public sealed class CloudinaryAvatarStore(
    HttpClient client, IOptions<CloudinaryOptions> options, ILogger<CloudinaryAvatarStore> logger)
{
    public async Task<StoredAvatar> UploadAsync(Guid userId, byte[] bytes, string mediaType, CancellationToken ct)
    {
        var settings = RequireSettings();
        var publicId = $"sporthub/coach-avatars/{userId:N}/{Guid.NewGuid():N}";
        var parameters = new SortedDictionary<string, string>(StringComparer.Ordinal)
        {
            ["allowed_formats"] = "jpg,png,webp",
            ["overwrite"] = "false",
            ["public_id"] = publicId,
            ["timestamp"] = DateTimeOffset.UtcNow.ToUnixTimeSeconds().ToString(CultureInfo.InvariantCulture),
            ["transformation"] = "c_thumb,g_face,h_512,w_512/q_auto:good"
        };
        using var body = SignedBody(parameters, settings);
        using var image = new ByteArrayContent(bytes);
        image.Headers.ContentType = new MediaTypeHeaderValue(mediaType);
        body.Add(image, "file", "avatar");
        try
        {
            using var response = await client.PostAsync(Endpoint(settings, "upload"), body, ct);
            if (!response.IsSuccessStatusCode)
            {
                logger.LogWarning("Cloudinary avatar upload rejected with status {Status}", (int)response.StatusCode);
                throw new AppException(502, "avatar_upload_failed", "Không tải được ảnh đại diện. Vui lòng thử lại.");
            }
            using var json = await JsonDocument.ParseAsync(await response.Content.ReadAsStreamAsync(ct), cancellationToken: ct);
            var root = json.RootElement;
            var url = root.GetProperty("secure_url").GetString();
            if (root.GetProperty("public_id").GetString() != publicId
                || !Uri.TryCreate(url, UriKind.Absolute, out var uri)
                || uri.Scheme != "https" || uri.Host != "res.cloudinary.com"
                || !uri.AbsolutePath.StartsWith($"/{settings.CloudName}/image/upload/", StringComparison.Ordinal)
                || root.GetProperty("width").GetInt32() != 512 || root.GetProperty("height").GetInt32() != 512)
                throw new AppException(502, "avatar_upload_failed", "Dịch vụ ảnh trả kết quả không hợp lệ. Vui lòng thử lại.");
            return new StoredAvatar(url!, publicId);
        }
        catch (Exception ex) when (ex is HttpRequestException or JsonException or KeyNotFoundException or InvalidOperationException or FormatException
            || ex is OperationCanceledException && !ct.IsCancellationRequested)
        {
            throw new AppException(502, "avatar_upload_failed", "Dịch vụ ảnh chưa phản hồi. Vui lòng thử lại.");
        }
    }

    /// <summary>Best effort cleanup, only within the authenticated user's own namespace.</summary>
    public async Task DeleteAsync(Guid userId, string publicId)
    {
        if (!publicId.StartsWith($"sporthub/coach-avatars/{userId:N}/", StringComparison.Ordinal)) return;
        try
        {
            var settings = RequireSettings();
            using var body = SignedBody(new SortedDictionary<string, string>(StringComparer.Ordinal)
            {
                ["invalidate"] = "true", ["public_id"] = publicId,
                ["timestamp"] = DateTimeOffset.UtcNow.ToUnixTimeSeconds().ToString(CultureInfo.InvariantCulture)
            }, settings);
            using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(10));
            using var response = await client.PostAsync(Endpoint(settings, "destroy"), body, timeout.Token);
            if (!response.IsSuccessStatusCode) logger.LogWarning("Avatar cleanup failed for {PublicId}", publicId);
        }
        catch (Exception ex) when (ex is HttpRequestException or OperationCanceledException or AppException)
        {
            logger.LogWarning("Avatar cleanup unavailable for {PublicId}", publicId);
        }
    }

    private CloudinaryOptions RequireSettings()
    {
        var settings = options.Value;
        if (!Regex.IsMatch(settings.CloudName, @"\A[a-zA-Z0-9_-]{1,100}\z")
            || string.IsNullOrWhiteSpace(settings.ApiKey) || string.IsNullOrWhiteSpace(settings.ApiSecret))
            throw new AppException(503, "avatar_storage_unavailable", "Chức năng tải ảnh đại diện chưa được bật. Vui lòng liên hệ trung tâm.");
        return settings;
    }

    private static string Endpoint(CloudinaryOptions settings, string action)
        => $"https://api.cloudinary.com/v1_1/{settings.CloudName}/image/{action}";

    private static MultipartFormDataContent SignedBody(SortedDictionary<string, string> parameters, CloudinaryOptions settings)
    {
        var toSign = string.Join("&", parameters.Select(p => $"{p.Key}={p.Value}")) + settings.ApiSecret;
        var signature = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(toSign))).ToLowerInvariant();
        var body = new MultipartFormDataContent();
        foreach (var (key, value) in parameters) body.Add(new StringContent(value), key);
        body.Add(new StringContent(settings.ApiKey), "api_key");
        body.Add(new StringContent(signature), "signature");
        return body;
    }
}
