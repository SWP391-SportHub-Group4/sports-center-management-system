using System.Net.Http.Headers;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using Microsoft.Extensions.Configuration;
using SportHub.BuildingBlocks.SharedKernel.Errors;
using SportHub.Identity.Application.Interfaces;
using SportHub.Identity.Application.Services;

namespace SportHub.Identity.Infrastructure;

public sealed class CloudinaryCoachCredentialStorage(IConfiguration configuration, HttpClient http,
    CoachCredentialPdfCache pdfCache) : ICoachCredentialStorage
{
    private const string Prefix = "sporthub/coach-credentials/";
    public async Task<StoredCoachCredential> UploadAsync(Guid coachId, Guid credentialId, byte[] bytes, string contentType, CancellationToken ct)
    {
        var (endpoint, auth, _, _) = Credentials();
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
        if (raw) pdfCache.Set($"{endpoint}|{id}", bytes);
        return new(uri.AbsoluteUri, id);
    }

    public async Task<byte[]> DownloadPdfAsync(string publicId, CancellationToken ct)
    {
        if (!Regex.IsMatch(publicId, "^sporthub/coach-credentials/[a-fA-F0-9]{32}/[a-fA-F0-9]{32}\\.pdf$"))
            throw new BadRequestException("credential_public_id_invalid", "Invalid PDF document ID.");
        var (endpoint, _, _, _) = Credentials();
        try { return await pdfCache.GetAsync($"{endpoint}|{publicId}", token => DownloadPdfCoreAsync(publicId, token), ct); }
        catch (OperationCanceledException) when (!ct.IsCancellationRequested)
        { throw new AppException(503, "credential_storage_timeout", "The PDF download timed out. Please try again."); }
    }

    private async Task<byte[]> DownloadPdfCoreAsync(string publicId, CancellationToken ct)
    {
        var (endpoint, _, apiKey, apiSecret) = Credentials();
        var now = DateTimeOffset.UtcNow.ToUnixTimeSeconds();
        var parameters = new SortedDictionary<string, string>(StringComparer.Ordinal)
        {
            ["attachment"] = "false",
            ["expires_at"] = (now + 120).ToString(System.Globalization.CultureInfo.InvariantCulture),
            ["public_id"] = publicId,
            ["timestamp"] = now.ToString(System.Globalization.CultureInfo.InvariantCulture),
            ["type"] = "upload"
        };
        var canonical = string.Join("&", parameters.Select(p => $"{p.Key}={p.Value}"));
        parameters["signature"] = Convert.ToHexString(SHA1.HashData(Encoding.UTF8.GetBytes(canonical + apiSecret))).ToLowerInvariant();
        parameters["api_key"] = apiKey;
        var query = string.Join("&", parameters.Select(p => $"{Uri.EscapeDataString(p.Key)}={Uri.EscapeDataString(p.Value)}"));
        // Retrieve the stored original through Cloudinary's authenticated download API.
        // No Cloudinary credential or signed URL is returned to the browser.
        using var request = new HttpRequestMessage(HttpMethod.Get, $"{endpoint}/raw/download?{query}");
        using var response = await SendAsync(request, ct, HttpCompletionOption.ResponseHeadersRead);
        if (response.StatusCode == System.Net.HttpStatusCode.NotFound)
            throw new NotFoundException("credential_file_not_found", "This PDF is no longer available.");
        if (!response.IsSuccessStatusCode)
            throw new AppException(502, "credential_delivery_failed", "Could not retrieve this PDF from storage. Please try again.");
        if (response.Content.Headers.ContentLength > CoachCredentialService.MaxUploadBytes)
            throw InvalidPdf();
        try
        {
            await using var input = await response.Content.ReadAsStreamAsync(ct);
            using var output = new MemoryStream();
            var buffer = new byte[81920];
            int count;
            while ((count = await input.ReadAsync(buffer, ct)) > 0)
            {
                if (output.Length + count > CoachCredentialService.MaxUploadBytes) throw InvalidPdf();
                output.Write(buffer, 0, count);
            }
            var bytes = output.ToArray();
            if (!bytes.AsSpan().StartsWith("%PDF-"u8)) throw InvalidPdf();
            return bytes;
        }
        catch (IOException)
        { throw new AppException(502, "credential_delivery_failed", "The PDF download was interrupted. Please try again."); }
    }

    private static AppException InvalidPdf() => new(502, "credential_file_invalid", "Storage returned an invalid PDF document.");

    public async Task DeleteAsync(string publicId, string contentType, CancellationToken ct)
    {
        if (!publicId.StartsWith(Prefix, StringComparison.Ordinal))
            throw new BadRequestException("credential_public_id_invalid", "Invalid document ID.");
        var (endpoint, auth, _, _) = Credentials();
        if (contentType == "application/pdf") pdfCache.Remove($"{endpoint}|{publicId}");
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

    private async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct,
        HttpCompletionOption completion = HttpCompletionOption.ResponseContentRead)
    {
        try { return await http.SendAsync(request, completion, ct); }
        catch (HttpRequestException) { throw new AppException(503, "credential_storage_unavailable", "Could not connect to Cloudinary. Please try again."); }
        catch (TaskCanceledException) when (!ct.IsCancellationRequested)
        { throw new AppException(503, "credential_storage_timeout", "The document upload timed out. Please try again."); }
    }

    private (string Endpoint, AuthenticationHeaderValue Auth, string ApiKey, string ApiSecret) Credentials()
    {
        if (!Uri.TryCreate(configuration["CLOUDINARY_URL"], UriKind.Absolute, out var uri) || uri.Scheme != "cloudinary"
            || !Regex.IsMatch(uri.Host, "^[a-zA-Z0-9_-]+$"))
            throw new AppException(503, "credential_storage_not_configured", "Cloudinary is not configured on the backend.");
        var parts = uri.UserInfo.Split(':', 2);
        if (parts.Length != 2 || parts.Any(string.IsNullOrWhiteSpace))
            throw new AppException(503, "credential_storage_not_configured", "Cloudinary is not configured on the backend.");
        var key = Uri.UnescapeDataString(parts[0]);
        var secret = Uri.UnescapeDataString(parts[1]);
        var auth = Convert.ToBase64String(Encoding.UTF8.GetBytes($"{key}:{secret}"));
        return ($"https://api.cloudinary.com/v1_1/{uri.Host}", new("Basic", auth), key, secret);
    }
}
