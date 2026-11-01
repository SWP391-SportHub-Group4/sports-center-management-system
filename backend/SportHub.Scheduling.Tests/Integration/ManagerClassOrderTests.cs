using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using SportHub.Identity.Domain.Enums;
using SportHub.Scheduling.Domain.Entities;
using SportHub.Scheduling.Domain.Enums;
using SportHub.Scheduling.Threshold.Domain;

namespace SportHub.Scheduling.Tests.Integration;

[Collection(nameof(SchedulingApiCollection))]
public sealed class ManagerClassOrderTests(SchedulingApiFactory factory)
{
    [Fact]
    public async Task Classes_are_ordered_by_status_then_opening_condition_across_pages()
    {
        var course = await CourseTestData.CreateAsync(factory, publish: false);
        var keyword = "Order-" + Guid.NewGuid().ToString("N");
        var expected = await factory.QueryAsync(async db =>
        {
            var original = await db.Classes.SingleAsync(c => c.ClassId == course.Id);
            var statuses = new[] { ClassStatus.Draft, ClassStatus.Published, ClassStatus.InProgress, ClassStatus.Completed, ClassStatus.Cancelled };
            var conditions = new[] { ThresholdStatus.NotEvaluated, ThresholdStatus.Met, ThresholdStatus.WaivedByManager, ThresholdStatus.AtRisk };
            var classes = statuses.SelectMany(status => conditions.Select(condition => new Class
            {
                Code = Guid.NewGuid().ToString("N"), Name = keyword + " " + status + " " + condition,
                SportId = original.SportId, CoachId = course.CoachId, DefaultRoomId = course.RoomId,
                StartDate = original.StartDate, NumSessions = original.NumSessions,
                SessionMinutes = original.SessionMinutes, Capacity = original.Capacity,
                Price = original.Price, CostAmount = original.CostAmount,
                Status = status, ThresholdStatus = condition
            })).ToArray();
            for (var index = 0; index < classes.Length; index++)
                classes[index].CreatedAt = DateTime.UtcNow.AddMinutes(index);
            db.Classes.AddRange(classes.Reverse());
            await db.SaveChangesAsync();
            return classes.Select(c => c.ClassId).ToArray();
        });
        using var client = factory.CreateApiClient(course.ManagerId, UserRole.CenterManager);
        var actual = new List<int>();
        for (var page = 1; actual.Count < expected.Length; page++)
        {
            var result = await client.GetFromJsonAsync<JsonElement>(
                $"/api/manager/classes?keyword={keyword}&page={page}&pageSize=3");
            var items = result.GetProperty("items").EnumerateArray().ToArray();
            Assert.NotEmpty(items);
            Assert.Equal(expected.Length, result.GetProperty("totalCount").GetInt32());
            actual.AddRange(items.Select(c => c.GetProperty("classId").GetInt32()));
        }
        Assert.Equal(expected, actual);
    }
}
