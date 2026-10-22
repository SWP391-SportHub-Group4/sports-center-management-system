using System.Net;
using System.Text;
using Microsoft.Extensions.Configuration;
using SportHub.BuildingBlocks.SharedKernel.Errors;
using SportHub.Identity.Infrastructure;

namespace SportHub.Security.Tests.Unit;

public sealed class CloudinaryAvatarStorageTests
{
    [Fact]
    public async Task Upload_and_delete_use_backend_basic_auth_and_image_endpoints()
    {
        var calls = new List<(string Path, string Auth, string Body)>();
        var handler = new StubHandler(async request =>
        {
            var body = await request.Content!.ReadAsStringAsync();
            calls.Add((request.RequestUri!.AbsolutePath,
                request.Headers.Authorization?.ToString() ?? "", body));
            var response = request.RequestUri.AbsolutePath.EndsWith("/upload")
                ? "{\"public_id\":\"sporthub/avatars/abc/photo\",\"secure_url\":\"https://res.cloudinary.com/testcloud/image/upload/v1/sporthub/avatars/abc/photo.jpg\"}"
                : "{\"result\":\"ok\"}";
            return new HttpResponseMessage(HttpStatusCode.OK) { Content = new StringContent(response) };
        });
        var configuration = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
        { ["CLOUDINARY_URL"] = "cloudinary://testkey:testsecret@testcloud" }).Build();
        var storage = new CloudinaryAvatarStorage(configuration, new HttpClient(handler));

        var uploaded = await storage.UploadAsync(Guid.NewGuid(), [0xff, 0xd8, 0xff], "image/jpeg", default);
        await storage.DeleteAsync(uploaded.PublicId, default);

        Assert.Equal("/v1_1/testcloud/image/upload", calls[0].Path);
        Assert.Equal("/v1_1/testcloud/image/destroy", calls[1].Path);
        Assert.All(calls, call => Assert.Equal("Basic " + Convert.ToBase64String(Encoding.UTF8.GetBytes("testkey:testsecret")), call.Auth));
        Assert.Contains("c_limit,w_1536,h_1536", calls[0].Body);
        Assert.Contains("sporthub/avatars/abc/photo", calls[1].Body);
        Assert.Contains("invalidate", calls[1].Body);
    }

    [Fact]
    public async Task Missing_credentials_fail_without_sending_a_request()
    {
        var handler = new StubHandler(_ => throw new InvalidOperationException("should not send"));
        var storage = new CloudinaryAvatarStorage(new ConfigurationBuilder().Build(), new HttpClient(handler));
        var error = await Assert.ThrowsAsync<AppException>(() =>
            storage.UploadAsync(Guid.NewGuid(), [1], "image/jpeg", default));
        Assert.Equal("avatar_storage_not_configured", error.ErrorCode);
    }

    private sealed class StubHandler(Func<HttpRequestMessage, Task<HttpResponseMessage>> handler) : HttpMessageHandler
    {
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
            => handler(request);
    }
}
