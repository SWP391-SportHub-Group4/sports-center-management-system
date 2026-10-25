using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using Microsoft.AspNetCore.TestHost;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using SportHub.API.Persistence;
using SportHub.Identity.Application.Interfaces;
using SportHub.Identity.Application.Services;
using SportHub.Identity.Domain.Enums;

namespace SportHub.Security.Tests.Integration;

[Collection(nameof(SportHubApiCollection))]
public sealed class ManagerOwnAvatarTests(SportHubApiFactory factory)
{
    [Fact]
    public async Task Manager_can_upload_replace_and_remove_own_avatar_without_exposing_it_to_guests()
    {
        var manager = await factory.SeedUserAsync($"own-avatar-{Guid.NewGuid():N}@example.com", null,
            role: UserRole.CenterManager);
        var storage = new FakeAvatarStorage();
        using var host = factory.WithWebHostBuilder(builder => builder.ConfigureTestServices(services =>
        {
            services.RemoveAll<IAvatarStorage>();
            services.AddSingleton<IAvatarStorage>(storage);
        }));
        using var client = host.CreateClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer",
            factory.IssueToken(manager.UserId, UserRole.CenterManager));

        async Task<AvatarResponse> Upload()
        {
            using var form = new MultipartFormDataContent();
            using var image = new ByteArrayContent([0xff, 0xd8, 0xff]);
            image.Headers.ContentType = new MediaTypeHeaderValue("image/jpeg");
            form.Add(image, "file", "avatar.jpg");
            var response = await client.PostAsync("/api/avatars/me", form);
            Assert.Equal(HttpStatusCode.OK, response.StatusCode);
            return (await response.Content.ReadFromJsonAsync<AvatarResponse>())!;
        }

        var first = await Upload();
        var second = await Upload();
        Assert.NotEqual(first.AvatarUrl, second.AvatarUrl);
        Assert.Contains(storage.Uploaded[0], storage.Deleted);
        Assert.Equal(second.AvatarUrl,
            (await client.GetFromJsonAsync<AvatarResponse>($"/api/avatars/{manager.UserId}"))!.AvatarUrl);
        using var guest = host.CreateClient();
        Assert.Equal(HttpStatusCode.Forbidden,
            (await guest.GetAsync($"/api/avatars/{manager.UserId}")).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized,
            (await guest.DeleteAsync("/api/avatars/me")).StatusCode);

        Assert.Equal(HttpStatusCode.OK, (await client.DeleteAsync("/api/avatars/me")).StatusCode);
        Assert.Contains(storage.Uploaded[1], storage.Deleted);
        using var scope = host.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SportHubDbContext>();
        var profile = await db.UserProfiles.SingleAsync(p => p.UserId == manager.UserId);
        Assert.Null(profile.AvatarUrl);
        Assert.Null(profile.AvatarPublicId);
        Assert.True(await db.AuditLogs.AnyAsync(a => a.Action == "UPDATE_AVATAR"
            && a.TargetId == manager.UserId.ToString()));
        Assert.True(await db.AuditLogs.AnyAsync(a => a.Action == "DELETE_AVATAR"
            && a.TargetId == manager.UserId.ToString()));
    }

    private sealed class FakeAvatarStorage : IAvatarStorage
    {
        public List<string> Uploaded { get; } = [];
        public List<string> Deleted { get; } = [];

        public Task<StoredAvatar> UploadAsync(Guid userId, byte[] image, string contentType, CancellationToken ct)
        {
            var id = $"sporthub/avatars/{userId:N}/{Guid.NewGuid():N}";
            Uploaded.Add(id);
            return Task.FromResult(new StoredAvatar($"https://res.cloudinary.com/test/image/upload/{id}.jpg", id));
        }

        public Task DeleteAsync(string publicId, CancellationToken ct)
        {
            Deleted.Add(publicId);
            return Task.CompletedTask;
        }

        public Task<StoredAvatar> ImportGooglePictureAsync(Guid userId, string pictureUrl, CancellationToken ct)
            => throw new NotSupportedException();
    }
}
