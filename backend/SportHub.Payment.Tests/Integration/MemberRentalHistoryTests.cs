using System.Net;
using System.Net.Http.Json;
using Microsoft.EntityFrameworkCore;
using SportHub.BuildingBlocks.SharedKernel.Pagination;
using SportHub.Identity.Domain.Enums;
using SportHub.Scheduling.Domain.Entities;
using SportHub.Scheduling.Rental.Application;
using SportHub.Scheduling.Rental.Domain;

namespace SportHub.Payment.Tests.Integration;

[Collection(nameof(PaymentApiCollection))]
public sealed class MemberRentalHistoryTests(PaymentApiFactory factory)
{
    [Fact]
    public async Task Manager_history_is_member_scoped_paged_newest_first_and_includes_old_cancelled_rentals()
    {
        var member = await factory.SeedUserAsync(UserRole.Member);
        var other = await factory.SeedUserAsync(UserRole.Member);
        var manager = await factory.SeedUserAsync(UserRole.CenterManager);
        var desk = await factory.SeedUserAsync(UserRole.Receptionist);
        var oldest = DateTime.UtcNow.AddYears(-1);
        await factory.QueryAsync(async db =>
        {
            var room = await db.Set<Room>().FirstAsync();
            var sport = await db.Sports.FirstAsync();
            for (var i = 0; i < 22; i++)
                db.Set<CourtRental>().Add(new()
                {
                    CourtRentalId = Guid.NewGuid(), MemberId = i == 21 ? other.UserId : member.UserId,
                    RoomId = room.RoomId, SportId = sport.SportId,
                    StartAtUtc = oldest.AddDays(i), EndAtUtc = oldest.AddDays(i).AddHours(1),
                    TotalPrice = 100000, Status = i == 0 ? CourtRentalStatus.Cancelled : CourtRentalStatus.Completed,
                    CreatedAtUtc = oldest
                });
            return await db.SaveChangesAsync();
        });
        var url = $"/api/manager/members/{member.UserId}/court-rentals";
        using var client = factory.CreateApiClient(manager.UserId, UserRole.CenterManager);
        var first = (await client.GetFromJsonAsync<PagedResult<MemberCourtRentalHistory>>(url))!;
        var second = (await client.GetFromJsonAsync<PagedResult<MemberCourtRentalHistory>>(url + "?page=2"))!;
        Assert.Equal(21, first.TotalCount);
        Assert.Equal(20, first.Items.Count);
        Assert.Single(second.Items);
        Assert.InRange((oldest.AddDays(20) - first.Items[0].StartAtUtc).Duration(), TimeSpan.Zero, TimeSpan.FromMilliseconds(1));
        Assert.Equal(CourtRentalStatus.Cancelled.ToString(), second.Items[0].Status);
        Assert.All(first.Items, row => Assert.False(string.IsNullOrWhiteSpace(row.RoomName)));
        using var memberClient = factory.CreateApiClient(member.UserId, UserRole.Member);
        using var deskClient = factory.CreateApiClient(desk.UserId, UserRole.Receptionist);
        Assert.Equal(HttpStatusCode.Forbidden, (await memberClient.GetAsync(url)).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await deskClient.GetAsync(url)).StatusCode);
    }
}
