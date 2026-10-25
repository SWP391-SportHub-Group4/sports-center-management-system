using System.Net;
using System.Security.Cryptography;
using System.Text;
using Microsoft.AspNetCore.WebUtilities;
using Microsoft.Extensions.Configuration;
using SportHub.Identity.Infrastructure;
using SportHub.Identity.Application.Services;
using SportHub.BuildingBlocks.SharedKernel.Errors;

namespace SportHub.Security.Tests.Unit;

public sealed class CloudinaryCoachCredentialStorageTests
{
    [Fact]
    public async Task Pdf_download_uses_authenticated_api_and_preserves_the_original_bytes()
    {
        var id = $"sporthub/coach-credentials/{Guid.NewGuid():N}/{Guid.NewGuid():N}.pdf";
        var bytes = "%PDF-1.7\nOriginal multi-page document\n%%EOF"u8.ToArray();
        var handler = new Handler(request =>
        {
            Assert.Equal(HttpMethod.Get, request.Method);
            Assert.Equal("api.cloudinary.com", request.RequestUri!.Host);
            Assert.Equal("/v1_1/test/raw/download", request.RequestUri.AbsolutePath);
            var query = QueryHelpers.ParseQuery(request.RequestUri.Query);
            Assert.Equal(id, query["public_id"]);
            Assert.Equal("upload", query["type"]);
            Assert.Equal("false", query["attachment"]);
            Assert.Equal("test", query["api_key"]);
            Assert.False(query.ContainsKey("format")); // Raw public IDs already include the extension.
            Assert.Equal(120, long.Parse(query["expires_at"]!) - long.Parse(query["timestamp"]!));
            var canonical = string.Join("&", query.Where(p => p.Key is not ("signature" or "api_key"))
                .OrderBy(p => p.Key, StringComparer.Ordinal).Select(p => $"{p.Key}={p.Value}"));
            var signature = Convert.ToHexString(SHA1.HashData(Encoding.UTF8.GetBytes(canonical + "secret"))).ToLowerInvariant();
            Assert.Equal(signature, query["signature"]);
            return Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK) { Content = new ByteArrayContent(bytes) });
        });
        var storage = Storage(handler);
        Assert.Equal(bytes, await storage.DownloadPdfAsync(id, default));
    }

    [Theory]
    [InlineData(HttpStatusCode.Unauthorized)]
    [InlineData(HttpStatusCode.Forbidden)]
    [InlineData(HttpStatusCode.NotFound)]
    public async Task Pdf_download_does_not_serve_provider_error_pages(HttpStatusCode status)
    {
        var handler = new Handler(_ => Task.FromResult(new HttpResponseMessage(status) { Content = new StringContent("Provider failure") }));
        var error = await Assert.ThrowsAnyAsync<AppException>(() => Storage(handler).DownloadPdfAsync(
            $"sporthub/coach-credentials/{Guid.NewGuid():N}/{Guid.NewGuid():N}.pdf", default));
        Assert.Equal(status == HttpStatusCode.NotFound ? "credential_file_not_found" : "credential_delivery_failed", error.ErrorCode);
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task Pdf_download_rejects_non_pdf_and_oversized_provider_content(bool oversized)
    {
        var content = oversized ? new ByteArrayContent(new byte[CoachCredentialService.MaxUploadBytes + 1])
            : new ByteArrayContent("<html>Access denied</html>"u8.ToArray());
        var handler = new Handler(_ => Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK) { Content = content }));
        var error = await Assert.ThrowsAnyAsync<AppException>(() => Storage(handler).DownloadPdfAsync(
            $"sporthub/coach-credentials/{Guid.NewGuid():N}/{Guid.NewGuid():N}.pdf", default));
        Assert.Equal("credential_file_invalid", error.ErrorCode);
    }

    [Theory]
    [InlineData("https://example.com/file.pdf")]
    [InlineData("sporthub/avatars/unrelated.pdf")]
    [InlineData("sporthub/coach-credentials/../../file.pdf")]
    public async Task Pdf_download_rejects_ids_outside_the_credential_namespace(string publicId)
    {
        var handler = new Handler(_ => throw new InvalidOperationException("No provider request should be made."));
        await Assert.ThrowsAsync<BadRequestException>(() => Storage(handler).DownloadPdfAsync(publicId, default));
    }

    private static CloudinaryCoachCredentialStorage Storage(Handler handler) => new(
        new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
            { ["CLOUDINARY_URL"] = "cloudinary://test:secret@test" }).Build(), new(handler), new CoachCredentialPdfCache());

    [Theory]
    [InlineData("application/pdf", "raw", ".pdf")]
    [InlineData("image/png", "image", "")]
    public async Task Documents_keep_original_quality_and_use_correct_cloudinary_resource_type(string type, string resource, string extension)
    {
        var coachId = Guid.NewGuid(); var documentId = Guid.NewGuid();
        var id = $"sporthub/coach-credentials/{coachId:N}/{documentId:N}{extension}";
        var handler = new Handler(async request =>
        {
            Assert.NotNull(request.Headers.Authorization);
            Assert.Equal("Basic", request.Headers.Authorization.Scheme);
            var body = await request.Content!.ReadAsStringAsync();
            Assert.DoesNotContain("transformation", body);
            Assert.Contains(id, body);
            Assert.Contains($"/{resource}/", request.RequestUri!.AbsolutePath);
            return new(HttpStatusCode.OK) { Content = new StringContent(request.RequestUri.AbsolutePath.EndsWith("/upload")
                ? System.Text.Json.JsonSerializer.Serialize(new { public_id = id, secure_url = $"https://res.cloudinary.com/test/{resource}/upload/v1/{id}" }) : "{\"result\":\"ok\"}") };
        });
        var config = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?> { ["CLOUDINARY_URL"] = "cloudinary://test:secret@test" }).Build();
        var storage = new CloudinaryCoachCredentialStorage(config, new(handler), new CoachCredentialPdfCache());
        var bytes = type == "application/pdf" ? "%PDF-1.7\nOriginal upload"u8.ToArray() : new byte[] { 1, 2 };
        var uploaded = await storage.UploadAsync(coachId, documentId, bytes, type, default);
        Assert.Equal(id, uploaded.PublicId);
        if (type == "application/pdf") Assert.Same(bytes, await storage.DownloadPdfAsync(id, default));
        await storage.DeleteAsync(id, type, default);
        await Assert.ThrowsAsync<BadRequestException>(() => storage.DeleteAsync("sporthub/avatars/unrelated", type, default));
    }
    [Fact]
    public void File_validation_rejects_empty_oversize_and_mismatched_content()
    {
        Assert.Throws<BadRequestException>(() => CoachCredentialService.ValidateFile([], "image/png"));
        Assert.Throws<BadRequestException>(() => CoachCredentialService.ValidateFile(new byte[CoachCredentialService.MaxUploadBytes + 1], "application/pdf"));
        Assert.Throws<BadRequestException>(() => CoachCredentialService.ValidateFile("%PDF-1.7"u8.ToArray(), "image/jpeg"));
        CoachCredentialService.ValidateFile("%PDF-1.7"u8.ToArray(), "application/pdf");
    }
    private sealed class Handler(Func<HttpRequestMessage, Task<HttpResponseMessage>> handler) : HttpMessageHandler
    { protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken) => handler(request); }
}
