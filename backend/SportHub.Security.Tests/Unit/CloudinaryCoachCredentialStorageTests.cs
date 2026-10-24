using System.Net;
using Microsoft.Extensions.Configuration;
using SportHub.Identity.Infrastructure;
using SportHub.Identity.Application.Services;
using SportHub.BuildingBlocks.SharedKernel.Errors;

namespace SportHub.Security.Tests.Unit;

public sealed class CloudinaryCoachCredentialStorageTests
{
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
        var storage = new CloudinaryCoachCredentialStorage(config, new(handler));
        var uploaded = await storage.UploadAsync(coachId, documentId, [1, 2], type, default);
        Assert.Equal(id, uploaded.PublicId);
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
