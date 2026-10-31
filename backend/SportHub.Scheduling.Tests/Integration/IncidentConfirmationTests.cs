using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SportHub.API.Persistence;
using SportHub.BuildingBlocks.SharedKernel.Errors;
using SportHub.Identity.Domain.Enums;
using SportHub.Scheduling.Catalog.Application;
using SportHub.Scheduling.Domain.Enums;
using SportHub.Scheduling.Rental.Application;
using SportHub.Scheduling.Rental.Domain;

namespace SportHub.Scheduling.Tests.Integration;

[Collection(nameof(SchedulingApiCollection))]
public sealed class IncidentConfirmationTests(SchedulingApiFactory factory)
{
    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task Session_and_block_plans_are_read_only_until_confirmation_and_rejected_gifts_leave_them_unchanged(bool withDayPassGift)
    {
        var course = await CourseTestData.CreateAsync(factory);
        var member = await factory.SeedUserAsync(UserRole.Member);
        await CourseTestData.EnrollmentAsync(factory, course.Id, member.UserId);
        var sessions = await CourseTestData.SessionsAsync(factory, course.Id);
        var first = sessions[0];
        var block = await CourseTestData.RunAsync<RoomBlockService, RoomBlockResponse>(factory,
            s => s.CreateAsync(new() { RoomId = course.RoomId, StartAtUtc = first.EndAtUtc.AddMinutes(10),
                EndAtUtc = first.EndAtUtc.AddMinutes(40), Reason = "Maintenance block" }, course.ManagerId));
        var request = new IncidentRequest("ROOM", course.RoomId, first.StartAtUtc, first.EndAtUtc.AddHours(1),
            "Incident with a replacement plan", Resolutions: [
                new(block.BlockId, "REMOVE_ROOM_BLOCK"),
                new(first.SessionId, "CANCEL_WITH_MAKEUP", "Repeat the whole affected session",
                    sessions.Max(s => s.EndAtUtc).AddDays(7), course.RoomId, course.CoachId)
            ]);
        IncidentPreviewResponse preview;
        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<SportHubDbContext>();
            await using var readOnly = await db.Database.BeginTransactionAsync();
            await db.Database.ExecuteSqlRawAsync("SET TRANSACTION READ ONLY");
            preview = await scope.ServiceProvider.GetRequiredService<IncidentService>().ReviewAsync(request, course.ManagerId);
            Assert.True(preview.CanResolve);
            Assert.Null(preview.FenceId);
            await readOnly.RollbackAsync();
        }
        Assert.Equal(3, (await CourseTestData.SessionsAsync(factory, course.Id)).Count);
        Assert.True(await factory.QueryAsync(db => db.RoomBlocks.AnyAsync(b => b.BlockId == block.BlockId)));
        Assert.False(await factory.QueryAsync(db => db.Set<IncidentFence>().AnyAsync(f => f.RoomId == course.RoomId)));
        Assert.False(await factory.QueryAsync(db => db.Set<IncidentNotice>().AnyAsync(f => f.RoomId == course.RoomId)));
        var confirmation = request with { OperationId = Guid.NewGuid(), PreviewToken = preview.PreviewToken, Refunds = [],
            DayPassGifts = withDayPassGift ? [new(Guid.NewGuid(), 5)] : [] };
        if (withDayPassGift)
        {
            var error = await Assert.ThrowsAsync<BadRequestException>(() =>
                CourseTestData.RunAsync<IncidentService, Guid>(factory, s => s.ResolveAsync(confirmation, course.ManagerId)));
            Assert.Equal("incident_day_pass_compensation_disabled", error.ErrorCode);
            // Day-pass gifts are rejected before applying the class and block plans.
            Assert.Equal(ClassSessionStatus.Scheduled, (await CourseTestData.SessionsAsync(factory, course.Id))[0].Status);
            Assert.Equal(3, (await CourseTestData.SessionsAsync(factory, course.Id)).Count);
            Assert.True(await factory.QueryAsync(db => db.RoomBlocks.AnyAsync(b => b.BlockId == block.BlockId)));
            Assert.False(await factory.QueryAsync(db => db.Set<IncidentFence>().AnyAsync(f => f.RoomId == course.RoomId)));
            Assert.False(await factory.QueryAsync(db => db.Set<IncidentNotice>().AnyAsync(f => f.RoomId == course.RoomId)));
            return;
        }
        var id = await CourseTestData.RunAsync<IncidentService, Guid>(factory, s => s.ResolveAsync(confirmation, course.ManagerId));
        Assert.Equal(ClassSessionStatus.Cancelled, (await CourseTestData.SessionsAsync(factory, course.Id))[0].Status);
        Assert.Equal(4, (await CourseTestData.SessionsAsync(factory, course.Id)).Count);
        Assert.False(await factory.QueryAsync(db => db.RoomBlocks.AnyAsync(b => b.BlockId == block.BlockId)));
        Assert.True(await factory.QueryAsync(db => db.Set<IncidentNotice>().AnyAsync(f => f.IncidentId == id)));
        Assert.False(await factory.QueryAsync(db => db.Set<IncidentFence>().AnyAsync(f => f.RoomId == course.RoomId && f.Status == IncidentFenceStatus.Open)));
        var retry = await CourseTestData.RunAsync<IncidentService, Guid>(factory, s => s.ResolveAsync(confirmation, course.ManagerId));
        Assert.Equal(id, retry);
        Assert.Equal(4, (await CourseTestData.SessionsAsync(factory, course.Id)).Count);
    }
}
