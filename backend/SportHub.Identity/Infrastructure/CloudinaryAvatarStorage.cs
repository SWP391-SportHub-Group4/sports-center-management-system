using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using Microsoft.Extensions.Configuration;
using SportHub.BuildingBlocks.SharedKernel.Errors;
using SportHub.Identity.Application.Interfaces;

namespace SportHub.Identity.Infrastructure;

/// <summary>Cloudinary Upload API over HTTPS. Credentials never leave the backend.</summary>
public sealed class CloudinaryAvatarStorage(IConfiguration configuration, HttpClient http) : IAvatarStorage
{
    private static readonly Regex CloudNamePattern = new("^[a-zA-Z0-9_-]+$", RegexOptions.Compiled);
    private const string Prefix = "sporthub/avatars/";

    public Task<StoredAvatar> UploadAsync(Guid userId, byte[] image, string contentType, CancellationToken ct)
        => UploadCoreAsync(userId, new ByteArrayContent(image), contentType, false, ct);

    public async Task<StoredAvatar> ImportGooglePictureAsync(Guid userId, string pictureUrl, CancellationToken ct)
    {
        if (!Uri.TryCreate(pictureUrl, UriKind.Absolute, out var uri)
            || uri.Scheme != Uri.UriSchemeHttps
            || !(uri.Host.Equals("googleusercontent.com", StringComparison.OrdinalIgnoreCase)
                || uri.Host.EndsWith(".googleusercontent.com", StringComparison.OrdinalIgnoreCase)))
            throw new BadRequestException("google_picture_invalid", "The Google picture URL is invalid.");

        return await UploadCoreAsync(userId, new StringContent(uri.ToString()), null, true, ct);
    }

    private async Task<StoredAvatar> UploadCoreAsync(Guid userId, HttpContent file, string? contentType,
        bool remoteUrl, CancellationToken ct)
    {
        var (endpoint, authorization) = Credentials();
        using var form = new MultipartFormDataContent();
        if (contentType is not null) file.Headers.ContentType = new MediaTypeHeaderValue(contentType);
        if (remoteUrl) form.Add(file, "file");
        else form.Add(file, "file", "avatar");
        form.Add(new StringContent($"{Prefix}{userId:N}/{Guid.NewGuid():N}"), "public_id");
        form.Add(new StringContent("false"), "overwrite");
        // The browser sends a square crop. This incoming transformation also enforces
        // the stored dimensions for callers that bypass the browser.
        form.Add(new StringContent("c_fill,g_center,w_512,h_512"), "transformation");
        using var request = new HttpRequestMessage(HttpMethod.Post, $"{endpoint}/image/upload") { Content = form };
        request.Headers.Authorization = authorization;
        using var response = await SendAsync(request, ct);
        if (!response.IsSuccessStatusCode)
            throw new AppException(503, "avatar_storage_unavailable", "Could not save the avatar. Please try again.");
        using var json = JsonDocument.Parse(await response.Content.ReadAsStreamAsync(ct));
        var root = json.RootElement;
        var publicId = root.GetProperty("public_id").GetString();
        var url = root.GetProperty("secure_url").GetString();
        if (string.IsNullOrWhiteSpace(publicId) || !publicId.StartsWith(Prefix, StringComparison.Ordinal)
            || !Uri.TryCreate(url, UriKind.Absolute, out var parsed) || parsed.Scheme != Uri.UriSchemeHttps
            || !parsed.Host.Equals("res.cloudinary.com", StringComparison.OrdinalIgnoreCase))
            throw new AppException(503, "avatar_storage_invalid_response", "Cloudinary returned invalid image data.");
        return new StoredAvatar(url, publicId);
    }

    public async Task DeleteAsync(string publicId, CancellationToken ct)
    {
        if (!publicId.StartsWith(Prefix, StringComparison.Ordinal))
            throw new BadRequestException("avatar_public_id_invalid", "The avatar ID is invalid.");
        var (endpoint, authorization) = Credentials();
        using var form = new MultipartFormDataContent();
        form.Add(new StringContent(publicId), "public_id");
        form.Add(new StringContent("true"), "invalidate");
        using var request = new HttpRequestMessage(HttpMethod.Post, $"{endpoint}/image/destroy") { Content = form };
        request.Headers.Authorization = authorization;
        using var response = await SendAsync(request, ct);
        if (!response.IsSuccessStatusCode)
            throw new AppException(503, "avatar_storage_unavailable", "Could not delete the image from Cloudinary.");
        using var json = JsonDocument.Parse(await response.Content.ReadAsStreamAsync(ct));
        var result = json.RootElement.GetProperty("result").GetString();
        if (result is not ("ok" or "not found"))
            throw new AppException(503, "avatar_storage_unavailable", "Could not delete the image from Cloudinary.");
    }

    private async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct)
    {
        try { return await http.SendAsync(request, ct); }
        catch (HttpRequestException)
        {
            throw new AppException(503, "avatar_storage_unavailable", "Could not connect to Cloudinary.");
        }
        catch (TaskCanceledException) when (!ct.IsCancellationRequested)
        {
            throw new AppException(503, "avatar_storage_unavailable", "Cloudinary took too long to respond.");
        }
    }

    private (string Endpoint, AuthenticationHeaderValue Authorization) Credentials()
    {
        var raw = configuration["CLOUDINARY_URL"];
        if (!Uri.TryCreate(raw, UriKind.Absolute, out var uri) || uri.Scheme != "cloudinary"
            || !CloudNamePattern.IsMatch(uri.Host) || string.IsNullOrWhiteSpace(uri.UserInfo))
            throw new AppException(503, "avatar_storage_not_configured", "Cloudinary is not configured.");
        var parts = uri.UserInfo.Split(':', 2);
        if (parts.Length != 2 || parts.Any(string.IsNullOrWhiteSpace))
            throw new AppException(503, "avatar_storage_not_configured", "Cloudinary is not configured.");
        var credentials = Convert.ToBase64String(Encoding.UTF8.GetBytes($"{Uri.UnescapeDataString(parts[0])}:{Uri.UnescapeDataString(parts[1])}"));
        return ($"https://api.cloudinary.com/v1_1/{uri.Host}", new AuthenticationHeaderValue("Basic", credentials));
    }
}
