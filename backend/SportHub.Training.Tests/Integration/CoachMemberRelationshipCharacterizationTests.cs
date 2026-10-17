using System.Net;
using System.Net.Http.Json;
using Microsoft.EntityFrameworkCore;
using SportHub.Identity.Domain.Enums;
using SportHub.Scheduling.Domain.Entities;
using SportHub.Scheduling.Domain.Enums;
using SportHub.Training.Domain.Entities;
using SportHub.Training.Domain.Enums;
using SportHub.Training.Application.Commands;
using SportHub.Training.Application.DTOs;

namespace SportHub.Training.Tests.Integration;

/// <summary>
/// Class-based access follows the current assignment, enrollment and remaining lessons,
/// even when an older CoachMemberRelationship row is still active.
/// </summary>
[Collection(nameof(TrainingApiCollection))]
public sealed class CoachMemberRelationshipCharacterizationTests(TrainingApiFactory factory)
{
    [Fact]
    public async Task Class_relationship_stops_granting_health_access_when_enrollment_or_assignment_ends()
    {
        var coach = await factory.SeedCoachAsync(CoachKind.ClassInstructor);
        var replacement = await factory.SeedCoachAsync(CoachKind.ClassInstructor);
        var member = await factory.SeedUserAsync(UserRole.Member);
        var ids = await factory.QueryAsync(async db =>
        {
            var room = new Room { Name = $"Training room {Guid.NewGuid():N}", RoomTypeId = 3, Capacity = 12 };
            db.Rooms.Add(room);
            await db.SaveChangesAsync();
            var cls = new Class
            {
                Code = $"ACCESS-{Guid.NewGuid():N}", Name = "Access test", SportId = 3,
                DefaultRoomId = room.RoomId, CoachId = coach.UserId,
                StartDate = DateOnly.FromDateTime(DateTime.UtcNow).AddDays(7),
                NumSessions = 4, Capacity = 12, ConfirmedCount = 1, ReservedCount = 1,
                Price = 100_000m, Status = ClassStatus.Published
            };
            db.Classes.Add(cls);
            await db.SaveChangesAsync();
            // Member access requires a real remaining lesson as well as Published status.
            var firstLesson = DateTime.UtcNow.Date.AddDays(7).AddHours(3);
            for (var number = 1; number <= cls.NumSessions; number++)
            {
                var start = firstLesson.AddDays((number - 1) * 2);
                db.ClassSessions.Add(new ClassSession
                {
                    SessionId = Guid.NewGuid(), ClassId = cls.ClassId, SessionNo = number,
                    CoachId = coach.UserId, RoomId = room.RoomId,
                    StartAtUtc = start, EndAtUtc = start.AddMinutes(90),
                    Status = ClassSessionStatus.Scheduled
                });
            }
            var enrollment = new Enrollment
            {
                EnrollmentId = Guid.NewGuid(), ClassId = cls.ClassId, MemberId = member.UserId,
                Status = EnrollmentStatus.Confirmed, EnrolledAt = DateTime.UtcNow
            };
            db.Enrollments.Add(enrollment);
            db.CoachMemberRelationships.Add(new CoachMemberRelationship
            {
                RelationshipId = Guid.NewGuid(), CoachId = coach.UserId, MemberId = member.UserId,
                ClassId = cls.ClassId, SourceType = RelationshipSourceType.ClassBased,
                Status = RelationshipStatus.Active, StartedAt = DateTime.UtcNow
            });
            await db.SaveChangesAsync();
            return (cls.ClassId, enrollment.EnrollmentId);
        });
        using var client = factory.CreateApiClient(coach.UserId, UserRole.Coach);
        using var memberClient = factory.CreateApiClient(member.UserId, UserRole.Member);
        var path = $"api/coaches/me/students/{member.UserId}/health-profile";
        var contentPath = $"api/members/me/classes/{ids.ClassId}/teaching-records";
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync(path)).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await memberClient.GetAsync(contentPath)).StatusCode);

        await factory.QueryAsync(db => db.Enrollments.Where(e => e.EnrollmentId == ids.EnrollmentId)
            .ExecuteUpdateAsync(s => s.SetProperty(e => e.Status, EnrollmentStatus.Refunded)));
        Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync(path)).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await memberClient.GetAsync(contentPath)).StatusCode);

        await factory.QueryAsync(db => db.Enrollments.Where(e => e.EnrollmentId == ids.EnrollmentId)
            .ExecuteUpdateAsync(s => s.SetProperty(e => e.Status, EnrollmentStatus.Confirmed)));
        await factory.QueryAsync(db => db.Classes.Where(c => c.ClassId == ids.ClassId)
            .ExecuteUpdateAsync(s => s.SetProperty(c => c.CoachId, replacement.UserId)));
        Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync(path)).StatusCode);
        Assert.Equal(HttpStatusCode.OK,
            (await factory.CreateApiClient(replacement.UserId, UserRole.Coach)
                .GetAsync($"api/coaches/me/students")).StatusCode);

        await factory.QueryAsync(db => db.Classes.Where(c => c.ClassId == ids.ClassId)
            .ExecuteUpdateAsync(s => s.SetProperty(c => c.CoachId, coach.UserId)
                .SetProperty(c => c.Status, ClassStatus.Completed)));
        // Coach health access ends with the class, but the member keeps reading their own class history.
        Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync(path)).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await memberClient.GetAsync(contentPath)).StatusCode);

        await factory.QueryAsync(db => db.Classes.Where(c => c.ClassId == ids.ClassId)
            .ExecuteUpdateAsync(s => s.SetProperty(c => c.Status, ClassStatus.Cancelled)));
        Assert.Equal(HttpStatusCode.Forbidden, (await memberClient.GetAsync(contentPath)).StatusCode);
    }

    [Fact]
    public async Task Creating_relationship_with_class_based_source_type_is_rejected()
    {
        var manager = await factory.SeedUserAsync(UserRole.CenterManager);
        var coach = await factory.SeedCoachAsync(CoachKind.PersonalTrainer);
        var member = await factory.SeedUserAsync(UserRole.Member);
        var client = factory.CreateApiClient(manager.UserId, UserRole.CenterManager);

        var response = await client.PostAsJsonAsync(
            "api/coach-member-relationships",
            new CreateRelationshipRequest { CoachId = coach.UserId, MemberId = member.UserId, SourceType = "ClassBased" });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Non_manager_cannot_create_or_end_relationships()
    {
        var coach = await factory.SeedCoachAsync(CoachKind.PersonalTrainer);
        var member = await factory.SeedUserAsync(UserRole.Member);
        var coachClient = factory.CreateApiClient(coach.UserId, UserRole.Coach);

        var response = await coachClient.PostAsJsonAsync(
            "api/coach-member-relationships",
            new CreateRelationshipRequest { CoachId = coach.UserId, MemberId = member.UserId, SourceType = "Personal" });

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }
}
