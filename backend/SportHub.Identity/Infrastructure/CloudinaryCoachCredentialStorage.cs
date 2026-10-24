using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using Microsoft.Extensions.Configuration;
using SportHub.BuildingBlocks.SharedKernel.Errors;
using SportHub.Identity.Application.Interfaces;

namespace SportHub.Identity.Infrastructure;

public sealed class CloudinaryCoachCredentialStorage(IConfiguration configuration, HttpClient http) : ICoachCredentialStorage
{
    private const string Prefix = "sporthub/coach-credentials/";
    public async Task<StoredCoachCredential> UploadAsync(Guid coachId, Guid credentialId, byte[] bytes, string contentType, CancellationToken ct)
    {
        var (endpoint, auth) = Credentials();
        var raw = contentType == "application/pdf";
        var id = $"{Prefix}{coachId:N}/{credentialId:N}" + (raw ? ".pdf" : "");
        using var form = new MultipartFormDataContent();
        using var file = new ByteArrayContent(bytes);
        file.Headers.ContentType = new MediaTypeHeaderValue(contentType);
        form.Add(file, "file", raw ? "document.pdf" : "credential");
        form.Add(new StringContent(id), "public_id");
        form.Add(new StringContent("false"), "overwrite");
        // Preserve the original document and its aspect ratio; do not apply avatar crop/resize transforms.
        using var request = new HttpRequestMessage(HttpMethod.Post, $"{endpoint}/{(raw ? "raw" : "image")}/upload") { Content = form };
        request.Headers.Authorization = auth;
        using var response = await SendAsync(request, ct);
        if (!response.IsSuccessStatusCode)
            throw new AppException(503, "credential_upload_failed", "Could not save the document to Cloudinary. Please try again.");
        using var json = JsonDocument.Parse(await response.Content.ReadAsStreamAsync(ct));
        var root = json.RootElement;
        if (!root.TryGetProperty("public_id", out var publicId) || publicId.GetString() != id
            || !root.TryGetProperty("secure_url", out var value) || !Uri.TryCreate(value.GetString(), UriKind.Absolute, out var uri)
            || uri.Scheme != Uri.UriSchemeHttps || uri.Host != "res.cloudinary.com")
            throw new AppException(503, "credential_upload_invalid_response", "Cloudinary returned an invalid document.");
        return new(uri.AbsoluteUri, id);
    }

    public async Task DeleteAsync(string publicId, string contentType, CancellationToken ct)
    {
        if (!publicId.StartsWith(Prefix, StringComparison.Ordinal))
            throw new BadRequestException("credential_public_id_invalid", "Invalid document ID.");
        var (endpoint, auth) = Credentials();
        using var form = new MultipartFormDataContent();
        form.Add(new StringContent(publicId), "public_id");
        form.Add(new StringContent("true"), "invalidate");
        using var request = new HttpRequestMessage(HttpMethod.Post, $"{endpoint}/{(contentType == "application/pdf" ? "raw" : "image")}/destroy") { Content = form };
        request.Headers.Authorization = auth;
        using var response = await SendAsync(request, ct);
        if (!response.IsSuccessStatusCode)
            throw new AppException(503, "credential_cleanup_failed", "Could not remove the document from Cloudinary.");
        using var json = JsonDocument.Parse(await response.Content.ReadAsStreamAsync(ct));
        if (!json.RootElement.TryGetProperty("result", out var result) || result.GetString() is not ("ok" or "not found"))
            throw new AppException(503, "credential_cleanup_failed", "Could not remove the document from Cloudinary.");
    }

    private async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct)
    {
        try { return await http.SendAsync(request, ct); }
        catch (HttpRequestException) { throw new AppException(503, "credential_storage_unavailable", "Could not connect to Cloudinary. Please try again."); }
        catch (TaskCanceledException) when (!ct.IsCancellationRequested)
        { throw new AppException(503, "credential_storage_timeout", "The document upload timed out. Please try again."); }
    }

    private (string Endpoint, AuthenticationHeaderValue Auth) Credentials()
    {
        if (!Uri.TryCreate(configuration["CLOUDINARY_URL"], UriKind.Absolute, out var uri) || uri.Scheme != "cloudinary"
            || !Regex.IsMatch(uri.Host, "^[a-zA-Z0-9_-]+$"))
            throw new AppException(503, "credential_storage_not_configured", "Cloudinary is not configured on the backend.");
        var parts = uri.UserInfo.Split(':', 2);
        if (parts.Length != 2 || parts.Any(string.IsNullOrWhiteSpace))
            throw new AppException(503, "credential_storage_not_configured", "Cloudinary is not configured on the backend.");
        var auth = Convert.ToBase64String(Encoding.UTF8.GetBytes($"{Uri.UnescapeDataString(parts[0])}:{Uri.UnescapeDataString(parts[1])}"));
        return ($"https://api.cloudinary.com/v1_1/{uri.Host}", new("Basic", auth));
    }
}
