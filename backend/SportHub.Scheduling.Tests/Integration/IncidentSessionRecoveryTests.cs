using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SportHub.BuildingBlocks.SharedKernel.Errors;
using SportHub.BuildingBlocks.SharedKernel.Time;
using SportHub.Identity.Domain.Enums;
using SportHub.Scheduling.Application.Commands;
using SportHub.Scheduling.Application.DTOs;
using SportHub.Scheduling.Application.Interfaces;
using SportHub.Scheduling.Application.Services;
using SportHub.Scheduling.Domain.Entities;
using SportHub.Scheduling.Domain.Enums;
using SportHub.Scheduling.Rental.Application;
using SportHub.Scheduling.Rental.Domain;

namespace SportHub.Scheduling.Tests.Integration;

[Collection(nameof(SchedulingApiCollection))]
public sealed class IncidentSessionRecoveryTests(SchedulingApiFactory factory)
{
    private sealed record Fixture(CourseData Course, ClassSession Session, Guid Member, IncidentRequest Incident, Guid FenceId);
    // Keep ongoing-session fixtures inside operating hours regardless of when the suite runs.
    private readonly IClock clock = new TestClock(VietnamTime.StartOfDayUtc(VietnamTime.TodayLocal(new SystemClock())).AddHours(12));
    private async Task<T> Run<T>(Func<IClassSessionService, Task<T>> run)
    {
        using var scope = factory.Services.CreateScope();
        return await run(ActivatorUtilities.CreateInstance<ClassSessionService>(scope.ServiceProvider, clock));
    }
    private async Task<T> Incidents<T>(Func<IncidentService, Task<T>> run)
    {
        using var scope = factory.Services.CreateScope();
        return await run(ActivatorUtilities.CreateInstance<IncidentService>(scope.ServiceProvider, clock));
    }

    private async Task<DateTime> ManualReplacementStart(Fixture f)
    {
        var sessions = await CourseTestData.SessionsAsync(factory, f.Course.Id);
        var afterLast = sessions.Max(s => s.StartAtUtc).AddDays(7);
        var nextWeek = VietnamTime.StartOfDayUtc(VietnamTime.TodayLocal(new SystemClock()).AddDays(7)).AddHours(9);
        return afterLast > nextWeek ? afterLast : nextWeek;
    }

    private async Task<Fixture> Setup(bool ongoing = false, bool completedClass = false)
    {
        var course = await CourseTestData.CreateAsync(factory);
        var member = await factory.SeedUserAsync(UserRole.Member);
        var enrollment = await CourseTestData.EnrollmentAsync(factory, course.Id, member.UserId);
        var sessions = await CourseTestData.SessionsAsync(factory, course.Id);
        var first = sessions[0];
        var past = VietnamTime.StartOfDayUtc(VietnamTime.TodayLocal(new SystemClock()).AddDays(-10)).AddHours(9);
        await factory.QueryAsync(async db => {
            foreach (var old in await db.ClassSessions.Where(s => s.ClassId == course.Id).ToListAsync())
            {
                var isFirst = old.SessionId == first.SessionId;
                if (!isFirst && !completedClass) continue;
                var start = ongoing && isFirst ? clock.UtcNow.AddMinutes(-30) : past.AddDays(old.SessionNo);
                var duration = old.EndAtUtc - old.StartAtUtc;
                old.StartAtUtc = start; old.EndAtUtc = start + duration;
                old.Status = ongoing && isFirst ? ClassSessionStatus.Scheduled : ClassSessionStatus.Completed;
                foreach (var occupancy in await db.RoomOccupancies.Where(o => o.SourceId == old.SessionId).ToListAsync()) { occupancy.StartAtUtc = old.StartAtUtc; occupancy.EndAtUtc = old.EndAtUtc; }
                foreach (var occupancy in await db.CoachOccupancies.Where(o => o.SourceId == old.SessionId).ToListAsync()) { occupancy.StartAtUtc = old.StartAtUtc; occupancy.EndAtUtc = old.EndAtUtc; }
            }
            var cls = await db.Classes.SingleAsync(c => c.ClassId == course.Id);
            cls.Status = completedClass ? ClassStatus.Completed : ClassStatus.InProgress;
            db.Attendances.Add(new Attendance { AttendanceId = Guid.NewGuid(), EnrollmentId = enrollment,
                SessionId = first.SessionId, Status = AttendanceStatus.Present, RecordedByUserId = course.CoachId, RecordedAt = DateTime.UtcNow });
            db.Set<ClassTeachingRecord>().Add(new ClassTeachingRecord { RecordId = Guid.NewGuid(), ClassId = course.Id,
                SessionId = first.SessionId, MemberId = member.UserId, CoachId = course.CoachId, Kind = "RESULT",
                Title = "Original assessment", Content = "Keep this history", CreatedAtUtc = DateTime.UtcNow, UpdatedAtUtc = DateTime.UtcNow, Version = 1 });
            await db.SaveChangesAsync(); return true;
        });
        first = (await CourseTestData.SessionsAsync(factory, course.Id))[0];
        var incident = new IncidentRequest("Room", course.RoomId, first.StartAtUtc,
            ongoing ? first.EndAtUtc : first.EndAtUtc.AddMinutes(10), "Power failure during session");
        var fence = await Incidents(s => s.OpenFenceAsync(incident, course.ManagerId));
        return new(course, first, member.UserId, incident, fence.FenceId);
    }

    [Theory]
    [InlineData(false, false)]
    [InlineData(true, false)]
    [InlineData(false, true)]
    public async Task Enrolled_incident_sessions_can_receive_one_full_makeup_and_keep_history(bool ongoing, bool completed)
    {
        var f = await Setup(ongoing, completed);
        var before = await CourseTestData.SessionsAsync(factory, f.Course.Id);
        var replacementStart = await ManualReplacementStart(f);
        var request = new ReportSessionIncidentRequest { FenceId = f.FenceId, Outcome = "INTERRUPTED",
            OccurredAtUtc = f.Session.StartAtUtc.AddMinutes(10), Reason = "Power failure interrupted class",
            Makeup = new() { StartAtUtc = replacementStart, RoomId = f.Session.RoomId, CoachId = f.Session.CoachId } };
        var replacement = await Run(s => s.ReportIncidentAsync(f.Session.SessionId, request, f.Course.ManagerId));
        var retry = await Run(s => s.ReportIncidentAsync(f.Session.SessionId, request, f.Course.ManagerId));
        Assert.Equal(replacement.SessionId, retry.SessionId);
        Assert.Equal(f.Session.EndAtUtc - f.Session.StartAtUtc, replacement.EndAtUtc - replacement.StartAtUtc);
        var after = await CourseTestData.SessionsAsync(factory, f.Course.Id);
        Assert.Equal(before.Count + 1, after.Count);
        Assert.Equal(f.Session.StartAtUtc, after.Single(s => s.SessionId == f.Session.SessionId).StartAtUtc);
        Assert.Single(after, s => s.RescheduledFromSessionId == f.Session.SessionId);
        Assert.True(await factory.QueryAsync(db => db.Attendances.AnyAsync(a => a.SessionId == f.Session.SessionId)));
        Assert.True(await factory.QueryAsync(db => db.Set<ClassTeachingRecord>().AnyAsync(r => r.SessionId == f.Session.SessionId && r.Title == "Original assessment")));
        Assert.Equal(ClassStatus.InProgress,
            await factory.QueryAsync(db => db.Classes.Where(c => c.ClassId == f.Course.Id).Select(c => c.Status).SingleAsync()));
    }

    [Fact]
    public async Task Fully_delivered_session_is_reviewed_without_replacement_or_attendance_changes()
    {
        var f = await Setup();
        var result = await Run(s => s.ReportIncidentAsync(f.Session.SessionId, new() { FenceId = f.FenceId,
            Outcome = "COMPLETED_AS_PLANNED", OccurredAtUtc = f.Session.StartAtUtc.AddMinutes(5), Reason = "Class completed despite incident" }, f.Course.ManagerId));
        Assert.Equal(f.Session.SessionId, result.SessionId);
        Assert.Null(result.IncidentReport!.ReplacementSessionId);
        Assert.Equal("Completed", result.Status);
        Assert.Equal(3, (await CourseTestData.SessionsAsync(factory, f.Course.Id)).Count);
        Assert.True((await Incidents(s => s.PreviewAsync(f.Incident))).CanResolve);
        Assert.True(await factory.QueryAsync(db => db.Attendances.AnyAsync(a => a.SessionId == f.Session.SessionId)));
        var step = Assert.Single(await Incidents(s => s.ListFenceStepsAsync(f.FenceId)));
        Assert.Equal("ReviewedCompleted", step.Kind);
        Assert.False(step.CanUndo);
        var abandoned = await Incidents(s => s.AbandonFenceAsync(f.FenceId, f.Course.ManagerId));
        Assert.Equal(0, abandoned.Undone);
        Assert.Empty(abandoned.NotUndone);
        Assert.Equal(ClassSessionStatus.Completed, await factory.QueryAsync(db => db.ClassSessions
            .Where(s => s.SessionId == f.Session.SessionId).Select(s => s.Status).SingleAsync()));
        Assert.Equal(IncidentFenceStepState.Applied, await factory.QueryAsync(db => db.Set<IncidentFenceStep>()
            .Where(s => s.StepId == step.StepId).Select(s => s.State).SingleAsync()));
    }

    [Fact]
    public async Task Migration_distinguishes_legacy_completed_reviews_from_removed_room_blocks()
    {
        var f = await Setup();
        var reviewId = Guid.NewGuid();
        var blockStepId = Guid.NewGuid();
        await factory.QueryAsync(async db =>
        {
            foreach (var isBlock in new[] { false, true })
                db.Set<IncidentFenceStep>().Add(new() {
                    StepId = isBlock ? blockStepId : reviewId, FenceId = f.FenceId,
                    Kind = (IncidentFenceStepKind)2, SessionId = isBlock ? null : f.Session.SessionId,
                    RoomBlockId = isBlock ? Guid.NewGuid() : null,
                    BeforeStartUtc = f.Session.StartAtUtc, BeforeEndUtc = f.Session.EndAtUtc,
                    BeforeRoomId = f.Session.RoomId, BeforeCoachId = f.Session.CoachId,
                    AfterStartUtc = f.Session.StartAtUtc, AfterRoomId = f.Session.RoomId, AfterCoachId = f.Session.CoachId,
                    ActorUserId = f.Course.ManagerId, CreatedAtUtc = clock.UtcNow,
                    State = isBlock ? IncidentFenceStepState.Applied : IncidentFenceStepState.UndoFailed,
                    UndoNote = isBlock ? null : "The block time has already passed." });
            await db.SaveChangesAsync();
            foreach (var operation in new SportHub.API.Migrations.DistinguishCompletedIncidentSteps().UpOperations
                .OfType<Microsoft.EntityFrameworkCore.Migrations.Operations.SqlOperation>())
                await db.Database.ExecuteSqlRawAsync(operation.Sql);
            var review = await db.Set<IncidentFenceStep>().AsNoTracking().SingleAsync(s => s.StepId == reviewId);
            var block = await db.Set<IncidentFenceStep>().AsNoTracking().SingleAsync(s => s.StepId == blockStepId);
            Assert.Equal(IncidentFenceStepKind.ReviewedCompleted, review.Kind);
            Assert.Equal(IncidentFenceStepKind.RemoveRoomBlock, block.Kind);
            Assert.Equal(IncidentFenceStepState.UndoFailed, review.State);
            Assert.Equal("The block time has already passed.", review.UndoNote);
            Assert.NotNull(block.RoomBlockId);
            Assert.Null(block.SessionId);
            return 0;
        });
        var history = await Incidents(s => s.ListFenceStepsAsync(f.FenceId));
        Assert.Equal("ReviewedCompleted", history.Single(s => s.StepId == reviewId).Kind);
        Assert.Equal("RemoveRoomBlock", history.Single(s => s.StepId == blockStepId).Kind);
    }

    [Fact]
    public async Task Manual_confirmation_rechecks_member_conflicts_and_leaves_source_intact_on_failure()
    {
        var f = await Setup();
        var replacementStart = await ManualReplacementStart(f);
        var replacementEnd = replacementStart + (f.Session.EndAtUtc - f.Session.StartAtUtc);
        var rentalId = Guid.NewGuid();
        var otherRoom = await CourseTestData.RoomAsync(factory);
        await factory.QueryAsync(async db => { db.Set<CourtRental>().Add(new CourtRental { CourtRentalId = rentalId,
            MemberId = f.Member, SportId = 3, RoomId = otherRoom, StartAtUtc = replacementStart, EndAtUtc = replacementEnd,
            TotalPrice = 100000, Status = CourtRentalStatus.Confirmed, CreatedAtUtc = DateTime.UtcNow }); await db.SaveChangesAsync(); return true; });
        await Assert.ThrowsAsync<ConflictException>(() => Run(s => s.ReportIncidentAsync(f.Session.SessionId,
            new() { FenceId = f.FenceId, Outcome = "NOT_HELD", OccurredAtUtc = f.Session.StartAtUtc,
                Reason = "No session due to power failure", Makeup = new() { StartAtUtc = replacementStart, RoomId = f.Session.RoomId, CoachId = f.Session.CoachId } }, f.Course.ManagerId)));
        Assert.Null((await CourseTestData.SessionsAsync(factory, f.Course.Id))[0].IncidentReportJson);
        Assert.Equal(3, (await CourseTestData.SessionsAsync(factory, f.Course.Id)).Count);
    }

    [Fact]
    public async Task Future_incident_makeup_requires_a_matching_fence_and_retries_return_one_replacement()
    {
        var course = await CourseTestData.CreateAsync(factory);
        var member = await factory.SeedUserAsync(UserRole.Member);
        await CourseTestData.EnrollmentAsync(factory, course.Id, member.UserId);
        var sessions = await CourseTestData.SessionsAsync(factory, course.Id);
        var source = sessions[0];
        var incident = new IncidentRequest("Room", course.RoomId, source.StartAtUtc, source.EndAtUtc, "Court needs repair");
        var fence = await Incidents(s => s.OpenFenceAsync(incident, course.ManagerId));
        var request = new IncidentMakeupRequest { FenceId = Guid.NewGuid(), Reason = incident.Reason,
            Makeup = new() {StartAtUtc = sessions.Max(s => s.StartAtUtc).AddDays(7), RoomId = source.RoomId, CoachId = source.CoachId} };
        var blocked = await Assert.ThrowsAsync<ConflictException>(() => Run(s => s.CreateIncidentMakeupAsync(source.SessionId, request, course.ManagerId)));
        Assert.Equal("incident_window_required", blocked.ErrorCode);
        var ordinary = await Assert.ThrowsAsync<ConflictException>(() => Run(s => s.CancelWithMakeupAsync(source.SessionId, request, course.ManagerId)));
        Assert.Equal("class_has_enrollments", ordinary.ErrorCode);
        request.FenceId = fence.FenceId;
        var first = await Run(s => s.CreateIncidentMakeupAsync(source.SessionId, request, course.ManagerId));
        var retry = await Run(s => s.CreateIncidentMakeupAsync(source.SessionId, request, course.ManagerId));
        Assert.Equal(first.SessionId, retry.SessionId);
        Assert.Equal(source.EndAtUtc - source.StartAtUtc, first.EndAtUtc - first.StartAtUtc);
        Assert.Equal(sessions.Count + 1, (await CourseTestData.SessionsAsync(factory, course.Id)).Count);
        Assert.True(await factory.QueryAsync(db => db.Enrollments.AnyAsync(e => e.MemberId == member.UserId && e.ClassId == course.Id && e.Status == EnrollmentStatus.Confirmed)));
    }

    [Fact]
    public async Task Reports_require_matching_open_window()
    {
        var f = await Setup();
        await Assert.ThrowsAsync<ConflictException>(() => Run(s => s.ReportIncidentAsync(f.Session.SessionId,
            new() { FenceId = Guid.NewGuid(), Outcome = "COMPLETED_AS_PLANNED", OccurredAtUtc = f.Session.StartAtUtc.AddMinutes(5), Reason = "Unrelated incident" }, f.Course.ManagerId)));
    }
}
