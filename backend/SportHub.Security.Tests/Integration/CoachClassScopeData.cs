using Microsoft.Extensions.DependencyInjection;
using SportHub.API.Persistence;
using SportHub.Scheduling.Domain.Entities;
using SportHub.Scheduling.Domain.Enums;

namespace SportHub.Security.Tests.Integration;

internal static class CoachClassScopeData
{
    public static async Task AssignAsync(SportHubApiFactory factory, Guid coachId, Guid memberId)
    {
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SportHubDbContext>();
        var room = new Room { Name = "Scope-" + Guid.NewGuid().ToString("N"), RoomTypeId = 3, Capacity = 12 };
        db.Set<Room>().Add(room);
        await db.SaveChangesAsync();
        var course = new Class {
            Code = "SCOPE-" + Guid.NewGuid().ToString("N"), Name = "Active assigned class", SportId = 3,
            CoachId = coachId, DefaultRoomId = room.RoomId, StartDate = DateOnly.FromDateTime(DateTime.UtcNow),
            NumSessions = 3, Capacity = 12, Price = 100000, Status = ClassStatus.Published,
            ConfirmedCount = 1, ReservedCount = 1, CreatedAt = DateTime.UtcNow
        };
        db.Set<Class>().Add(course);
        db.Set<Enrollment>().Add(new Enrollment { EnrollmentId = Guid.NewGuid(), Class = course,
            MemberId = memberId, Status = EnrollmentStatus.Confirmed, EnrolledAt = DateTime.UtcNow });
        await db.SaveChangesAsync();
    }
}
