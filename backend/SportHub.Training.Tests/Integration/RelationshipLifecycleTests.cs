using System.Net;
using System.Net.Http.Json;
using System.Reflection;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using SportHub.API.Jobs;
using SportHub.API.Persistence;
using SportHub.BuildingBlocks.Abstractions.Training;
using SportHub.Identity.Domain.Enums;
using SportHub.Scheduling.Domain.Entities;
using SportHub.Scheduling.Domain.Enums;
using SportHub.Training.Application.Commands;
using SportHub.Training.Application.DTOs;
using SportHub.Training.Domain.Entities;
using SportHub.Training.Domain.Enums;

namespace SportHub.Training.Tests.Integration;

[Collection(nameof(TrainingApiCollection))]
public sealed class RelationshipLifecycleTests(TrainingApiFactory factory)
{
    private sealed record Pair(Guid CoachId, Guid MemberId, Guid RelationshipId, int[] ClassIds);

    private async Task<Pair> SeedAsync(RelationshipSourceType source, int classCount = 2, bool assignment = true)
    {
        var coach = await factory.SeedCoachAsync(CoachKind.ClassInstructor);
        var member = await factory.SeedUserAsync(UserRole.Member);
        return await factory.QueryAsync(async db =>
        {
            var room = new Room { Name = $"Lifecycle {Guid.NewGuid():N}", RoomTypeId = 3, Capacity = 12 };
            db.Rooms.Add(room);
            await db.SaveChangesAsync();
            var ids = new List<int>();
            for (var i = 0; i < classCount; i++)
            {
                var course = new Class { Code = $"LIFE-{Guid.NewGuid():N}", Name = $"Lifecycle {i}", SportId = 3,
                    DefaultRoomId = room.RoomId, CoachId = coach.UserId, StartDate = DateOnly.FromDateTime(DateTime.UtcNow.AddDays(7)),
                    NumSessions = 1, Capacity = 12, ConfirmedCount = 1, ReservedCount = 1, Price = 100_000m,
                    Status = ClassStatus.Published };
                db.Classes.Add(course);
                await db.SaveChangesAsync();
                ids.Add(course.ClassId);
                db.Enrollments.Add(new Enrollment { EnrollmentId = Guid.NewGuid(), ClassId = course.ClassId,
                    MemberId = member.UserId, Status = EnrollmentStatus.Confirmed, EnrolledAt = DateTime.UtcNow });
            }
            var relationshipId = Guid.NewGuid();
            if (assignment)
                db.CoachMemberRelationships.Add(new CoachMemberRelationship { RelationshipId = relationshipId,
                    CoachId = coach.UserId, MemberId = member.UserId, SourceType = source,
                    ClassId = source == RelationshipSourceType.ClassBased ? ids.FirstOrDefault() : null,
                    Status = RelationshipStatus.Active, StartedAt = DateTime.UtcNow });
            await db.SaveChangesAsync();
            return new Pair(coach.UserId, member.UserId, relationshipId, ids.ToArray());
        });
    }

    private async Task ReconcileAsync(Pair pair)
    {
        using var scope = factory.Services.CreateScope();
        await scope.ServiceProvider.GetRequiredService<ICoachRelationshipRegistrar>().ReconcileAsync(
            pair.MemberId, null, null, "No remaining active courses.");
    }

    [Theory]
    [InlineData(RelationshipSourceType.ClassBased)]
    [InlineData(RelationshipSourceType.AssignedByManager)]
    public async Task Last_common_class_ends_assignment_once_but_another_class_keeps_it_active(RelationshipSourceType source)
    {
        var pair = await SeedAsync(source);
        await factory.QueryAsync(db => db.Classes.Where(c => c.ClassId == pair.ClassIds[0])
            .ExecuteUpdateAsync(s => s.SetProperty(c => c.Status, ClassStatus.Completed)));
        await ReconcileAsync(pair);
        Assert.Equal(RelationshipStatus.Active, await factory.QueryAsync(db => db.CoachMemberRelationships
            .Where(r => r.RelationshipId == pair.RelationshipId).Select(r => r.Status).SingleAsync()));

        using var manager = factory.CreateApiClient((await factory.SeedUserAsync(UserRole.CenterManager)).UserId, UserRole.CenterManager);
        var active = await manager.GetFromJsonAsync<CoachMemberRelationshipResponse[]>(
            $"api/coach-member-relationships?memberId={pair.MemberId}&activeOnly=false", ApiJson.Options);
        Assert.Equal(pair.ClassIds[1], Assert.Single(Assert.Single(active!).ActiveClasses!).ClassId);

        await factory.QueryAsync(db => db.Enrollments.Where(e => e.ClassId == pair.ClassIds[1])
            .ExecuteUpdateAsync(s => s.SetProperty(e => e.Status, EnrollmentStatus.Refunded)));
        await Task.WhenAll(ReconcileAsync(pair), ReconcileAsync(pair));
        var ended = await factory.QueryAsync(db => db.CoachMemberRelationships.AsNoTracking()
            .SingleAsync(r => r.RelationshipId == pair.RelationshipId));
        Assert.Equal(RelationshipStatus.Ended, ended.Status);
        Assert.NotNull(ended.EndedAt);
        Assert.Equal("No remaining active courses.", ended.EndReason);
        Assert.Equal(1, await factory.QueryAsync(db => db.AuditLogs.CountAsync(a =>
            a.TargetId == pair.RelationshipId.ToString() && a.Action == "AUTO_END_COACH_MEMBER_RELATIONSHIP")));
        using var coach = factory.CreateApiClient(pair.CoachId, UserRole.Coach);
        Assert.Equal(HttpStatusCode.Forbidden,
            (await coach.GetAsync($"api/coaches/me/students/{pair.MemberId}/health-profile")).StatusCode);
    }

    [Fact]
    public async Task Existing_manual_creation_API_requires_a_current_confirmed_class_and_preserves_duplicate_guard()
    {
        var managerId = (await factory.SeedUserAsync(UserRole.CenterManager)).UserId;
        using var manager = factory.CreateApiClient(managerId, UserRole.CenterManager);
        var pair = await SeedAsync(RelationshipSourceType.AssignedByManager, assignment: false);
        var enrollments = await manager.GetFromJsonAsync<System.Text.Json.JsonElement>($"api/members/{pair.MemberId}/enrollments");
        Assert.All(enrollments.GetProperty("items").EnumerateArray(), e => Assert.Equal(pair.CoachId, e.GetProperty("coachId").GetGuid()));
        var body = new CreateRelationshipRequest { CoachId = pair.CoachId, MemberId = pair.MemberId, SourceType = "ASSIGNED_BY_MANAGER", Note = "Reviewed shared classes" };
        Assert.Equal(HttpStatusCode.Created, (await manager.PostAsJsonAsync("api/coach-member-relationships", body)).StatusCode);
        var auditJson = await factory.QueryAsync(db => db.AuditLogs
            .Where(a => a.UserId == managerId && a.Action == "CREATE_COACH_MEMBER_RELATIONSHIP").Select(a => a.NewValue).SingleAsync());
        using var auditValue = System.Text.Json.JsonDocument.Parse(auditJson!);
        Assert.Equal("Reviewed shared classes", auditValue.RootElement.GetProperty("reason").GetString());
        Assert.Equal(HttpStatusCode.Conflict, (await manager.PostAsJsonAsync("api/coach-member-relationships", body)).StatusCode);
        var unsupported = await SeedAsync(RelationshipSourceType.AssignedByManager, classCount: 0, assignment: false);
        var response = await manager.PostAsJsonAsync("api/coach-member-relationships", new CreateRelationshipRequest {
            CoachId = unsupported.CoachId, MemberId = unsupported.MemberId, SourceType = "ASSIGNED_BY_MANAGER" });
        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        Assert.Contains("relationship_requires_active_class", await response.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task Manual_end_preserves_enrollment_schedule_and_current_class_access()
    {
        var pair = await SeedAsync(RelationshipSourceType.AssignedByManager, classCount: 1);
        var sessionId = Guid.NewGuid();
        var start = DateTime.UtcNow.AddDays(8);
        await factory.QueryAsync(async db => {
            var roomId = await db.Classes.Where(c => c.ClassId == pair.ClassIds[0]).Select(c => c.DefaultRoomId).SingleAsync();
            db.ClassSessions.Add(new ClassSession { SessionId = sessionId, ClassId = pair.ClassIds[0], SessionNo = 1,
                CoachId = pair.CoachId, RoomId = roomId, StartAtUtc = start, EndAtUtc = start.AddHours(2), Status = ClassSessionStatus.Scheduled });
            await db.SaveChangesAsync();
            return true;
        });
        var before = await factory.QueryAsync(db => db.ClassSessions.AsNoTracking().SingleAsync(s => s.SessionId == sessionId));
        using var manager = factory.CreateApiClient((await factory.SeedUserAsync(UserRole.CenterManager)).UserId, UserRole.CenterManager);
        using var coach = factory.CreateApiClient(pair.CoachId, UserRole.Coach);
        var url = $"api/coach-member-relationships/{pair.RelationshipId}/end";
        Assert.Equal(HttpStatusCode.Forbidden, (await coach.PostAsJsonAsync(url, new { reason = "End demo assignment" })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await manager.PostAsJsonAsync(url, new { reason = " " })).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await manager.PostAsJsonAsync(url, new { reason = "End demo assignment" })).StatusCode);
        var ended = await factory.QueryAsync(db => db.CoachMemberRelationships.AsNoTracking().SingleAsync(r => r.RelationshipId == pair.RelationshipId));
        Assert.Equal(RelationshipStatus.Ended, ended.Status);
        Assert.Equal("End demo assignment", ended.EndReason);
        Assert.NotNull(ended.EndedAt);
        Assert.Equal(1, await factory.QueryAsync(db => db.Enrollments.CountAsync(e => e.MemberId == pair.MemberId && e.Status == EnrollmentStatus.Confirmed)));
        var after = await factory.QueryAsync(db => db.ClassSessions.AsNoTracking().SingleAsync(s => s.SessionId == sessionId));
        Assert.Equal(before.StartAtUtc, after.StartAtUtc);
        Assert.Equal(before.EndAtUtc, after.EndAtUtc);
        Assert.Equal(before.CoachId, after.CoachId);
        Assert.Equal(before.RoomId, after.RoomId);
        Assert.Equal(before.Status, after.Status);
        Assert.Equal(HttpStatusCode.OK, (await coach.GetAsync($"api/coaches/me/students/{pair.MemberId}/health-profile")).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, (await manager.PostAsJsonAsync(url, new { reason = "End demo assignment" })).StatusCode);
        Assert.Equal(1, await factory.QueryAsync(db => db.AuditLogs.CountAsync(a => a.TargetId == pair.RelationshipId.ToString() && a.Action == "END_COACH_MEMBER_RELATIONSHIP")));
    }

    [Fact]
    public async Task Reenrollment_creates_a_new_assignment_and_keeps_ended_history()
    {
        var pair = await SeedAsync(RelationshipSourceType.AssignedByManager, classCount: 1);
        await factory.QueryAsync(db => db.Enrollments.Where(e => e.MemberId == pair.MemberId)
            .ExecuteUpdateAsync(s => s.SetProperty(e => e.Status, EnrollmentStatus.Refunded)));
        await ReconcileAsync(pair);
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SportHubDbContext>();
        await using var tx = await db.Database.BeginTransactionAsync();
        db.Enrollments.Add(new Enrollment { EnrollmentId = Guid.NewGuid(), ClassId = pair.ClassIds[0], MemberId = pair.MemberId,
            Status = EnrollmentStatus.Confirmed, EnrolledAt = DateTime.UtcNow });
        await db.SaveChangesAsync();
        await scope.ServiceProvider.GetRequiredService<ICoachRelationshipRegistrar>().EnsureClassBasedAsync(
            pair.CoachId, pair.MemberId, pair.ClassIds[0]);
        await db.SaveChangesAsync();
        await tx.CommitAsync();
        var rows = await db.CoachMemberRelationships.AsNoTracking().Where(r => r.MemberId == pair.MemberId).ToListAsync();
        Assert.Equal(2, rows.Count);
        Assert.Equal(pair.RelationshipId, Assert.Single(rows, r => r.Status == RelationshipStatus.Ended).RelationshipId);
        Assert.NotEqual(pair.RelationshipId, Assert.Single(rows, r => r.Status == RelationshipStatus.Active).RelationshipId);
    }

    [Fact]
    public async Task Enrollment_and_relationship_end_roll_back_together()
    {
        var pair = await SeedAsync(RelationshipSourceType.AssignedByManager, classCount: 1);
        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<SportHubDbContext>();
            await using var tx = await db.Database.BeginTransactionAsync();
            await db.Enrollments.Where(e => e.MemberId == pair.MemberId)
                .ExecuteUpdateAsync(s => s.SetProperty(e => e.Status, EnrollmentStatus.Refunded));
            await scope.ServiceProvider.GetRequiredService<ICoachRelationshipRegistrar>().ReconcileAsync(
                pair.MemberId, null, null, "No remaining active courses.");
            await tx.RollbackAsync();
        }
        Assert.Equal(RelationshipStatus.Active, await factory.QueryAsync(db => db.CoachMemberRelationships
            .Where(r => r.RelationshipId == pair.RelationshipId).Select(r => r.Status).SingleAsync()));
        Assert.Equal(0, await factory.QueryAsync(db => db.AuditLogs.CountAsync(a =>
            a.TargetId == pair.RelationshipId.ToString() && a.Action == "AUTO_END_COACH_MEMBER_RELATIONSHIP")));
    }

    [Fact]
    public async Task Class_status_job_completes_last_lesson_and_closes_manual_assignment()
    {
        var pair = await SeedAsync(RelationshipSourceType.AssignedByManager, classCount: 1);
        await factory.ExecuteAsync(async db =>
        {
            var course = await db.Classes.SingleAsync(c => c.ClassId == pair.ClassIds[0]);
            var start = DateTime.UtcNow.AddHours(-2);
            // Published courses need pricing/threshold facts before the lifecycle job
            // evaluates opening. Keep this fixture valid without bypassing that evaluation.
            course.CostAmount = course.Price;
            course.BreakEvenThreshold = 1;
            course.ThresholdDeadlineUtc = start.AddDays(-3);
            course.StartDate = DateOnly.FromDateTime(start.AddHours(7));
            db.ClassSessions.Add(new ClassSession { SessionId = Guid.NewGuid(), ClassId = course.ClassId,
                SessionNo = 1, CoachId = pair.CoachId, RoomId = course.DefaultRoomId, StartAtUtc = start,
                EndAtUtc = start.AddHours(1), Status = ClassSessionStatus.Scheduled });
            await db.SaveChangesAsync();
        });
        using var scope = factory.Services.CreateScope();
        var job = new ClassStatusJob(factory.Services, NullLogger<ClassStatusJob>.Instance);
        await (Task)typeof(ClassStatusJob).GetMethod("RunOnceAsync", BindingFlags.NonPublic | BindingFlags.Instance)!
            .Invoke(job, [scope.ServiceProvider, CancellationToken.None])!;
        Assert.Equal(ClassStatus.Completed, await factory.QueryAsync(db => db.Classes
            .Where(c => c.ClassId == pair.ClassIds[0]).Select(c => c.Status).SingleAsync()));
        Assert.Equal(SportHub.Scheduling.Threshold.Domain.ThresholdStatus.Met,
            await factory.QueryAsync(db => db.Classes.Where(c => c.ClassId == pair.ClassIds[0])
                .Select(c => c.ThresholdStatus).SingleAsync()));
        Assert.Equal(RelationshipStatus.Ended, await factory.QueryAsync(db => db.CoachMemberRelationships
            .Where(r => r.RelationshipId == pair.RelationshipId).Select(r => r.Status).SingleAsync()));
    }

    [Fact]
    public async Task Removed_locked_coach_reassignment_API_cannot_change_relationships()
    {
        var pair = await SeedAsync(RelationshipSourceType.AssignedByManager, classCount: 1);
        var replacement = await factory.SeedCoachAsync(CoachKind.ClassInstructor);
        var manager = await factory.SeedUserAsync(UserRole.CenterManager);
        await factory.QueryAsync(db => db.UserAccounts.Where(u => u.UserId == pair.CoachId)
            .ExecuteUpdateAsync(s => s.SetProperty(u => u.Status, UserStatus.Deactivated)));
        using var client = factory.CreateApiClient(manager.UserId, UserRole.CenterManager);
        var response = await client.PostAsJsonAsync(
            $"api/manager/coach-coverage/{pair.CoachId}/classes/{pair.ClassIds[0]}/reassign-main",
            new { replacementCoachId = replacement.UserId, reason = "Replacement for locked coach" });
        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        var rows = await factory.QueryAsync(db => db.CoachMemberRelationships.AsNoTracking()
            .Where(r => r.MemberId == pair.MemberId).ToListAsync());
        Assert.Equal(RelationshipStatus.Active, Assert.Single(rows, r => r.CoachId == pair.CoachId).Status);
        Assert.DoesNotContain(rows, r => r.CoachId == replacement.UserId);
    }
}
