using System.Net;
using System.Text.Json;
using Microsoft.Extensions.Configuration;
using SportHub.Administration.Infrastructure;
using SportHub.BuildingBlocks.SharedKernel.Errors;

namespace SportHub.Security.Tests.Unit;

public sealed class CloudinaryMediaVideoStorageTests
{
    [Theory]
    [InlineData("webm", 7200, false)]
    [InlineData("mp4", 8, true)]
    [InlineData("webm", 0, true)]
    public async Task Originals_are_not_transcoded_duration_is_unrestricted_and_invalid_assets_are_removed(string format, double duration, bool invalid)
    {
        var calls = new List<string>();
        string? uploadBody = null;
        var handler = new StubHandler(async request => {
            calls.Add(request.RequestUri!.AbsolutePath);
            var body = await request.Content!.ReadAsStringAsync();
            if (request.RequestUri.AbsolutePath.EndsWith("/destroy")) return new HttpResponseMessage(HttpStatusCode.OK) { Content = new StringContent("{}") };
            uploadBody = body;
            var parts = (MultipartFormDataContent)request.Content;
            var id = await parts.Single(part => part.Headers.ContentDisposition!.Name!.Trim('"') == "public_id").ReadAsStringAsync();
            return new HttpResponseMessage(HttpStatusCode.OK) { Content = new StringContent(JsonSerializer.Serialize(new {
                public_id = id, secure_url = $"https://res.cloudinary.com/testcloud/video/upload/v1/{id}.{format}",
                width = 1920, height = 1080, format, duration,
            })) };
        });
        var config = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?> { ["CLOUDINARY_URL"] = "cloudinary://key:secret@testcloud" }).Build();
        var storage = new CloudinaryMediaVideoStorage(config, new HttpClient(handler));
        if (invalid)
        {
            await Assert.ThrowsAsync<BadRequestException>(() => storage.UploadAsync(Guid.NewGuid(), [0x1a, 0x45, 0xdf, 0xa3], default));
            Assert.Equal("/v1_1/testcloud/video/destroy", calls[1]);
        }
        else
        {
            var result = await storage.UploadAsync(Guid.NewGuid(), [0x1a, 0x45, 0xdf, 0xa3], default);
            Assert.Equal(duration, result.Duration);
            Assert.EndsWith(".webm", result.Url);
            Assert.Contains("/video/upload/so_0/", result.PosterUrl);
            Assert.EndsWith(".jpg", result.PosterUrl);
        }
        Assert.Equal("/v1_1/testcloud/video/upload", calls[0]);
        Assert.DoesNotContain("transformation", uploadBody!);
        Assert.Contains("video/webm", uploadBody!);
    }

    private sealed class StubHandler(Func<HttpRequestMessage, Task<HttpResponseMessage>> handler) : HttpMessageHandler
    {
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken) => handler(request);
    }
}
