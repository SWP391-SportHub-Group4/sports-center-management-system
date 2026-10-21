using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SportHub.API.Persistence;
using SportHub.Identity.Domain.Enums;
using SportHub.Scheduling.Application.Interfaces;
using SportHub.Scheduling.Domain.Enums;
using SportHub.Scheduling.Occupancy.Domain;
using SportHub.Scheduling.Rental.Application;
using SportHub.Scheduling.Rental.Domain;

namespace SportHub.Scheduling.Tests.Integration;

/// <summary>
/// A manager who holds an incident window and then moves or cancels sessions can abandon the whole incident: the window is
/// released and each session goes back where it was, unless it was changed again or its old slot is gone (then it is reported).
/// </summary>
[Collection(nameof(SchedulingApiCollection))]
public sealed class IncidentUndoTests(SchedulingApiFactory factory)
{
    private static IncidentRequest WindowOf(CourseData course, SportHub.Scheduling.Domain.Entities.ClassSession session)
        => new("Room", course.RoomId, session.StartAtUtc, session.EndAtUtc, "Repair court flooring");

    private static Task<T> WithIncidents<T>(SchedulingApiFactory factory, Func<IncidentService, Task<T>> action)
        => CourseTestData.RunAsync<IncidentService, T>(factory, action);

    private static Task<object> Reschedule(SchedulingApiFactory factory, CourseData course, Guid sessionId, TimeSpan by,
        DateTime from)
        => CourseTestData.RunAsync<IClassSessionService, object>(factory, async svc =>
            await svc.RescheduleAsync(sessionId, new() { StartAtUtc = from + by, Reason = "Incident reschedule" }, course.ManagerId));

    private async Task<(CourseData Course, SportHub.Scheduling.Domain.Entities.ClassSession Session, Guid MemberId)> SetupAsync()
    {
        var course = await CourseTestData.CreateAsync(factory);
        var member = await factory.SeedUserAsync(UserRole.Member);
        await CourseTestData.EnrollmentAsync(factory, course.Id, member.UserId);
        var session = (await CourseTestData.SessionsAsync(factory, course.Id))[0];
        return (course, session, member.UserId);
    }

    [Fact]
    public async Task Abandoning_puts_a_rescheduled_session_back_releases_the_window_and_tells_members()
    {
        var (course, session, memberId) = await SetupAsync();
        var fence = await WithIncidents(factory, s => s.OpenFenceAsync(WindowOf(course, session), course.ManagerId));
        await Reschedule(factory, course, session.SessionId, TimeSpan.FromHours(3), session.StartAtUtc);

        var steps = await WithIncidents(factory, s => s.ListFenceStepsAsync(fence.FenceId));
        var step = Assert.Single(steps);
        Assert.Equal("Reschedule", step.Kind);
        Assert.True(step.CanUndo);

        var result = await WithIncidents(factory, s => s.AbandonFenceAsync(fence.FenceId, course.ManagerId));

        Assert.Equal(1, result.Undone);
        Assert.Empty(result.NotUndone);
        var restored = (await CourseTestData.SessionsAsync(factory, course.Id))[0];
        Assert.Equal(session.StartAtUtc, restored.StartAtUtc);
        Assert.Equal(session.RoomId, restored.RoomId);
        Assert.Equal(ClassSessionStatus.Scheduled, restored.Status);
        Assert.True(await factory.QueryAsync(db => db.RoomOccupancies.AnyAsync(o => o.SourceId == session.SessionId
            && o.IsActive && o.StartAtUtc == session.StartAtUtc)));
        Assert.Equal(IncidentFenceStatus.Released, await factory.QueryAsync(db => db.Set<IncidentFence>()
            .Where(f => f.FenceId == fence.FenceId).Select(f => f.Status).SingleAsync()));
        Assert.True(await factory.QueryAsync(db => db.Notifications.AnyAsync(n => n.UserId == memberId
            && n.Message.Contains("is back at"))));
    }

    [Fact]
    public async Task Enrolled_class_cannot_be_cancelled_through_incident_makeup()
    {
        var (course, session, _) = await SetupAsync();
        var all = await CourseTestData.SessionsAsync(factory, course.Id);
        var fence = await WithIncidents(factory, s => s.OpenFenceAsync(WindowOf(course, session), course.ManagerId));
        var error = await Assert.ThrowsAsync<SportHub.BuildingBlocks.SharedKernel.Errors.ConflictException>(() =>
            CourseTestData.RunAsync<IClassSessionService, SportHub.Scheduling.Application.DTOs.ClassSessionResponse>(factory,
                svc => svc.CancelWithMakeupAsync(session.SessionId, new() { Reason = "Incident cancel",
                    Makeup = new() { StartAtUtc = all.Max(s => s.StartAtUtc).AddDays(7) } }, course.ManagerId)));
        Assert.Equal("class_has_enrollments", error.ErrorCode);
        var after = await CourseTestData.SessionsAsync(factory, course.Id);
        Assert.Equal(all.Count, after.Count);
        Assert.Equal(ClassSessionStatus.Scheduled, after.Single(s => s.SessionId == session.SessionId).Status);
        Assert.True(await factory.QueryAsync(db => db.RoomOccupancies.AnyAsync(o => o.SourceId == session.SessionId && o.IsActive)));
        var result = await WithIncidents(factory, s => s.AbandonFenceAsync(fence.FenceId, course.ManagerId));
        Assert.Equal(0, result.Undone);
    }

    [Fact]
    public async Task A_step_is_reported_not_forced_when_the_original_slot_is_no_longer_free()
    {
        var (course, session, _) = await SetupAsync();
        var fence = await WithIncidents(factory, s => s.OpenFenceAsync(WindowOf(course, session), course.ManagerId));
        await Reschedule(factory, course, session.SessionId, TimeSpan.FromHours(3), session.StartAtUtc);

        // Something else took the original slot while the manager was away (a block placed straight into the schedule).
        await factory.QueryAsync(async db =>
        {
            db.RoomOccupancies.Add(new RoomOccupancy
            {
                OccupancyId = Guid.NewGuid(), SourceType = OccupancySourceType.RoomBlock, SourceId = Guid.NewGuid(),
                RoomId = course.RoomId, StartAtUtc = session.StartAtUtc, EndAtUtc = session.EndAtUtc, IsActive = true
            });
            await db.SaveChangesAsync();
            return 0;
        });

        var result = await WithIncidents(factory, s => s.AbandonFenceAsync(fence.FenceId, course.ManagerId));

        Assert.Equal(0, result.Undone);
        var left = Assert.Single(result.NotUndone);
        Assert.Contains("no longer free", left.UndoNote);
        Assert.Equal(session.StartAtUtc.AddHours(3), (await CourseTestData.SessionsAsync(factory, course.Id))[0].StartAtUtc);
        // The window is still released even though one step could not be reverted.
        Assert.Equal(IncidentFenceStatus.Released, await factory.QueryAsync(db => db.Set<IncidentFence>()
            .Where(f => f.FenceId == fence.FenceId).Select(f => f.Status).SingleAsync()));
    }

    [Fact]
    public async Task A_session_changed_again_after_the_step_is_left_alone()
    {
        var (course, session, _) = await SetupAsync();
        var fence = await WithIncidents(factory, s => s.OpenFenceAsync(WindowOf(course, session), course.ManagerId));
        await Reschedule(factory, course, session.SessionId, TimeSpan.FromHours(3), session.StartAtUtc);
        // A second move starts outside the held window, so it is not part of the incident.
        await Reschedule(factory, course, session.SessionId, TimeSpan.FromHours(1), session.StartAtUtc.AddHours(3));

        var result = await WithIncidents(factory, s => s.AbandonFenceAsync(fence.FenceId, course.ManagerId));

        Assert.Equal(0, result.Undone);
        Assert.Contains("changed again", Assert.Single(result.NotUndone).UndoNote);
        Assert.Equal(session.StartAtUtc.AddHours(4), (await CourseTestData.SessionsAsync(factory, course.Id))[0].StartAtUtc);
    }

    [Fact]
    public async Task Changes_made_without_a_held_window_are_not_journaled_and_nothing_is_undone()
    {
        var (course, session, _) = await SetupAsync();
        await Reschedule(factory, course, session.SessionId, TimeSpan.FromHours(3), session.StartAtUtc);

        Assert.Equal(0, await factory.QueryAsync(db => db.Set<IncidentFenceStep>().CountAsync(s => s.SessionId == session.SessionId)));

        var fence = await WithIncidents(factory, s => s.OpenFenceAsync(
            new("Room", course.RoomId, session.StartAtUtc.AddHours(3), session.EndAtUtc.AddHours(3), "Unrelated hold"), course.ManagerId));
        var result = await WithIncidents(factory, s => s.AbandonFenceAsync(fence.FenceId, course.ManagerId));

        Assert.Equal(0, result.Undone);
        Assert.Empty(result.NotUndone);
        Assert.Equal(session.StartAtUtc.AddHours(3), (await CourseTestData.SessionsAsync(factory, course.Id))[0].StartAtUtc);
    }

    private static Task<SportHub.Scheduling.Catalog.Application.RoomBlockResponse> CreateBlock(
        SchedulingApiFactory factory, CourseData course, DateTime start, DateTime end)
        => CourseTestData.RunAsync<SportHub.Scheduling.Catalog.Application.RoomBlockService,
            SportHub.Scheduling.Catalog.Application.RoomBlockResponse>(factory, svc => svc.CreateAsync(new()
            {
                RoomId = course.RoomId, StartAtUtc = start, EndAtUtc = end, Reason = "Court maintenance"
            }, course.ManagerId));

    private static Task<int> DeleteBlock(SchedulingApiFactory factory, CourseData course, Guid blockId)
        => CourseTestData.RunAsync<SportHub.Scheduling.Catalog.Application.RoomBlockService, int>(factory, async svc =>
        {
            await svc.DeleteAsync(blockId, course.ManagerId);
            return 0;
        });

    [Fact]
    public async Task Abandoning_recreates_a_room_block_removed_while_the_window_was_held()
    {
        var (course, session, _) = await SetupAsync();
        var start = session.StartAtUtc.AddHours(3);
        var end = session.EndAtUtc.AddHours(3);
        var block = await CreateBlock(factory, course, start, end);
        var fence = await WithIncidents(factory, s => s.OpenFenceAsync(
            new("Room", course.RoomId, start, end, "Handle incident"), course.ManagerId));
        await DeleteBlock(factory, course, block.BlockId);
        Assert.False(await factory.QueryAsync(db => db.Set<SportHub.Scheduling.Catalog.Domain.RoomBlock>()
            .AnyAsync(b => b.BlockId == block.BlockId)));

        var step = Assert.Single(await WithIncidents(factory, s => s.ListFenceStepsAsync(fence.FenceId)));
        Assert.Equal("RemoveRoomBlock", step.Kind);
        Assert.True(step.CanUndo);

        var result = await WithIncidents(factory, s => s.AbandonFenceAsync(fence.FenceId, course.ManagerId));

        Assert.Equal(1, result.Undone);
        Assert.Empty(result.NotUndone);
        var restored = await factory.QueryAsync(db => db.Set<SportHub.Scheduling.Catalog.Domain.RoomBlock>()
            .SingleAsync(b => b.BlockId == block.BlockId));
        Assert.Equal(course.RoomId, restored.RoomId);
        Assert.Equal(start, restored.StartAtUtc);
        Assert.Equal(end, restored.EndAtUtc);
        Assert.Equal("Court maintenance", restored.Reason);
        Assert.Null(restored.IncidentId);
        Assert.True(await factory.QueryAsync(db => db.RoomOccupancies.AnyAsync(o => o.SourceId == block.BlockId
            && o.IsActive && o.StartAtUtc == start)));
    }

    [Fact]
    public async Task A_removed_room_block_is_reported_not_forced_when_its_slot_was_taken()
    {
        var (course, session, _) = await SetupAsync();
        var start = session.StartAtUtc.AddHours(3);
        var end = session.EndAtUtc.AddHours(3);
        var block = await CreateBlock(factory, course, start, end);
        var fence = await WithIncidents(factory, s => s.OpenFenceAsync(
            new("Room", course.RoomId, start, end, "Handle incident"), course.ManagerId));
        await DeleteBlock(factory, course, block.BlockId);
        // Another block is placed in the freed slot before the manager gives up.
        await CreateBlock(factory, course, start, end);

        var result = await WithIncidents(factory, s => s.AbandonFenceAsync(fence.FenceId, course.ManagerId));

        Assert.Equal(0, result.Undone);
        Assert.Contains("no longer free", Assert.Single(result.NotUndone).UndoNote);
        Assert.False(await factory.QueryAsync(db => db.Set<SportHub.Scheduling.Catalog.Domain.RoomBlock>()
            .AnyAsync(b => b.BlockId == block.BlockId)));
    }

    [Fact]
    public async Task Removing_a_room_block_without_a_held_window_is_not_journaled()
    {
        var (course, session, _) = await SetupAsync();
        var block = await CreateBlock(factory, course, session.StartAtUtc.AddHours(3), session.EndAtUtc.AddHours(3));
        await DeleteBlock(factory, course, block.BlockId);

        Assert.False(await factory.QueryAsync(db => db.Set<IncidentFenceStep>()
            .AnyAsync(s => s.RoomBlockId == block.BlockId)));
    }

    [Fact]
    public async Task Abandoning_a_resolved_or_already_released_incident_is_refused()
    {
        var (course, session, _) = await SetupAsync();
        var fence = await WithIncidents(factory, s => s.OpenFenceAsync(WindowOf(course, session), course.ManagerId));
        await WithIncidents(factory, async s => { await s.ReleaseFenceAsync(fence.FenceId, course.ManagerId); return 0; });

        var ex = await Assert.ThrowsAsync<SportHub.BuildingBlocks.SharedKernel.Errors.ConflictException>(
            () => WithIncidents(factory, s => s.AbandonFenceAsync(fence.FenceId, course.ManagerId)));
        Assert.Equal("incident_fence_closed", ex.ErrorCode);
    }
}
