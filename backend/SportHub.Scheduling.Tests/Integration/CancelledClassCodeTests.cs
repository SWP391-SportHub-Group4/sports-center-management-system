using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using SportHub.Identity.Domain.Enums;
using SportHub.Scheduling.Domain.Enums;

namespace SportHub.Scheduling.Tests.Integration;

[Collection(nameof(SchedulingApiCollection))]
public sealed class CancelledClassCodeTests(SchedulingApiFactory factory)
{
    [Fact]
    public async Task Cancelling_successive_classes_releases_the_original_code_and_preserves_sessions()
    {
        var course = await CourseTestData.CreateAsync(factory);
        using var manager = factory.CreateApiClient(course.ManagerId, UserRole.CenterManager);
        var originalCode = course.Request.Code.ToUpperInvariant();
        var sessionIds = (await CourseTestData.SessionsAsync(factory, course.Id)).Select(s => s.SessionId).Order().ToArray();

        async Task Cancel(int id)
        {
            var preview = await manager.GetFromJsonAsync<JsonElement>($"api/manager/classes/{id}/cancellation-preview");
            var response = await manager.PostAsJsonAsync($"api/manager/classes/{id}/cancel", new
            {
                reason = "Release this class code", previewToken = preview.GetProperty("previewToken").GetString()
            });
            Assert.True(response.IsSuccessStatusCode, await response.Content.ReadAsStringAsync());
        }

        await Cancel(course.Id);
        Assert.Equal($"{originalCode}_Cancel_{course.Id}", await factory.QueryAsync(db =>
            db.Classes.Where(c => c.ClassId == course.Id).Select(c => c.Code).SingleAsync()));
        Assert.Equal(sessionIds, (await CourseTestData.SessionsAsync(factory, course.Id)).Select(s => s.SessionId).Order().ToArray());

        var created = await manager.PostAsJsonAsync("api/manager/classes", course.Request);
        Assert.True(created.IsSuccessStatusCode, await created.Content.ReadAsStringAsync());
        var replacementId = (await created.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("classId").GetInt32();
        Assert.NotEqual(course.Id, replacementId);
        await Cancel(replacementId);
        // Retrying cancellation must never append another suffix.
        await Cancel(replacementId);
        Assert.Equal($"{originalCode}_Cancel_{replacementId}", await factory.QueryAsync(db =>
            db.Classes.Where(c => c.ClassId == replacementId).Select(c => c.Code).SingleAsync()));
        Assert.Equal(2, await factory.QueryAsync(db => db.Classes.CountAsync(c =>
            (c.ClassId == course.Id || c.ClassId == replacementId) && c.Status == ClassStatus.Cancelled)));
    }

    [Fact]
    public async Task Database_bulk_cancellation_archives_code_once_and_closes_enrollment()
    {
        var course = await CourseTestData.CreateAsync(factory, publish: false);
        for (var retry = 0; retry < 2; retry++)
            await factory.QueryAsync(db => db.Classes.Where(c => c.ClassId == course.Id)
                .ExecuteUpdateAsync(s => s.SetProperty(c => c.Status, ClassStatus.Cancelled)));
        var result = await factory.QueryAsync(db => db.Classes.Where(c => c.ClassId == course.Id)
            .Select(c => new { c.Code, c.EnrollmentOpen }).SingleAsync());
        Assert.Equal($"{course.Request.Code.ToUpperInvariant()}_Cancel_{course.Id}", result.Code);
        Assert.False(result.EnrollmentOpen);
    }

    [Fact]
    public async Task Creating_or_renaming_a_draft_cannot_claim_a_cancellation_code()
    {
        var course = await CourseTestData.CreateAsync(factory, publish: false);
        using var manager = factory.CreateApiClient(course.ManagerId, UserRole.CenterManager);
        course.Request.Code = "RESERVED_Cancel_" + course.Id;
        foreach (var response in new[]
        {
            await manager.PostAsJsonAsync("api/manager/classes", course.Request),
            await manager.PutAsJsonAsync($"api/manager/classes/{course.Id}", course.Request)
        })
        {
            Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
            Assert.Equal("class_code_reserved", (await response.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("error").GetString());
        }
    }
}
