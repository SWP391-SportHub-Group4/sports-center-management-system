using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using SportHub.Administration.Application.Interfaces;
using SportHub.Identity.Domain.Enums;

namespace SportHub.Security.Tests.Integration;

[Collection(nameof(SportHubApiCollection))]
public sealed class LandingMediaEditingTests(SportHubApiFactory factory)
{
    private sealed class LogoStorage : IMediaImageStorage
    {
        public byte[]? Uploaded { get; private set; }
        public Task<StoredMediaImage> UploadAsync(Guid actorId, byte[] bytes, string contentType, CancellationToken ct)
        {
            Uploaded = bytes;
            return Task.FromResult(new StoredMediaImage("https://example.com/logo.png", "sporthub/media/test-logo", 321, 99));
        }
        public Task DeleteAsync(string publicId, CancellationToken ct) => Task.CompletedTask;
    }

    [Fact]
    public async Task Manager_uploads_uncropped_logo_and_publishes_copy_with_revision_checks()
    {
        var manager = await factory.SeedUserAsync($"media-manager-{Guid.NewGuid():N}@example.com", null, role: UserRole.CenterManager);
        var storage = new LogoStorage();
        using var app = factory.WithWebHostBuilder(builder => builder.ConfigureTestServices(services => {
            services.RemoveAll<IMediaImageStorage>();
            services.AddSingleton<IMediaImageStorage>(storage);
        }));
        using var client = app.CreateClient();
        client.DefaultRequestHeaders.Authorization = new("Bearer", factory.IssueToken(manager.UserId, UserRole.CenterManager));
        var bytes = new byte[] { 137, 80, 78, 71, 13, 10, 26, 10, 0, 1, 2, 3 };
        using var form = new MultipartFormDataContent();
        var file = new ByteArrayContent(bytes);
        file.Headers.ContentType = new MediaTypeHeaderValue("image/png");
        form.Add(file, "file", "transparent-logo.png");
        form.Add(new StringContent("logo"), "preset");
        var upload = await client.PostAsync("/api/manager/media/images", form);
        Assert.Equal(HttpStatusCode.OK, upload.StatusCode);
        Assert.Equal(bytes, storage.Uploaded);
        var current = await client.GetFromJsonAsync<JsonElement>("/api/landing-page");
        var coaches = new List<Guid>();
        for (var i = 0; i < 3; i++) coaches.Add((await factory.SeedUserAsync($"media-coach-{Guid.NewGuid():N}@example.com", null, role: UserRole.Coach)).UserId);
        var values = new Dictionary<string, string> {
            ["bookmarks.coachIds"] = string.Join(',', coaches),
            ["hero.title"] = "Train together.\nPlay stronger.",
            ["hero.lead"] = "A training home for every athlete.",
            ["brand.logo.image"] = "https://example.com/logo.png"
        };
        var body = new { revision = current.GetProperty("revision").GetGuid(), values };
        var saved = await client.PutAsJsonAsync("/api/landing-page", body);
        Assert.Equal(HttpStatusCode.OK, saved.StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, (await client.PutAsJsonAsync("/api/landing-page", body)).StatusCode);
        client.DefaultRequestHeaders.Authorization = null;
        var published = await client.GetFromJsonAsync<JsonElement>("/api/landing-page");
        Assert.Equal(values["hero.title"], published.GetProperty("values").GetProperty("hero.title").GetString());
        Assert.Equal(values["brand.logo.image"], published.GetProperty("values").GetProperty("brand.logo.image").GetString());
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.PutAsJsonAsync("/api/landing-page", body)).StatusCode);
        client.DefaultRequestHeaders.Authorization = new("Bearer", factory.IssueToken(manager.UserId, UserRole.CenterManager));
        values["brand.logo.image"] = "javascript:alert(1)";
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PutAsJsonAsync("/api/landing-page", new { revision = published.GetProperty("revision").GetGuid(), values })).StatusCode);
    }
}
