using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.TestHost;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using SportHub.API.Persistence;
using SportHub.Identity.Application.Interfaces;
using SportHub.Identity.Application.Services;
using SportHub.Identity.Domain.Entities;
using SportHub.Identity.Domain.Enums;

namespace SportHub.Security.Tests.Integration;

[Collection(nameof(SportHubApiCollection))]
public sealed class CoachCredentialTests(SportHubApiFactory factory)
{
    private static readonly byte[] Png = Convert.FromBase64String("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6h4AAAAAASUVORK5CYII=");
    private sealed class DocumentStorage : ICoachCredentialStorage
    {
        public int Uploads; public int Deletions; public bool FailDeletion;
        public Task<StoredCoachCredential> UploadAsync(Guid coachId, Guid id, byte[] bytes, string type, CancellationToken ct)
        { Uploads++; var key = $"sporthub/coach-credentials/{coachId:N}/{id:N}"; return Task.FromResult(new StoredCoachCredential($"https://res.cloudinary.com/test/image/upload/v1/{key}.png", key)); }
        public Task DeleteAsync(string id, string type, CancellationToken ct)
        { Deletions++; if (FailDeletion) throw new HttpRequestException("Temporary storage failure"); return Task.CompletedTask; }
    }
    private HttpClient Client(Microsoft.AspNetCore.Mvc.Testing.WebApplicationFactory<Program> app, Guid id, UserRole role)
    { var client = app.CreateClient(); client.DefaultRequestHeaders.Authorization = new("Bearer", factory.IssueToken(id, role)); return client; }
    private static MultipartFormDataContent Form(string title = "Badminton coaching certificate", bool published = true)
    {
        var form = new MultipartFormDataContent();
        form.Add(new StringContent(title), "title"); form.Add(new StringContent("CERTIFICATE"), "kind");
        form.Add(new StringContent("Sports Federation"), "issuer"); form.Add(new StringContent("2025-06-01"), "issuedOn");
        form.Add(new StringContent(published.ToString()), "isPublished");
        var image = new ByteArrayContent(Png); image.Headers.ContentType = new("image/png"); form.Add(image, "file", "certificate.png"); return form;
    }
    private static object Details(CoachCredentialResponse row, bool published) => new { Kind = row.Kind.ToUpperInvariant(), row.Title, row.Issuer, row.IssuedOn, IsPublished = published, row.Version };

    [Fact]
    public async Task Coach_can_publish_edit_hide_and_remove_only_their_own_documents_with_durable_cleanup()
    {
        var coach = await factory.SeedUserAsync($"certificate-{Guid.NewGuid():N}@example.test", null, role: UserRole.Coach);
        var other = await factory.SeedUserAsync($"other-certificate-{Guid.NewGuid():N}@example.test", null, role: UserRole.Coach);
        var storage = new DocumentStorage();
        using var app = factory.WithWebHostBuilder(b => b.ConfigureTestServices(s => { s.RemoveAll<ICoachCredentialStorage>(); s.AddSingleton<ICoachCredentialStorage>(storage); }));
        using var client = Client(app, coach.UserId, UserRole.Coach);
        using var otherClient = Client(app, other.UserId, UserRole.Coach);
        using var form = Form();
        var upload = await client.PostAsync("/api/coaches/me/credentials", form);
        Assert.Equal(HttpStatusCode.OK, upload.StatusCode);
        var row = (await upload.Content.ReadFromJsonAsync<CoachCredentialResponse>())!;
        // The response DTO converter reads wire enums back into their internal PascalCase names.
        Assert.Contains("\"kind\":\"CERTIFICATE\"", await upload.Content.ReadAsStringAsync());
        Assert.Equal("Certificate", row.Kind);
        Assert.Equal(1, storage.Uploads);
        Assert.Equal("certificate.png", row.FileName);
        using var anonymous = app.CreateClient();
        var path = $"/api/coaches/{coach.UserId}/credentials";
        Assert.Single((await anonymous.GetFromJsonAsync<List<CoachCredentialResponse>>(path))!);
        var catalog = (await anonymous.GetFromJsonAsync<System.Text.Json.JsonElement[]>("/api/coaches"))!;
        Assert.Equal(1, catalog.Single(c => c.GetProperty("userId").GetGuid() == coach.UserId).GetProperty("credentialCount").GetInt32());
        Assert.Equal(HttpStatusCode.NotFound, (await otherClient.PutAsJsonAsync($"/api/coaches/me/credentials/{row.CredentialId}", Details(row, false))).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await otherClient.DeleteAsync($"/api/coaches/me/credentials/{row.CredentialId}")).StatusCode);
        var updated = await client.PutAsJsonAsync($"/api/coaches/me/credentials/{row.CredentialId}", Details(row, false));
        Assert.Equal(HttpStatusCode.OK, updated.StatusCode);
        Assert.Empty((await anonymous.GetFromJsonAsync<List<CoachCredentialResponse>>(path))!);
        catalog = (await anonymous.GetFromJsonAsync<System.Text.Json.JsonElement[]>("/api/coaches"))!;
        Assert.Equal(0, catalog.Single(c => c.GetProperty("userId").GetGuid() == coach.UserId).GetProperty("credentialCount").GetInt32());
        Assert.Single((await client.GetFromJsonAsync<List<CoachCredentialResponse>>("/api/coaches/me/credentials"))!);
        Assert.Equal(HttpStatusCode.Conflict, (await client.PutAsJsonAsync($"/api/coaches/me/credentials/{row.CredentialId}", Details(row, true))).StatusCode);
        storage.FailDeletion = true;
        Assert.Equal(HttpStatusCode.NoContent, (await client.DeleteAsync($"/api/coaches/me/credentials/{row.CredentialId}")).StatusCode);
        Assert.Empty((await client.GetFromJsonAsync<List<CoachCredentialResponse>>("/api/coaches/me/credentials"))!);
        using var scope = app.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SportHubDbContext>();
        var deleted = await db.CoachCredentials.AsNoTracking().SingleAsync(c => c.CredentialId == row.CredentialId);
        Assert.NotNull(deleted.DeletedAtUtc); Assert.Null(deleted.AssetDeletedAtUtc);
        storage.FailDeletion = false;
        await scope.ServiceProvider.GetRequiredService<CoachCredentialService>().ProcessPendingDeletionsAsync(default);
        Assert.NotNull(await db.CoachCredentials.AsNoTracking().Where(c => c.CredentialId == row.CredentialId).Select(c => c.AssetDeletedAtUtc).SingleAsync());
        Assert.Equal(HttpStatusCode.NoContent, (await client.DeleteAsync($"/api/coaches/me/credentials/{row.CredentialId}")).StatusCode);
    }

    [Fact]
    public async Task Anonymous_and_members_cannot_upload_and_invalid_or_empty_documents_are_rejected()
    {
        var coach = await factory.SeedUserAsync($"validation-coach-{Guid.NewGuid():N}@example.test", null, role: UserRole.Coach);
        var member = await factory.SeedUserAsync($"validation-member-{Guid.NewGuid():N}@example.test", null);
        var storage = new DocumentStorage();
        using var app = factory.WithWebHostBuilder(b => b.ConfigureTestServices(s => { s.RemoveAll<ICoachCredentialStorage>(); s.AddSingleton<ICoachCredentialStorage>(storage); }));
        using var anonymous = app.CreateClient(); using var client = Client(app, coach.UserId, UserRole.Coach); using var memberClient = Client(app, member.UserId, UserRole.Member);
        Assert.Equal(HttpStatusCode.Unauthorized, (await anonymous.GetAsync("/api/coaches/me/credentials")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await memberClient.GetAsync("/api/coaches/me/credentials")).StatusCode);
        using var memberForm = Form();
        Assert.Equal(HttpStatusCode.Forbidden, (await memberClient.PostAsync("/api/coaches/me/credentials", memberForm)).StatusCode);
        using var emptyTitle = Form(" ");
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PostAsync("/api/coaches/me/credentials", emptyTitle)).StatusCode);
        using var spoofed = new MultipartFormDataContent();
        spoofed.Add(new StringContent("Fake document"), "title");
        var content = new ByteArrayContent("<svg onload='alert(1)'></svg>"u8.ToArray()); content.Headers.ContentType = new("image/png"); spoofed.Add(content, "file", "photo.png");
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PostAsync("/api/coaches/me/credentials", spoofed)).StatusCode);
        Assert.Equal(0, storage.Uploads);
        Assert.Equal(HttpStatusCode.NotFound, (await anonymous.GetAsync($"/api/coaches/{member.UserId}/credentials")).StatusCode);
    }

    [Fact]
    public async Task Document_limit_is_checked_before_uploading_another_asset()
    {
        var coach = await factory.SeedUserAsync($"limit-coach-{Guid.NewGuid():N}@example.test", null, role: UserRole.Coach);
        var storage = new DocumentStorage();
        using var app = factory.WithWebHostBuilder(b => b.ConfigureTestServices(s => { s.RemoveAll<ICoachCredentialStorage>(); s.AddSingleton<ICoachCredentialStorage>(storage); }));
        using (var scope = app.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<SportHubDbContext>();
            for (var i = 0; i < CoachCredentialService.MaxDocuments; i++)
                db.CoachCredentials.Add(new() { CredentialId = Guid.NewGuid(), CoachUserId = coach.UserId, Title = "Limit test", FileName = "file.pdf", FileUrl = "https://res.cloudinary.com/test/raw/upload/file.pdf", FilePublicId = $"sporthub/coach-credentials/{Guid.NewGuid():N}", ContentType = "application/pdf", SizeBytes = 100, CreatedAtUtc = DateTime.UtcNow, UpdatedAtUtc = DateTime.UtcNow });
            await db.SaveChangesAsync();
        }
        using var client = Client(app, coach.UserId, UserRole.Coach); using var form = Form();
        Assert.Equal(HttpStatusCode.Conflict, (await client.PostAsync("/api/coaches/me/credentials", form)).StatusCode);
        Assert.Equal(0, storage.Uploads);
    }
}
