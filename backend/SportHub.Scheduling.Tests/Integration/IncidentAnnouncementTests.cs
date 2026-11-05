using Microsoft.EntityFrameworkCore;
using SportHub.BuildingBlocks.SharedKernel.Errors;
using SportHub.Identity.Domain.Entities;
using SportHub.Identity.Domain.Enums;
using SportHub.Notification.Domain.Enums;
using SportHub.Scheduling.Rental.Application;

namespace SportHub.Scheduling.Tests.Integration;

[Collection(nameof(SchedulingApiCollection))]
public sealed class IncidentAnnouncementTests(SchedulingApiFactory factory)
{
    [Theory]
    [InlineData("ROOM")]
    [InlineData("CENTER")]
    public async Task Confirmation_announces_to_every_active_role_once_and_review_or_failure_sends_nothing(string scope)
    {
        var manager = await factory.SeedUserAsync(UserRole.CenterManager);
        var admin = await factory.SeedUserAsync(UserRole.SystemAdministrator);
        var desk = await factory.SeedUserAsync(UserRole.Receptionist);
        var coach = await factory.SeedUserAsync(UserRole.Coach);
        var member = await factory.SeedUserAsync(UserRole.Member);
        var inactive = await factory.SeedUserAsync(UserRole.Member, UserStatus.Deactivated);
        var roomId = await CourseTestData.RoomAsync(factory);
        var expectedIds = await factory.QueryAsync(async db =>
        {
            db.UserAccounts.AddRange(Enumerable.Range(0, 201).Select(index => new UserAccount
            {
                UserId = Guid.NewGuid(), Email = $"incident-{Guid.NewGuid():N}@example.test",
                RoleId = member.RoleId, Status = UserStatus.Active, CreatedAt = DateTime.UtcNow,
                Profile = new UserProfile { FullName = $"Incident member {index}" }
            }));
            await db.SaveChangesAsync();
            return await db.UserAccounts.Where(u => u.Status == UserStatus.Active).Select(u => u.UserId).ToListAsync();
        });
        var start = DateTime.UtcNow.Date.AddYears(5).AddDays(scope == "ROOM" ? 1 : 3).AddHours(2);
        var operationId = Guid.NewGuid();
        var request = new IncidentRequest(scope, scope == "ROOM" ? roomId : null, start, start.AddHours(1),
            "Water supply maintenance", OperationId: operationId);
        var preview = await CourseTestData.RunAsync<IncidentService, IncidentPreviewResponse>(factory,
            s => s.ReviewAsync(request, manager.UserId));
        Assert.Equal(0, await AnnouncementCountAsync(operationId));
        request = request with { PreviewToken = preview.PreviewToken };
        await Assert.ThrowsAsync<BadRequestException>(() => CourseTestData.RunAsync<IncidentService, Guid>(factory,
            s => s.ResolveAsync(request with { DayPassGifts = [new(Guid.NewGuid(), 5)] }, manager.UserId)));
        Assert.Equal(0, await AnnouncementCountAsync(operationId));

        var id = await CourseTestData.RunAsync<IncidentService, Guid>(factory, s => s.ResolveAsync(request, manager.UserId));
        Assert.Equal(operationId, id);
        var notices = await factory.QueryAsync(db => db.Notifications.AsNoTracking()
            .Where(n => n.SourceEntityId == id && n.SourceEventType == NotificationSourceEventType.IncidentCreated).ToListAsync());
        Assert.True(expectedIds.Count > 200);
        Assert.Equal(expectedIds.Count * 2, notices.Count);
        foreach (var channel in new[] { NotificationChannel.InApp, NotificationChannel.Email })
        {
            var recipients = notices.Where(n => n.Channel == channel).Select(n => n.UserId).ToList();
            Assert.Equal(expectedIds.Order(), recipients.Select(id => id!.Value).Order());
            foreach (var userId in new[] { manager.UserId, admin.UserId, desk.UserId, coach.UserId, member.UserId })
                Assert.Contains(userId, recipients);
            Assert.DoesNotContain(inactive.UserId, recipients);
        }
        var inApp = notices.Where(n => n.Channel == NotificationChannel.InApp).ToList();
        Assert.All(inApp, n => Assert.Contains(request.Reason, n.Message));
        Assert.All(inApp, n => Assert.Contains("Vietnam time", n.Message));
        Assert.All(notices.Where(n => n.Channel == NotificationChannel.Email),
            n => Assert.False(string.IsNullOrWhiteSpace(n.ProtectedEmailPayload)));
        var delivery = await CourseTestData.RunAsync<IncidentService, SportHub.BuildingBlocks.Abstractions.Notifications.NotificationDelivery>(factory,
            s => s.DeliveryAsync(id));
        Assert.Equal(notices.Count, delivery.Total);

        var later = await factory.SeedUserAsync(UserRole.Member);
        Assert.Equal(id, await CourseTestData.RunAsync<IncidentService, Guid>(factory, s => s.ResolveAsync(request, manager.UserId)));
        Assert.Equal(notices.Count, await AnnouncementCountAsync(id));
        Assert.False(await factory.QueryAsync(db => db.Notifications.AnyAsync(n => n.SourceEntityId == id && n.UserId == later.UserId)));
    }

    private Task<int> AnnouncementCountAsync(Guid id) => factory.QueryAsync(db => db.Notifications
        .CountAsync(n => n.SourceEntityId == id && n.SourceEventType == NotificationSourceEventType.IncidentCreated));
}
