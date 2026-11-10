using System.Collections.Concurrent;
using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using SportHub.API.Persistence;
using SportHub.Administration.Application.Interfaces;
using SportHub.Administration.Application.Services;
using SportHub.Administration.Domain.Entities;
using SportHub.Identity.Domain.Enums;
using SportHub.Membership.Domain.Entities;
using SportHub.Scheduling.Catalog.Domain;
using SportHub.Scheduling.Domain.Entities;
using SportHub.Scheduling.Domain.Enums;

namespace SportHub.Security.Tests.Integration;

[Collection(nameof(SportHubApiCollection))]
public sealed class ServiceImagesTests(SportHubApiFactory factory)
{
    private static readonly byte[] Png = Convert.FromBase64String("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jfCkAAAAASUVORK5CYII=");

    [Fact]
    public async Task Public_batches_include_eligible_legacy_services_and_hide_private_services()
    {
        using var harness = await HarnessAsync();
        var active = await PackageAsync();
        var inactive = await PackageAsync(false);
        var published = await ClassAsync(ClassStatus.Published);
        var draft = await ClassAsync(ClassStatus.Draft);
        var court = await RoomAsync();
        var privateRoom = await RoomAsync(false);
        using var anonymous = harness.App.CreateClient();
        var legacy = await anonymous.GetFromJsonAsync<JsonElement>($"/api/service-images/membership/{active}");
        Assert.Equal("0", legacy.GetProperty("version").GetString());
        Assert.Equal(JsonValueKind.Null, legacy.GetProperty("coverImageId").ValueKind);
        Assert.Empty(legacy.GetProperty("images").EnumerateArray());
        var batch = await anonymous.GetFromJsonAsync<JsonElement>($"/api/service-images?kind=membership&ids={inactive},{active},2147483647,{active}");
        Assert.Equal(active, Assert.Single(batch.GetProperty("items").EnumerateArray()).GetProperty("id").GetInt32());
        foreach (var path in new[] { $"membership/{inactive}", $"class/{draft}", $"room/{privateRoom}" })
        {
            Assert.Equal(HttpStatusCode.NotFound, (await anonymous.GetAsync($"/api/service-images/{path}")).StatusCode);
            Assert.Equal(HttpStatusCode.OK, (await harness.Client.GetAsync($"/api/manager/service-images/{path}")).StatusCode);
        }
        Assert.Equal(HttpStatusCode.OK, (await anonymous.GetAsync($"/api/service-images/class/{published}")).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await anonymous.GetAsync($"/api/service-images/room/{court}")).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await anonymous.GetAsync("/api/service-images?kind=class&ids=" + string.Join(',', Enumerable.Repeat("1", 101)))).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await anonymous.GetAsync("/api/service-images/sport/1")).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await anonymous.GetAsync("/api/service-images/room/0")).StatusCode);
    }

    [Fact]
    public async Task Manager_permissions_are_enforced_and_member_cannot_read_staff_rooms()
    {
        using var harness = await HarnessAsync();
        var id = await PackageAsync();
        var path = $"/api/manager/service-images/membership/{id}";
        using var client = harness.App.CreateClient();
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync(path)).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.PutAsJsonAsync(path, Save("0", []))).StatusCode);
        foreach (var role in new[] { UserRole.Member, UserRole.Coach, UserRole.Receptionist, UserRole.SystemAdministrator })
        {
            var user = await factory.SeedUserAsync($"service-images-{Guid.NewGuid():N}@example.com", null, role: role);
            client.DefaultRequestHeaders.Authorization = new("Bearer", factory.IssueToken(user.UserId, role));
            Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync(path)).StatusCode);
            Assert.Equal(HttpStatusCode.Forbidden, (await client.PutAsJsonAsync(path, Save("0", []))).StatusCode);
            using var form = UploadForm(Png);
            Assert.Equal(HttpStatusCode.Forbidden, (await client.PostAsync(path, form)).StatusCode);
            Assert.Equal(HttpStatusCode.Forbidden, (await client.DeleteAsync(path + "/" + Guid.NewGuid())).StatusCode);
            if (role == UserRole.Member) Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync("/api/rooms")).StatusCode);
        }
        Assert.Empty(harness.Storage.Uploads);
    }

    [Fact]
    public async Task Uploads_are_staged_then_atomically_published_reordered_and_removed_with_version_checks()
    {
        using var harness = await HarnessAsync();
        var id = await PackageAsync();
        var path = $"/api/manager/service-images/membership/{id}";
        var first = await UploadAsync(harness.Client, path);
        var second = await UploadAsync(harness.Client, path);
        var firstId = first.GetProperty("imageId").GetString()!;
        var secondId = second.GetProperty("imageId").GetString()!;
        using var anonymous = harness.App.CreateClient();
        var staged = await anonymous.GetFromJsonAsync<JsonElement>($"/api/service-images/membership/{id}");
        Assert.Empty(staged.GetProperty("images").EnumerateArray());
        Assert.Equal("0", staged.GetProperty("version").GetString());
        var response = await harness.Client.PutAsJsonAsync(path, new {
            version = "0", imageIds = new[] { firstId, secondId }, coverImageId = secondId,
            altTexts = new Dictionary<string, string> { [secondId] = "Training floor" }
        });
        await RequireSuccessAsync(response);
        var published = await response.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("1", published.GetProperty("version").GetString());
        Assert.Equal(secondId, published.GetProperty("coverImageId").GetString());
        Assert.Equal("Training floor", published.GetProperty("images")[1].GetProperty("altText").GetString());
        Assert.Equal(HttpStatusCode.Conflict, (await harness.Client.PutAsJsonAsync(path, Save("0", [firstId], firstId))).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, (await harness.Client.DeleteAsync(path + "/" + firstId)).StatusCode);
        response = await harness.Client.PutAsJsonAsync(path, Save("1", [secondId, firstId], firstId));
        await RequireSuccessAsync(response);
        var read = await anonymous.GetFromJsonAsync<JsonElement>($"/api/service-images/membership/{id}");
        Assert.Equal(secondId, read.GetProperty("images")[0].GetProperty("imageId").GetString());
        Assert.Equal(1, read.GetProperty("images")[1].GetProperty("sortOrder").GetInt32());
        response = await harness.Client.PutAsJsonAsync(path, Save("2", [secondId], secondId));
        await RequireSuccessAsync(response);
        using var scope = harness.App.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SportHubDbContext>();
        Assert.False(await db.Set<ServiceImageAsset>().AnyAsync(x => x.ImageId == Guid.Parse(firstId)));
        Assert.True(await db.Set<ServiceImageDeletion>().AnyAsync(x => x.Url == first.GetProperty("url").GetString()));
        Assert.Empty(harness.Storage.Deleted);
        Assert.True(await db.AuditLogs.AnyAsync(x => x.Action == "PUBLISH_SERVICE_IMAGES" && x.TargetEntity == "MembershipPackage" && x.TargetId == id.ToString()));
        response = await harness.Client.PutAsJsonAsync(path, Save("3", []));
        await RequireSuccessAsync(response);
        read = await anonymous.GetFromJsonAsync<JsonElement>($"/api/service-images/membership/{id}");
        Assert.Empty(read.GetProperty("images").EnumerateArray());
        Assert.Equal(JsonValueKind.Null, read.GetProperty("coverImageId").ValueKind);
    }

    [Fact]
    public async Task Pending_uploads_cannot_be_borrowed_across_services_or_managers()
    {
        using var first = await HarnessAsync();
        using var second = await HarnessAsync();
        var id = await PackageAsync();
        var otherId = await PackageAsync();
        var path = $"/api/manager/service-images/membership/{id}";
        var uploaded = await UploadAsync(first.Client, path);
        var imageId = uploaded.GetProperty("imageId").GetString()!;
        Assert.Equal(HttpStatusCode.Forbidden, (await second.Client.PutAsJsonAsync(path, Save("0", [imageId], imageId))).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await second.Client.DeleteAsync(path + "/" + imageId)).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await first.Client.PutAsJsonAsync($"/api/manager/service-images/membership/{otherId}", Save("0", [imageId], imageId))).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await first.Client.PutAsJsonAsync(path, Save("0", [imageId, imageId], imageId))).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, (await first.Client.DeleteAsync(path + "/" + imageId)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await first.Client.DeleteAsync(path + "/" + imageId)).StatusCode);
    }

    [Fact]
    public async Task Published_class_photos_can_change_without_changing_its_operational_version_or_lifecycle()
    {
        using var harness = await HarnessAsync();
        var id = await ClassAsync(ClassStatus.Published);
        var path = $"/api/manager/service-images/class/{id}";
        var image = await UploadAsync(harness.Client, path);
        var imageId = image.GetProperty("imageId").GetString()!;
        await RequireSuccessAsync(await harness.Client.PutAsJsonAsync(path, Save("0", [imageId], imageId)));
        using var scope = harness.App.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SportHubDbContext>();
        var course = await db.Classes.SingleAsync(x => x.ClassId == id);
        Assert.Equal(ClassStatus.Published, course.Status);
        Assert.Equal(0, course.Version);
        using var anonymous = harness.App.CreateClient();
        Assert.Single((await anonymous.GetFromJsonAsync<JsonElement>($"/api/service-images/class/{id}")).GetProperty("images").EnumerateArray());
        var sport = await db.Sports.SingleAsync(x => x.SportId == course.SportId);
        sport.IsActive = false;
        await db.SaveChangesAsync();
        Assert.Equal(HttpStatusCode.NotFound, (await anonymous.GetAsync($"/api/service-images/class/{id}")).StatusCode);
        sport.IsActive = true;
        course.Status = ClassStatus.Draft;
        await db.SaveChangesAsync();
        Assert.Equal(HttpStatusCode.NotFound, (await anonymous.GetAsync($"/api/service-images/class/{id}")).StatusCode);
    }

    [Fact]
    public async Task Court_photos_belong_to_the_physical_room_and_follow_room_type_visibility()
    {
        using var harness = await HarnessAsync();
        var id = await RoomAsync();
        var path = $"/api/manager/service-images/room/{id}";
        var uploaded = await UploadAsync(harness.Client, path);
        var imageId = uploaded.GetProperty("imageId").GetString()!;
        await RequireSuccessAsync(await harness.Client.PutAsJsonAsync(path, Save("0", [imageId], imageId)));
        using var scope = harness.App.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SportHubDbContext>();
        var room = await db.Rooms.SingleAsync(x => x.RoomId == id);
        var sport = new Sport { Code = "ROOM-PHOTO-" + Guid.NewGuid().ToString("N"), Name = "Unrelated sport " + Guid.NewGuid(), IsActive = false };
        var type = new RoomType { Name = "Photo room type " + Guid.NewGuid() };
        db.Sports.Add(sport);
        db.RoomTypes.Add(type);
        await db.SaveChangesAsync();
        room.SportId = sport.SportId;
        room.RoomTypeId = type.RoomTypeId;
        await db.SaveChangesAsync();
        using var anonymous = harness.App.CreateClient();
        var read = await anonymous.GetFromJsonAsync<JsonElement>($"/api/service-images/room/{id}");
        Assert.Equal(imageId, read.GetProperty("coverImageId").GetString());
        type.IsActive = false;
        await db.SaveChangesAsync();
        Assert.Equal(HttpStatusCode.NotFound, (await anonymous.GetAsync($"/api/service-images/room/{id}")).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await harness.Client.GetAsync(path)).StatusCode);
    }

    [Fact]
    public async Task Invalid_files_cover_and_limits_are_rejected_before_the_public_gallery_changes()
    {
        using var harness = await HarnessAsync();
        var id = await PackageAsync();
        var path = $"/api/manager/service-images/membership/{id}";
        var zeroWidth = Png.ToArray();
        Array.Clear(zeroWidth, 16, 4);
        foreach (var bytes in new[] { new byte[] { 1, 2, 3 }, Png[..20], zeroWidth, new byte[10 * 1024 * 1024 + 1] })
        {
            using var form = UploadForm(bytes);
            Assert.Equal(HttpStatusCode.BadRequest, (await harness.Client.PostAsync(path, form)).StatusCode);
        }
        Assert.Empty(harness.Storage.Uploads);
        var image = await UploadAsync(harness.Client, path);
        var imageId = image.GetProperty("imageId").GetString()!;
        Assert.Equal(HttpStatusCode.BadRequest, (await harness.Client.PutAsJsonAsync(path, Save("0", [imageId]))).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await harness.Client.PutAsJsonAsync(path, Save("0", Enumerable.Range(0, 7).Select(_ => Guid.NewGuid().ToString()).ToArray(), imageId))).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await harness.Client.PutAsJsonAsync(path, Save("broken", [imageId], imageId))).StatusCode);
        using var scope = harness.App.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SportHubDbContext>();
        for (var i = 0; i < 11; i++) db.Set<ServiceImageAsset>().Add(new() {
            ImageId = Guid.NewGuid(), Kind = "membership", ServiceId = id, UploadedByUserId = harness.Actor,
            Url = "https://res.cloudinary.com/tests/image/upload/pending.png", PublicId = "sporthub/media/pending/" + Guid.NewGuid().ToString("N"),
            Width = 1, Height = 1, CreatedAtUtc = DateTime.UtcNow
        });
        await db.SaveChangesAsync();
        using var limited = UploadForm(Png);
        Assert.Equal(HttpStatusCode.Conflict, (await harness.Client.PostAsync(path, limited)).StatusCode);
        Assert.Single(harness.Storage.Uploads);
    }

    [Fact]
    public async Task Concurrent_first_saves_accept_only_one_version()
    {
        using var harness = await HarnessAsync();
        var id = await PackageAsync();
        var path = $"/api/manager/service-images/membership/{id}";
        var responses = await Task.WhenAll(Enumerable.Range(0, 2).Select(_ => harness.Client.PutAsJsonAsync(path, Save("0", []))));
        Assert.Single(responses, x => x.StatusCode == HttpStatusCode.OK);
        Assert.Single(responses, x => x.StatusCode == HttpStatusCode.Conflict);
    }

    [Fact]
    public async Task Cleanup_retries_failed_deletion_and_preserves_shared_fallback_images()
    {
        using var harness = await HarnessAsync();
        var id = await PackageAsync();
        var path = $"/api/manager/service-images/membership/{id}";
        var image = await UploadAsync(harness.Client, path);
        var imageId = image.GetProperty("imageId").GetString()!;
        await RequireSuccessAsync(await harness.Client.PutAsJsonAsync(path, Save("0", [imageId], imageId)));
        await RequireSuccessAsync(await harness.Client.PutAsJsonAsync(path, Save("1", [])));
        using var scope = harness.App.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SportHubDbContext>();
        var cleanup = scope.ServiceProvider.GetRequiredService<ServiceImageCleanupService>();
        var url = image.GetProperty("url").GetString()!;
        var publicId = Assert.Single(harness.Storage.Uploads);
        var fallback = new Sport { Code = "IMG-" + Guid.NewGuid().ToString("N"), Name = "Shared " + Guid.NewGuid(),
            ImageUrl = url.Replace("/upload/", "/upload/c_fill,w_800/") };
        db.Sports.Add(fallback);
        await db.SaveChangesAsync();
        await RequireSuccessAsync(await harness.Client.PutAsJsonAsync($"/api/manager/sports/{fallback.SportId}", new {
            name = fallback.Name, imageUrl = fallback.ImageUrl, services = Array.Empty<object>()
        }));
        await cleanup.ProcessAsync(CancellationToken.None);
        Assert.DoesNotContain(publicId, harness.Storage.Deleted);
        var deletion = await db.Set<ServiceImageDeletion>().SingleAsync(x => x.Url == url);
        Assert.Equal(0, deletion.Attempts);
        fallback.ImageUrl = null;
        deletion.NextAttemptAtUtc = DateTime.UtcNow.AddMinutes(-1);
        await db.SaveChangesAsync();
        harness.Storage.FailDeletes = true;
        await cleanup.ProcessAsync(CancellationToken.None);
        Assert.Equal(1, deletion.Attempts);
        Assert.DoesNotContain(publicId, harness.Storage.Deleted);
        harness.Storage.FailDeletes = false;
        deletion.NextAttemptAtUtc = DateTime.UtcNow.AddMinutes(-1);
        await db.SaveChangesAsync();
        await cleanup.ProcessAsync(CancellationToken.None);
        Assert.Contains(publicId, harness.Storage.Deleted);
        Assert.True(await db.Set<ServiceImageDeletion>().AnyAsync(x => x.Url == url && x.CompletedAtUtc != null));
    }

    [Fact]
    public async Task Abandoned_uploads_expire_without_changing_published_photos()
    {
        using var harness = await HarnessAsync();
        var id = await PackageAsync();
        var path = $"/api/manager/service-images/membership/{id}";
        var published = await UploadAsync(harness.Client, path);
        var staged = await UploadAsync(harness.Client, path);
        var publishedId = published.GetProperty("imageId").GetString()!;
        var stagedId = Guid.Parse(staged.GetProperty("imageId").GetString()!);
        await RequireSuccessAsync(await harness.Client.PutAsJsonAsync(path, Save("0", [publishedId], publishedId)));
        using var scope = harness.App.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SportHubDbContext>();
        var asset = await db.Set<ServiceImageAsset>().SingleAsync(x => x.ImageId == stagedId);
        var publicId = asset.PublicId;
        asset.CreatedAtUtc = DateTime.UtcNow.AddDays(-2);
        await db.SaveChangesAsync();
        await scope.ServiceProvider.GetRequiredService<ServiceImageCleanupService>().ProcessAsync(CancellationToken.None);
        Assert.False(await db.Set<ServiceImageAsset>().AnyAsync(x => x.ImageId == stagedId));
        Assert.True(await db.Set<ServiceImageAsset>().AnyAsync(x => x.ImageId == Guid.Parse(publishedId) && x.IsPublished));
        Assert.Contains(publicId, harness.Storage.Deleted);
    }

    [Fact]
    public async Task Invalid_storage_dimensions_roll_back_staging_and_queue_the_unused_private_upload()
    {
        using var harness = await HarnessAsync();
        var id = await PackageAsync();
        var path = $"/api/manager/service-images/membership/{id}";
        harness.Storage.InvalidDimensions = true;
        using var form = UploadForm(Png);
        Assert.Equal(HttpStatusCode.ServiceUnavailable, (await harness.Client.PostAsync(path, form)).StatusCode);
        var publicId = Assert.Single(harness.Storage.Uploads);
        using var scope = harness.App.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SportHubDbContext>();
        Assert.False(await db.Set<ServiceImageAsset>().AnyAsync(x => x.PublicId == publicId));
        Assert.True(await db.Set<ServiceImageDeletion>().AnyAsync(x => x.PublicId == publicId));
        await scope.ServiceProvider.GetRequiredService<ServiceImageCleanupService>().ProcessAsync(CancellationToken.None);
        Assert.Contains(publicId, harness.Storage.Deleted);
        using var anonymous = harness.App.CreateClient();
        var gallery = await anonymous.GetFromJsonAsync<JsonElement>($"/api/service-images/membership/{id}");
        Assert.Empty(gallery.GetProperty("images").EnumerateArray());
        Assert.Equal("0", gallery.GetProperty("version").GetString());
    }

    [Fact]
    public async Task Deleting_an_unused_physical_room_cleans_its_detached_gallery()
    {
        using var harness = await HarnessAsync();
        var id = await RoomAsync();
        var path = $"/api/manager/service-images/room/{id}";
        var image = await UploadAsync(harness.Client, path);
        var imageId = image.GetProperty("imageId").GetString()!;
        var publicId = Assert.Single(harness.Storage.Uploads);
        await RequireSuccessAsync(await harness.Client.PutAsJsonAsync(path, Save("0", [imageId], imageId)));
        Assert.Equal(HttpStatusCode.NoContent, (await harness.Client.DeleteAsync($"/api/rooms/{id}")).StatusCode);
        using var scope = harness.App.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SportHubDbContext>();
        Assert.False(await db.Rooms.AnyAsync(x => x.RoomId == id));
        await scope.ServiceProvider.GetRequiredService<ServiceImageCleanupService>().ProcessAsync(CancellationToken.None);
        Assert.False(await db.Set<ServiceImageGallery>().AnyAsync(x => x.Kind == "room" && x.ServiceId == id));
        Assert.False(await db.Set<ServiceImageAsset>().AnyAsync(x => x.ImageId == Guid.Parse(imageId)));
        Assert.Contains(publicId, harness.Storage.Deleted);
    }

    [Fact]
    public async Task Sport_attachment_waits_for_cleanup_and_cannot_republish_a_deleted_image()
    {
        using var harness = await HarnessAsync();
        var id = await PackageAsync();
        var path = $"/api/manager/service-images/membership/{id}";
        var image = await UploadAsync(harness.Client, path);
        var imageId = image.GetProperty("imageId").GetString()!;
        var url = image.GetProperty("url").GetString()!;
        var publicId = Assert.Single(harness.Storage.Uploads);
        await RequireSuccessAsync(await harness.Client.PutAsJsonAsync(path, Save("0", [imageId], imageId)));
        await RequireSuccessAsync(await harness.Client.PutAsJsonAsync(path, Save("1", [])));
        harness.Storage.BlockDeleteId = publicId;
        using var scope = harness.App.Services.CreateScope();
        using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(15));
        var cleaning = scope.ServiceProvider.GetRequiredService<ServiceImageCleanupService>().ProcessAsync(timeout.Token);
        await harness.Storage.DeleteEntered.Task.WaitAsync(timeout.Token);
        var attaching = harness.Client.PostAsJsonAsync("/api/manager/sports", new {
            name = "Media race " + Guid.NewGuid(), imageUrl = url, services = Array.Empty<object>()
        }, timeout.Token);
        try
        {
            var waiting = Task.Delay(250, timeout.Token);
            Assert.Same(waiting, await Task.WhenAny(attaching, waiting));
        }
        finally { harness.Storage.AllowDelete.TrySetResult(); }
        await cleaning;
        Assert.Equal(HttpStatusCode.Conflict, (await attaching).StatusCode);
        var db = scope.ServiceProvider.GetRequiredService<SportHubDbContext>();
        Assert.True(await db.Set<ServiceImageDeletion>().AnyAsync(x => x.PublicId == publicId && x.CompletedAtUtc != null));
        Assert.False(await db.Sports.AnyAsync(x => x.ImageUrl == url));
        var landing = await harness.Client.GetFromJsonAsync<JsonElement>("/api/landing-page");
        var updateLanding = await harness.Client.PutAsJsonAsync("/api/landing-page", new {
            revision = landing.GetProperty("revision").GetGuid(), values = new Dictionary<string, string> {
                ["bookmarks.coachIds"] = string.Join(',', Enumerable.Range(0, 3).Select(_ => Guid.NewGuid())),
                ["hero.image"] = url
            }
        });
        Assert.Equal(HttpStatusCode.Conflict, updateLanding.StatusCode);
        Assert.Contains("media_image_retired", await updateLanding.Content.ReadAsStringAsync());
    }

    private static object Save(string version, string[] imageIds, string? coverImageId = null) => new { version, imageIds, coverImageId };

    [Fact]
    public async Task Coach_gallery_reads_match_current_class_assignments_and_manager_published_photos()
    {
        using var harness = await HarnessAsync();
        var coach = await factory.SeedUserAsync($"gallery-coach-{Guid.NewGuid():N}@example.com", null, role: UserRole.Coach);
        var own = await ClassAsync(ClassStatus.InProgress);
        var other = await ClassAsync(ClassStatus.Published);
        var draft = await ClassAsync(ClassStatus.Draft);
        var completed = await ClassAsync(ClassStatus.Completed);
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SportHubDbContext>();
        foreach (var id in new[] { own, draft, completed })
            (await db.Classes.SingleAsync(x => x.ClassId == id)).CoachId = coach.UserId;
        var ownClass = await db.Classes.SingleAsync(x => x.ClassId == own);
        (await db.Sports.SingleAsync(x => x.SportId == ownClass.SportId)).IsActive = false;
        await db.SaveChangesAsync();
        var path = $"/api/manager/service-images/class/{own}";
        var photo = await UploadAsync(harness.Client, path);
        var imageId = photo.GetProperty("imageId").GetString()!;
        await RequireSuccessAsync(await harness.Client.PutAsJsonAsync(path, Save("0", [imageId], imageId)));
        await UploadAsync(harness.Client, path); // A later staged upload must remain private.
        using var client = harness.App.CreateClient();
        client.DefaultRequestHeaders.Authorization = new("Bearer", factory.IssueToken(coach.UserId, UserRole.Coach));
        var result = await client.GetFromJsonAsync<JsonElement>($"/api/coaches/me/class-images?ids={own},{other},{draft},{completed}");
        var gallery = Assert.Single(result.GetProperty("items").EnumerateArray());
        Assert.Equal(own, gallery.GetProperty("id").GetInt32());
        Assert.Equal(imageId, gallery.GetProperty("coverImageId").GetString());
        Assert.Single(gallery.GetProperty("images").EnumerateArray());
        Assert.Equal(HttpStatusCode.Forbidden, (await client.PutAsJsonAsync(path, Save("1", []))).StatusCode);
        ownClass.CoachId = null;
        await db.SaveChangesAsync();
        result = await client.GetFromJsonAsync<JsonElement>($"/api/coaches/me/class-images?ids={own}");
        Assert.Empty(result.GetProperty("items").EnumerateArray());
    }

    [Fact]
    public async Task Substitute_image_reads_end_when_the_assigned_session_is_cancelled()
    {
        using var harness = await HarnessAsync();
        var coach = await factory.SeedUserAsync($"gallery-substitute-{Guid.NewGuid():N}@example.com", null, role: UserRole.Coach);
        var id = await ClassAsync(ClassStatus.InProgress);
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SportHubDbContext>();
        var course = await db.Classes.SingleAsync(x => x.ClassId == id);
        var session = new ClassSession { SessionId = Guid.NewGuid(), ClassId = id, RoomId = course.DefaultRoomId,
            CoachId = coach.UserId, SessionNo = 1, StartAtUtc = DateTime.UtcNow.AddDays(1), EndAtUtc = DateTime.UtcNow.AddDays(1).AddHours(1),
            Status = ClassSessionStatus.Scheduled };
        db.ClassSessions.Add(session);
        await db.SaveChangesAsync();
        using var client = harness.App.CreateClient();
        client.DefaultRequestHeaders.Authorization = new("Bearer", factory.IssueToken(coach.UserId, UserRole.Coach));
        var result = await client.GetFromJsonAsync<JsonElement>($"/api/coaches/me/class-images?ids={id}");
        Assert.Single(result.GetProperty("items").EnumerateArray());
        session.Status = ClassSessionStatus.Cancelled;
        await db.SaveChangesAsync();
        result = await client.GetFromJsonAsync<JsonElement>($"/api/coaches/me/class-images?ids={id}");
        Assert.Empty(result.GetProperty("items").EnumerateArray());
    }

    [Fact]
    public async Task Coach_gallery_endpoint_requires_the_coach_role_and_valid_class_ids()
    {
        using var harness = await HarnessAsync();
        using var client = harness.App.CreateClient();
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync("/api/coaches/me/class-images?ids=1")).StatusCode);
        foreach (var role in new[] { UserRole.Member, UserRole.Receptionist, UserRole.CenterManager, UserRole.SystemAdministrator })
        {
            var user = await factory.SeedUserAsync($"gallery-role-{Guid.NewGuid():N}@example.com", null, role: role);
            client.DefaultRequestHeaders.Authorization = new("Bearer", factory.IssueToken(user.UserId, role));
            Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync("/api/coaches/me/class-images?ids=1")).StatusCode);
        }
        var coach = await factory.SeedUserAsync($"gallery-invalid-{Guid.NewGuid():N}@example.com", null, role: UserRole.Coach);
        client.DefaultRequestHeaders.Authorization = new("Bearer", factory.IssueToken(coach.UserId, UserRole.Coach));
        foreach (var ids in new[] { "0", "-1", "oops", string.Join(',', Enumerable.Repeat("1", 101)) })
            Assert.Equal(HttpStatusCode.BadRequest, (await client.GetAsync($"/api/coaches/me/class-images?ids={ids}")).StatusCode);
    }

    private async Task<Harness> HarnessAsync()
    {
        var manager = await factory.SeedUserAsync($"gallery-manager-{Guid.NewGuid():N}@example.com", null, role: UserRole.CenterManager);
        var storage = new FakeStorage();
        var app = factory.WithWebHostBuilder(builder => builder.ConfigureTestServices(services => {
            services.RemoveAll<IMediaImageStorage>();
            services.AddSingleton<IMediaImageStorage>(storage);
        }));
        var client = app.CreateClient();
        client.DefaultRequestHeaders.Authorization = new("Bearer", factory.IssueToken(manager.UserId, UserRole.CenterManager));
        return new(app, client, storage, manager.UserId);
    }

    private async Task<int> PackageAsync(bool active = true)
    {
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SportHubDbContext>();
        var package = new MembershipPackage { Name = "Photo package " + Guid.NewGuid(), IsActive = active, Price = 10000, DurationDays = 30 };
        db.MembershipPackages.Add(package);
        await db.SaveChangesAsync();
        return package.PackageId;
    }

    private async Task<int> RoomAsync(bool rental = true)
    {
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SportHubDbContext>();
        var room = new Room { Name = "Photo court " + Guid.NewGuid(), Capacity = 12, AllowRental = rental };
        db.Rooms.Add(room);
        await db.SaveChangesAsync();
        return room.RoomId;
    }

    private async Task<int> ClassAsync(ClassStatus status)
    {
        var roomId = await RoomAsync();
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SportHubDbContext>();
        var sport = new Sport { Code = "PHOTO-" + Guid.NewGuid().ToString("N"), Name = "Photo sport " + Guid.NewGuid() };
        db.Sports.Add(sport);
        await db.SaveChangesAsync();
        var course = new Class { Code = "PHOTO-" + Guid.NewGuid().ToString("N"), Name = "Photo class", SportId = sport.SportId,
            DefaultRoomId = roomId, StartDate = DateOnly.FromDateTime(DateTime.UtcNow.AddMonths(1)), NumSessions = 8,
            Capacity = 12, Price = 10000, Status = status, CreatedAt = DateTime.UtcNow };
        db.Classes.Add(course);
        await db.SaveChangesAsync();
        return course.ClassId;
    }

    private static async Task<JsonElement> UploadAsync(HttpClient client, string path)
    {
        using var form = UploadForm(Png);
        var response = await client.PostAsync(path, form);
        await RequireSuccessAsync(response);
        return await response.Content.ReadFromJsonAsync<JsonElement>();
    }

    private static MultipartFormDataContent UploadForm(byte[] bytes)
    {
        var form = new MultipartFormDataContent();
        var file = new ByteArrayContent(bytes);
        file.Headers.ContentType = new MediaTypeHeaderValue("image/png");
        form.Add(file, "file", "training.png");
        return form;
    }

    private static async Task RequireSuccessAsync(HttpResponseMessage response)
        => Assert.True(response.IsSuccessStatusCode, $"HTTP {(int)response.StatusCode}: {await response.Content.ReadAsStringAsync()}");

    private sealed record Harness(WebApplicationFactory<Program> App, HttpClient Client, FakeStorage Storage, Guid Actor) : IDisposable
    {
        public void Dispose() { Client.Dispose(); App.Dispose(); }
    }

    private sealed class FakeStorage : IMediaImageStorage
    {
        public ConcurrentBag<string> Uploads { get; } = [];
        public ConcurrentBag<string> Deleted { get; } = [];
        public bool FailDeletes { get; set; }
        public bool InvalidDimensions { get; set; }
        public string? BlockDeleteId { get; set; }
        public TaskCompletionSource DeleteEntered { get; } = new(TaskCreationOptions.RunContinuationsAsynchronously);
        public TaskCompletionSource AllowDelete { get; } = new(TaskCreationOptions.RunContinuationsAsynchronously);
        public Task<StoredMediaImage> UploadAsync(Guid actorId, byte[] bytes, string contentType, CancellationToken ct)
        {
            var publicId = $"sporthub/media/{actorId:N}/{Guid.NewGuid():N}";
            Uploads.Add(publicId);
            return Task.FromResult(new StoredMediaImage($"https://res.cloudinary.com/tests/image/upload/{publicId}.png", publicId, InvalidDimensions ? 0 : 1, 1));
        }
        public async Task DeleteAsync(string publicId, CancellationToken ct)
        {
            if (publicId == BlockDeleteId)
            {
                DeleteEntered.TrySetResult();
                await AllowDelete.Task.WaitAsync(ct);
            }
            if (FailDeletes) throw new HttpRequestException("Temporary image storage outage");
            Deleted.Add(publicId);
        }
    }
}
