using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SportHub.BuildingBlocks.Abstractions.Scheduling;
using SportHub.BuildingBlocks.SharedKernel.Errors;
using SportHub.BuildingBlocks.SharedKernel.Time;
using SportHub.Identity.Domain.Enums;
using SportHub.Scheduling.Catalog.Domain;
using SportHub.Scheduling.Domain.Entities;
using SportHub.Scheduling.Rental.Application;
using SportHub.Scheduling.Rental.Domain;

namespace SportHub.Scheduling.Tests.Integration;

/// <summary>BR-130/138: Gym đóng cửa vì sự cố không hoàn Membership mà gia hạn Membership Active theo số ngày đóng cửa.</summary>
[Collection(nameof(SchedulingApiCollection))]
public sealed class GymClosureIncidentTests(SchedulingApiFactory factory)
{
    // Cửa sổ xa trong tương lai để không đụng lịch lớp/thuê sân do các test khác tạo.
    private static (DateTime Start, DateTime End) TwoFullDays(int daysAhead)
    {
        var first = DateOnly.FromDateTime(VietnamTime.ToLocal(DateTime.UtcNow)).AddDays(daysAhead);
        return (VietnamTime.StartOfDayUtc(first), VietnamTime.StartOfDayUtc(first.AddDays(2)));
    }

    private async Task EnsureGymRoomAsync()
    {
        await factory.QueryAsync(async db =>
        {
            var gymRoomTypeIds = await db.Set<SportRoomType>()
                .Join(db.Set<Sport>().Where(sport => sport.Code == "gym"),
                    link => link.SportId, sport => sport.SportId, (link, _) => link.RoomTypeId)
                .ToListAsync();
            Assert.NotEmpty(gymRoomTypeIds);
            if (!await db.Set<Room>().AnyAsync(r => r.IsActive && r.RoomTypeId != null && gymRoomTypeIds.Contains(r.RoomTypeId.Value)))
            {
                db.Set<Room>().Add(new Room { Name = $"Gym floor {Guid.NewGuid():N}", Capacity = 30, RoomTypeId = gymRoomTypeIds[0] });
                await db.SaveChangesAsync();
            }
            return 0;
        });
    }

    [Fact]
    public async Task Closing_every_active_room_extends_active_memberships_and_notifies_members()
    {
        await EnsureGymRoomAsync();
        var manager = await factory.SeedUserAsync(UserRole.CenterManager);
        var member = await factory.SeedUserAsync(UserRole.Member);
        var package = await factory.SeedMemberPackageAsync(
            member.UserId, endDate: DateOnly.FromDateTime(DateTime.UtcNow).AddDays(500));
        var cancelled = await factory.SeedMemberPackageAsync((await factory.SeedUserAsync(UserRole.Member)).UserId,
            SportHub.Membership.Domain.Enums.MemberPackageStatus.Cancelled,
            endDate: DateOnly.FromDateTime(DateTime.UtcNow).AddDays(500));
        var (start, end) = TwoFullDays(400);
        var request = new IncidentRequest("Center", null, start, end, "Gym floor flooding", MembershipExtensionDays: 2);

        using (var scope = factory.Services.CreateScope())
        {
            var incidents = scope.ServiceProvider.GetRequiredService<IncidentService>();
            var preview = await incidents.PreviewAsync(request);
            Assert.True(preview.ClosesGym);
            Assert.Equal(2, preview.SuggestedMembershipExtensionDays);
            Assert.True(preview.AffectedMemberCount >= 1);
            await incidents.ResolveAsync(request, manager.UserId);
        }

        var extended = await factory.ReloadPackageAsync(package.MemberPackageId);
        Assert.Equal(package.EndDate.AddDays(2), extended.EndDate);
        Assert.Equal(package.StartDate, extended.StartDate);
        var untouched = await factory.ReloadPackageAsync(cancelled.MemberPackageId);
        Assert.Equal(cancelled.EndDate, untouched.EndDate);

        var notices = await factory.QueryAsync(db => db.Notifications.AsNoTracking()
            .Where(n => n.UserId == member.UserId && n.SourceEntityId == package.MemberPackageId).ToListAsync());
        Assert.Equal(2, notices.Count); // một thông báo trong ứng dụng và một email
        var notice = await factory.QueryAsync(db => db.Set<IncidentNotice>().AsNoTracking()
            .SingleAsync(x => x.StartAtUtc == start && x.EndAtUtc == end));
        Assert.Equal(2, notice.MembershipExtensionDays);
        Assert.True(notice.ExtendedMemberCount >= 1);
    }

    [Fact]
    public async Task Membership_extension_is_rejected_when_the_incident_does_not_close_the_whole_gym()
    {
        var manager = await factory.SeedUserAsync(UserRole.CenterManager);
        var roomId = await factory.QueryAsync(async db =>
        {
            var room = new Room { Name = $"Court {Guid.NewGuid():N}", Capacity = 10 };
            db.Set<Room>().Add(room);
            await db.SaveChangesAsync();
            return room.RoomId;
        });
        var (start, end) = TwoFullDays(430);
        var request = new IncidentRequest("Room", roomId, start, end, "Court repainting", MembershipExtensionDays: 1);

        using var scope = factory.Services.CreateScope();
        var incidents = scope.ServiceProvider.GetRequiredService<IncidentService>();
        Assert.False((await incidents.PreviewAsync(request)).ClosesGym);
        await Assert.ThrowsAsync<BadRequestException>(() => incidents.ResolveAsync(request, manager.UserId));
    }
}
