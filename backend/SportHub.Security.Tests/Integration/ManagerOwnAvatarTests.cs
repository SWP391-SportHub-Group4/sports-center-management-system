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
    public async Task Signed_in_staff_can_resolve_a_receptionist_avatar_but_guests_cannot()
    {
        var receptionist = await factory.SeedUserAsync($"reception-avatar-{Guid.NewGuid():N}@example.com", null, role: UserRole.Receptionist);
        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<SportHubDbContext>();
            var profile = await db.UserProfiles.SingleAsync(p => p.UserId == receptionist.UserId);
            profile.AvatarUrl = "https://res.cloudinary.com/test/image/upload/receptionist.jpg";
            await db.SaveChangesAsync();
        }
        using var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer",
            factory.IssueToken(receptionist.UserId, UserRole.Receptionist));
        var avatar = await client.GetFromJsonAsync<AvatarResponse>($"/api/avatars/{receptionist.UserId}");
        Assert.Equal("https://res.cloudinary.com/test/image/upload/receptionist.jpg", avatar!.AvatarUrl);
        using var guest = factory.CreateClient();
        Assert.Equal(HttpStatusCode.Forbidden, (await guest.GetAsync($"/api/avatars/{receptionist.UserId}")).StatusCode);
    }

    [Theory]
    [InlineData(UserRole.CenterManager, "CENTER_MANAGER")]
    [InlineData(UserRole.SystemAdministrator, "SYSTEM_ADMINISTRATOR")]
    public async Task Manager_and_admin_can_upload_replace_and_remove_own_avatar_without_exposing_it_to_guests(
        UserRole role, string actorRole)
    {
        var owner = await factory.SeedUserAsync($"own-avatar-{Guid.NewGuid():N}@example.com", null, role: role);
        var other = await factory.SeedUserAsync($"other-avatar-{Guid.NewGuid():N}@example.com", null, role: role);
        var storage = new FakeAvatarStorage();
        using var host = factory.WithWebHostBuilder(builder => builder.ConfigureTestServices(services =>
        {
            services.RemoveAll<IAvatarStorage>();
            services.AddSingleton<IAvatarStorage>(storage);
        }));
        using var client = host.CreateClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer",
            factory.IssueToken(owner.UserId, role));

        async Task<HttpResponseMessage> Upload(HttpClient actor)
        {
            using var form = new MultipartFormDataContent();
            using var image = new ByteArrayContent([0xff, 0xd8, 0xff]);
            image.Headers.ContentType = new MediaTypeHeaderValue("image/jpeg");
            form.Add(image, "file", "avatar.jpg");
            return await actor.PostAsync("/api/avatars/me", form);
        }

        using var firstResponse = await Upload(client);
        Assert.Equal(HttpStatusCode.OK, firstResponse.StatusCode);
        var first = (await firstResponse.Content.ReadFromJsonAsync<AvatarResponse>())!;
        using var secondResponse = await Upload(client);
        Assert.Equal(HttpStatusCode.OK, secondResponse.StatusCode);
        var second = (await secondResponse.Content.ReadFromJsonAsync<AvatarResponse>())!;
        Assert.Equal(owner.UserId, first.UserId);
        Assert.Equal(owner.UserId, second.UserId);
        Assert.NotEqual(first.AvatarUrl, second.AvatarUrl);
        Assert.Equal(2, storage.Uploaded.Count);
        Assert.All(storage.Uploaded, id => Assert.StartsWith($"sporthub/avatars/{owner.UserId:N}/", id));
        Assert.Contains(storage.Uploaded[0], storage.Deleted);
        Assert.Equal(second.AvatarUrl,
            (await client.GetFromJsonAsync<AvatarResponse>($"/api/avatars/{owner.UserId}"))!.AvatarUrl);
        using (var uploadedScope = host.Services.CreateScope())
        {
            var uploadedDb = uploadedScope.ServiceProvider.GetRequiredService<SportHubDbContext>();
            var uploadedProfile = await uploadedDb.UserProfiles.SingleAsync(p => p.UserId == owner.UserId);
            Assert.Equal(second.AvatarUrl, uploadedProfile.AvatarUrl);
            Assert.Equal(storage.Uploaded[1], uploadedProfile.AvatarPublicId);
        }
        using var guest = host.CreateClient();
        Assert.Equal(HttpStatusCode.Forbidden,
            (await guest.GetAsync($"/api/avatars/{owner.UserId}")).StatusCode);
        using var guestUpload = await Upload(guest);
        Assert.Equal(HttpStatusCode.Unauthorized, guestUpload.StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized,
            (await guest.DeleteAsync("/api/avatars/me")).StatusCode);

        using var deletedResponse = await client.DeleteAsync("/api/avatars/me");
        Assert.Equal(HttpStatusCode.OK, deletedResponse.StatusCode);
        var deleted = (await deletedResponse.Content.ReadFromJsonAsync<AvatarResponse>())!;
        Assert.Equal(owner.UserId, deleted.UserId);
        Assert.Null(deleted.AvatarUrl);
        Assert.Contains(storage.Uploaded[1], storage.Deleted);
        Assert.Null((await client.GetFromJsonAsync<AvatarResponse>($"/api/avatars/{owner.UserId}"))!.AvatarUrl);
        using var scope = host.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SportHubDbContext>();
        var profile = await db.UserProfiles.SingleAsync(p => p.UserId == owner.UserId);
        Assert.Null(profile.AvatarUrl);
        Assert.Null(profile.AvatarPublicId);
        var otherProfile = await db.UserProfiles.SingleAsync(p => p.UserId == other.UserId);
        Assert.Null(otherProfile.AvatarUrl);
        Assert.Null(otherProfile.AvatarPublicId);
        var events = await db.AuditLogs.Where(a => a.TargetId == owner.UserId.ToString()).ToListAsync();
        Assert.Equal(2, events.Count(a => a.Action == "UPDATE_AVATAR"));
        Assert.Single(events, a => a.Action == "DELETE_AVATAR");
        Assert.All(events, entry =>
        {
            Assert.Equal(owner.UserId, entry.UserId);
            Assert.Equal(actorRole, entry.ActorRole);
            Assert.Equal("UserProfile", entry.TargetEntity);
        });
        Assert.False(await db.AuditLogs.AnyAsync(a => a.TargetId == other.UserId.ToString()));
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
