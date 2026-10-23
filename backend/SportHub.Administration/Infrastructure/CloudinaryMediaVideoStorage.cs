using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using Microsoft.Extensions.Configuration;
using SportHub.Administration.Application.Interfaces;
using SportHub.BuildingBlocks.SharedKernel.Errors;

namespace SportHub.Administration.Infrastructure;

/// <summary>Store original WebM bytes without video transformations or transcoding.</summary>
public sealed class CloudinaryMediaVideoStorage(IConfiguration configuration, HttpClient http) : IMediaVideoStorage
{
    private const string Prefix = "sporthub/media-videos/";
    private static readonly Regex CloudName = new("^[a-zA-Z0-9_-]+$", RegexOptions.Compiled);

    public async Task<StoredMediaVideo> UploadAsync(Guid actorId, byte[] bytes, CancellationToken ct)
    {
        var (endpoint, authorization) = Credentials();
        var publicId = $"{Prefix}{actorId:N}/{Guid.NewGuid():N}";
        using var form = new MultipartFormDataContent();
        var file = new ByteArrayContent(bytes);
        file.Headers.ContentType = new MediaTypeHeaderValue("video/webm");
        form.Add(file, "file", "hero.webm");
        form.Add(new StringContent(publicId), "public_id");
        form.Add(new StringContent("false"), "overwrite");
        using var request = new HttpRequestMessage(HttpMethod.Post, $"{endpoint}/video/upload") { Content = form };
        request.Headers.Authorization = authorization;
        using var response = await SendAsync(request, ct);
        if (!response.IsSuccessStatusCode)
            throw new AppException(503, "media_upload_failed", "Cloudinary could not save this video. Try again.");
        using var json = JsonDocument.Parse(await response.Content.ReadAsStreamAsync(ct));
        var root = json.RootElement;
        if (!root.TryGetProperty("public_id", out var id) || id.GetString() != publicId
            || !root.TryGetProperty("secure_url", out var urlValue)
            || !Uri.TryCreate(urlValue.GetString(), UriKind.Absolute, out var url) || url.Scheme != "https"
            || !url.Host.Equals("res.cloudinary.com", StringComparison.OrdinalIgnoreCase)
            || !root.TryGetProperty("width", out var widthValue) || !widthValue.TryGetInt32(out var width) || width <= 0
            || !root.TryGetProperty("height", out var heightValue) || !heightValue.TryGetInt32(out var height) || height <= 0)
            throw new AppException(503, "media_upload_invalid_response", "Cloudinary returned invalid video data.");
        try
        {
            if (!root.TryGetProperty("format", out var format) || format.GetString() != "webm"
                || !url.AbsolutePath.EndsWith(".webm", StringComparison.OrdinalIgnoreCase)
                || !root.TryGetProperty("duration", out var durationValue)
                || !durationValue.TryGetDouble(out var duration) || !double.IsFinite(duration) || duration <= 0)
                throw new BadRequestException("media_video_invalid", "Choose a playable WebM video.");
            var poster = url.ToString().Replace("/video/upload/", "/video/upload/so_0/", StringComparison.Ordinal);
            poster = poster[..^5] + ".jpg";
            return new StoredMediaVideo(url.ToString(), poster, publicId, width, height, duration);
        }
        catch
        {
            using var cleanup = new CancellationTokenSource(TimeSpan.FromSeconds(10));
            try { await DeleteAsync(publicId, cleanup.Token); } catch { /* Preserve the validation error. */ }
            throw;
        }
    }

    public async Task DeleteAsync(string publicId, CancellationToken ct)
    {
        if (!publicId.StartsWith(Prefix, StringComparison.Ordinal))
            throw new BadRequestException("invalid_media_id", "The media video ID is invalid.");
        var (endpoint, authorization) = Credentials();
        using var form = new MultipartFormDataContent();
        form.Add(new StringContent(publicId), "public_id");
        form.Add(new StringContent("true"), "invalidate");
        using var request = new HttpRequestMessage(HttpMethod.Post, $"{endpoint}/video/destroy") { Content = form };
        request.Headers.Authorization = authorization;
        using var response = await SendAsync(request, ct);
        if (!response.IsSuccessStatusCode)
            throw new AppException(503, "media_cleanup_failed", "Cloudinary could not remove the unused upload.");
    }

    private async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct)
    {
        try { return await http.SendAsync(request, ct); }
        catch (HttpRequestException) { throw new AppException(503, "media_storage_unavailable", "Could not connect to Cloudinary. Try again."); }
        catch (TaskCanceledException) when (!ct.IsCancellationRequested)
        { throw new AppException(503, "media_upload_timeout", "Cloudinary took too long to respond. Try again."); }
    }

    private (string Endpoint, AuthenticationHeaderValue Authorization) Credentials()
    {
        if (!Uri.TryCreate(configuration["CLOUDINARY_URL"], UriKind.Absolute, out var uri)
            || uri.Scheme != "cloudinary" || !CloudName.IsMatch(uri.Host))
            throw new AppException(503, "media_storage_not_configured", "Cloudinary is not configured on the backend.");
        var parts = uri.UserInfo.Split(':', 2);
        if (parts.Length != 2 || parts.Any(string.IsNullOrWhiteSpace))
            throw new AppException(503, "media_storage_not_configured", "Cloudinary is not configured on the backend.");
        var credentials = Convert.ToBase64String(Encoding.UTF8.GetBytes($"{Uri.UnescapeDataString(parts[0])}:{Uri.UnescapeDataString(parts[1])}"));
        return ($"https://api.cloudinary.com/v1_1/{uri.Host}", new AuthenticationHeaderValue("Basic", credentials));
    }
}
