using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SportHub.API.Persistence;
using SportHub.BuildingBlocks.SharedKernel.Time;
using SportHub.Identity.Domain.Entities;
using SportHub.Identity.Domain.Enums;
using SportHub.Scheduling.Application.Commands;
using SportHub.Scheduling.Application.Interfaces;
using SportHub.Scheduling.Catalog.Domain;
using SportHub.Scheduling.Domain.Entities;
using SportHub.Scheduling.Domain.Enums;

namespace SportHub.Scheduling.Tests.Integration;

internal sealed record CourseData(int Id, Guid ManagerId, Guid CoachId, int RoomId, SaveClassRequest Request);
internal sealed class TestClock(DateTime now) : IClock { public DateTime UtcNow => now; }

internal static class CourseTestData
{
    public static readonly DateOnly StartDate = new(2032, 3, 1);

    public static async Task<CourseData> CreateAsync(SchedulingApiFactory factory, bool publish = true, int capacity = 4, string time = "09:00")
    {
        var manager = await factory.SeedUserAsync(UserRole.CenterManager);
        var coach = await factory.SeedUserAsync(UserRole.Coach);
        var roomId = await RoomAsync(factory);
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SportHubDbContext>();
        db.UserSportSpecialties.Add(new UserSportSpecialty { UserId = coach.UserId, SportId = 3 });
        db.CoachProfiles.Add(new CoachProfile { UserId = coach.UserId });
        await db.SaveChangesAsync();
        var request = new SaveClassRequest
        {
            Code = "P105-" + Guid.NewGuid().ToString("N"), Name = "Course regression", SportId = 3,
            CoachId = coach.UserId, DefaultRoomId = roomId, StartDate = StartDate, NumSessions = 3,
            Capacity = capacity, Price = 100_000, CostAmount = 0,
            ScheduleRules = [new() { DayOfWeek = (int)StartDate.DayOfWeek, StartTimeLocal = time }]
        };
        var result = await scope.ServiceProvider.GetRequiredService<IClassService>().CreateAsync(request, manager.UserId);
        if (publish)
            await RunAsync<IClassService, object>(factory, async s => await s.PublishAsync(result.ClassId, new(), manager.UserId));
        return new(result.ClassId, manager.UserId, coach.UserId, roomId, request);
    }

    public static async Task<int> RoomAsync(SchedulingApiFactory factory, int capacity = 12)
    {
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SportHubDbContext>();
        var room = new Room { Name = "P105-" + Guid.NewGuid().ToString("N"), Capacity = capacity, RoomTypeId = 3 };
        db.Rooms.Add(room);
        await db.SaveChangesAsync();
        db.RoomOpeningHours.AddRange(Enumerable.Range(0, 7).Select(day => new RoomOpeningHour
        { RoomId = room.RoomId, DayOfWeek = day, OpenTimeLocal = new(6, 0), CloseTimeLocal = new(22, 0) }));
        await db.SaveChangesAsync();
        return room.RoomId;
    }

    public static Task<List<ClassSession>> SessionsAsync(SchedulingApiFactory factory, int classId)
        => factory.QueryAsync(db => db.ClassSessions.AsNoTracking().Where(s => s.ClassId == classId).OrderBy(s => s.SessionNo).ToListAsync());

    public static async Task<Guid> EnrollmentAsync(SchedulingApiFactory factory, int classId, Guid memberId)
    {
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SportHubDbContext>();
        var enrollment = new Enrollment { EnrollmentId = Guid.NewGuid(), ClassId = classId, MemberId = memberId,
            Status = EnrollmentStatus.Confirmed, EnrolledAt = DateTime.UtcNow };
        db.Enrollments.Add(enrollment);
        await db.Classes.Where(c => c.ClassId == classId).ExecuteUpdateAsync(s => s
            .SetProperty(c => c.ConfirmedCount, c => c.ConfirmedCount + 1).SetProperty(c => c.ReservedCount, c => c.ReservedCount + 1));
        await db.SaveChangesAsync();
        return enrollment.EnrollmentId;
    }

    public static async Task<T> RunAsync<TService, T>(SchedulingApiFactory factory, Func<TService, Task<T>> action) where TService : notnull
    {
        using var scope = factory.Services.CreateScope();
        return await action(scope.ServiceProvider.GetRequiredService<TService>());
    }
}
