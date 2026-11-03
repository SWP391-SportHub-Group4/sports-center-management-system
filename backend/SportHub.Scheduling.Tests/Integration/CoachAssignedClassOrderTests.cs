using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using SportHub.Identity.Domain.Enums;
using SportHub.Scheduling.Domain.Entities;
using SportHub.Scheduling.Domain.Enums;

namespace SportHub.Scheduling.Tests.Integration;

[Collection(nameof(SchedulingApiCollection))]
public sealed class CoachAssignedClassOrderTests(SchedulingApiFactory factory)
{
    [Fact]
    public async Task Coach_classes_are_ordered_by_status_before_pagination()
    {
        var course = await CourseTestData.CreateAsync(factory, publish: false);
        var expected = await factory.QueryAsync(async db =>
        {
            var original = await db.Classes.SingleAsync(c => c.ClassId == course.Id);
            var classes = new[] { ClassStatus.Cancelled, ClassStatus.Completed, ClassStatus.Published, ClassStatus.InProgress }
                .Select((status, index) => new Class
                {
                    Code = "ORDER-" + Guid.NewGuid().ToString("N"), Name = "Assigned " + status,
                    SportId = original.SportId, CoachId = course.CoachId, DefaultRoomId = course.RoomId,
                    StartDate = original.StartDate, NumSessions = original.NumSessions,
                    SessionMinutes = original.SessionMinutes, Capacity = original.Capacity,
                    Price = original.Price, CostAmount = original.CostAmount, Status = status,
                    CreatedAt = DateTime.UtcNow.AddMinutes(-index)
                }).ToArray();
            db.Classes.AddRange(classes);
            await db.SaveChangesAsync();
            return classes.Reverse().Select(c => c.ClassId).ToArray();
        });
        using var client = factory.CreateApiClient(course.ManagerId, UserRole.CenterManager);
        var actual = new List<int>();
        foreach (var page in new[] { 1, 2 })
        {
            var result = await client.GetFromJsonAsync<JsonElement>(
                $"/api/manager/classes?coachId={course.CoachId}&page={page}&pageSize=2");
            actual.AddRange(result.GetProperty("items").EnumerateArray().Select(c => c.GetProperty("classId").GetInt32()));
        }
        Assert.Equal(expected, actual);
    }
}
