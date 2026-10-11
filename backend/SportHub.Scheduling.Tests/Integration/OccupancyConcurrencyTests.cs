using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SportHub.API.Persistence;
using SportHub.BuildingBlocks.Abstractions.Persistence;
using SportHub.BuildingBlocks.Abstractions.Scheduling;
using SportHub.Identity.Domain.Enums;
using SportHub.Scheduling.Domain.Entities;
using SportHub.Scheduling.Occupancy.Domain;

namespace SportHub.Scheduling.Tests.Integration;

/// <summary>
/// Chống trùng lịch phòng/coach do DB (exclusion constraint) chứ không chỉ do truy vấn kiểm trước.
/// PostgreSQL thật; các tình huống tranh chấp dùng hai transaction song song thật.
/// </summary>
[Collection(nameof(SchedulingApiCollection))]
public class OccupancyConcurrencyTests(SchedulingApiFactory factory)
{
    private static readonly DateTimeOffset Day = new(2031, 3, 3, 0, 0, 0, TimeSpan.Zero);

    private static DateTimeOffset At(int hour, int minute = 0) => Day.AddHours(hour).AddMinutes(minute);

    private async Task<int> SeedRoomAsync(int? roomTypeId = 3)
    {
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SportHubDbContext>();
        var room = new Room { Name = "Occ-" + Guid.NewGuid().ToString("N")[..10], Capacity = 10, RoomTypeId = roomTypeId };
        db.Rooms.Add(room);
        await db.SaveChangesAsync();
        return room.RoomId;
    }

    private static OccupancyRequest Req(string source, int? roomId, Guid? coachId, DateTimeOffset start, DateTimeOffset end, Guid? sourceId = null)
        => new(source, sourceId ?? Guid.NewGuid(), roomId, coachId, start, end);

    private async Task<OccupancyResult> ReserveInOwnTransactionAsync(OccupancyRequest request, bool commit = true)
    {
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ISportHubDbContext>();
        var occupancy = scope.ServiceProvider.GetRequiredService<IOccupancyService>();

        await using var tx = await db.Database.BeginTransactionAsync();
        var result = await occupancy.ReserveAsync(request);
        if (commit && result.Succeeded)
        {
            await tx.CommitAsync();
        }

        return result;
    }

    [Fact]
    public async Task Overlapping_reservations_on_the_same_room_only_one_wins()
    {
        var roomId = await SeedRoomAsync();

        var first = await ReserveInOwnTransactionAsync(Req(OccupancySources.ClassSession, roomId, null, At(8), At(9)));
        var second = await ReserveInOwnTransactionAsync(Req(OccupancySources.PtSession, roomId, null, At(8, 30), At(9, 30)));

        Assert.True(first.Succeeded);
        Assert.False(second.Succeeded);
        var conflict = Assert.Single(second.Conflicts);
        Assert.Equal("Room", conflict.Resource);
        Assert.Equal(nameof(OccupancySourceType.ClassSession), conflict.ConflictSourceType);
    }

    [Fact]
    public async Task Adjacent_intervals_do_not_conflict()
    {
        var roomId = await SeedRoomAsync();

        Assert.True((await ReserveInOwnTransactionAsync(Req(OccupancySources.ClassSession, roomId, null, At(8), At(9)))).Succeeded);
        Assert.True((await ReserveInOwnTransactionAsync(Req(OccupancySources.ClassSession, roomId, null, At(9), At(10)))).Succeeded);
        Assert.True((await ReserveInOwnTransactionAsync(Req(OccupancySources.ClassSession, roomId, null, At(7), At(8)))).Succeeded);
    }

    [Fact]
    public async Task Same_coach_in_two_different_rooms_at_the_same_time_conflicts()
    {
        var roomA = await SeedRoomAsync();
        var roomB = await SeedRoomAsync();
        var coach = (await factory.SeedUserAsync(UserRole.Coach)).UserId;

        Assert.True((await ReserveInOwnTransactionAsync(Req(OccupancySources.ClassSession, roomA, coach, At(10), At(11)))).Succeeded);

        var clash = await ReserveInOwnTransactionAsync(Req(OccupancySources.PtSession, roomB, coach, At(10, 30), At(11, 30)));

        Assert.False(clash.Succeeded);
        Assert.Contains(clash.Conflicts, c => c.Resource == "Coach");

        // Phòng B không bị chiếm dở dang bởi lần thất bại: cùng giờ vẫn đặt được khi dùng coach khác.
        var otherCoach = (await factory.SeedUserAsync(UserRole.Coach)).UserId;
        Assert.True((await ReserveInOwnTransactionAsync(Req(OccupancySources.PtSession, roomB, otherCoach, At(10, 30), At(11, 30)))).Succeeded);
    }

    [Theory]
    [InlineData(OccupancySources.ClassSession, OccupancySources.PtSession)]
    [InlineData(OccupancySources.CourtRental, OccupancySources.ClassSession)]
    [InlineData(OccupancySources.CourtRental, OccupancySources.PtSession)]
    [InlineData(OccupancySources.CourtRental, OccupancySources.RoomBlock)]
    public async Task Two_concurrent_transactions_racing_for_the_same_slot_one_gets_a_clean_conflict(string firstSource, string secondSource)
    {
        var roomId = await SeedRoomAsync();

        // T1 đã chèn nhưng CHƯA commit. T2 kiểm tra trước không thấy gì (dữ liệu chưa commit) nên đi thẳng tới INSERT
        // và bị chặn bởi exclusion constraint của DB — đây là đường race thật, không phải truy vấn kiểm trước.
        using var scope1 = factory.Services.CreateScope();
        var db1 = scope1.ServiceProvider.GetRequiredService<ISportHubDbContext>();
        await using var tx1 = await db1.Database.BeginTransactionAsync();
        var r1 = await scope1.ServiceProvider.GetRequiredService<IOccupancyService>()
            .ReserveAsync(Req(firstSource, roomId, null, At(14), At(15)));
        Assert.True(r1.Succeeded);

        var t2 = Task.Run(async () =>
        {
            using var scope2 = factory.Services.CreateScope();
            var db2 = scope2.ServiceProvider.GetRequiredService<ISportHubDbContext>();
            await using var tx2 = await db2.Database.BeginTransactionAsync();

            var r2 = await scope2.ServiceProvider.GetRequiredService<IOccupancyService>()
                .ReserveAsync(Req(secondSource, roomId, null, At(14, 15), At(14, 45)));

            // Sau khi thua, transaction của caller vẫn dùng được (đã rollback về savepoint).
            var stillUsable = await db2.Set<Room>().AnyAsync(r => r.RoomId == roomId);
            await tx2.CommitAsync();

            return (r2, stillUsable);
        });

        await Task.Delay(500); // để T2 kịp treo ở INSERT chờ T1
        Assert.False(t2.IsCompleted);
        await tx1.CommitAsync();

        var (result2, usable) = await t2;

        Assert.False(result2.Succeeded);
        Assert.NotEmpty(result2.Conflicts);
        Assert.True(usable);

        using var verify = factory.Services.CreateScope();
        var db = verify.ServiceProvider.GetRequiredService<SportHubDbContext>();
        Assert.Equal(1, await db.RoomOccupancies.CountAsync(o => o.RoomId == roomId && o.IsActive));
    }

    [Fact]
    public async Task Replace_that_conflicts_keeps_the_original_schedule()
    {
        var roomId = await SeedRoomAsync();
        var sourceId = Guid.NewGuid();

        Assert.True((await ReserveInOwnTransactionAsync(Req(OccupancySources.PtSession, roomId, null, At(8), At(9), sourceId))).Succeeded);
        Assert.True((await ReserveInOwnTransactionAsync(Req(OccupancySources.ClassSession, roomId, null, At(11), At(12)))).Succeeded);

        // Dời buổi sang 11:30 đụng lịch lớp -> thất bại, lịch 8:00–9:00 còn nguyên.
        var moved = await ReserveInOwnTransactionAsync(Req(OccupancySources.PtSession, roomId, null, At(11, 30), At(12, 30), sourceId));
        Assert.False(moved.Succeeded);

        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SportHubDbContext>();
        var row = await db.RoomOccupancies.SingleAsync(o => o.SourceId == sourceId);
        Assert.True(row.IsActive);
        Assert.Equal(At(8).UtcDateTime, DateTime.SpecifyKind(row.StartAtUtc, DateTimeKind.Utc));

        // Dời sang giờ trống thì đổi cùng một dòng (không nhân đôi).
        Assert.True((await ReserveInOwnTransactionAsync(Req(OccupancySources.PtSession, roomId, null, At(15), At(16), sourceId))).Succeeded);
        Assert.Equal(1, await db.RoomOccupancies.CountAsync(o => o.SourceId == sourceId));
    }

    [Fact]
    public async Task Release_frees_the_slot_and_the_source_can_book_again()
    {
        var roomId = await SeedRoomAsync();
        var sourceId = Guid.NewGuid();

        Assert.True((await ReserveInOwnTransactionAsync(Req(OccupancySources.CourtRental, roomId, null, At(16), At(17), sourceId))).Succeeded);
        Assert.False((await ReserveInOwnTransactionAsync(Req(OccupancySources.ClassSession, roomId, null, At(16), At(17)))).Succeeded);

        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<ISportHubDbContext>();
            await scope.ServiceProvider.GetRequiredService<IOccupancyService>().ReleaseAsync(OccupancySources.CourtRental, sourceId);
            await db.SaveChangesAsync();
        }

        Assert.True((await ReserveInOwnTransactionAsync(Req(OccupancySources.ClassSession, roomId, null, At(16), At(17)))).Succeeded);
        // Nguồn cũ đặt lại đúng khoảng đó khi đã có lớp chiếm -> xung đột; đặt khung khác -> dùng lại dòng cũ.
        Assert.False((await ReserveInOwnTransactionAsync(Req(OccupancySources.CourtRental, roomId, null, At(16), At(17), sourceId))).Succeeded);
        Assert.True((await ReserveInOwnTransactionAsync(Req(OccupancySources.CourtRental, roomId, null, At(18), At(19), sourceId))).Succeeded);
    }

    [Fact]
    public async Task Room_block_over_an_existing_booking_is_409_with_the_conflict_list_and_no_side_effects()
    {
        var roomId = await SeedRoomAsync();
        Assert.True((await ReserveInOwnTransactionAsync(Req(OccupancySources.CourtRental, roomId, null, At(9), At(10)))).Succeeded);

        var manager = await factory.SeedUserAsync(UserRole.CenterManager);
        var client = factory.CreateApiClient(manager.UserId, UserRole.CenterManager);

        var blocked = await client.PostAsJsonAsync("api/manager/room-blocks", new
        {
            roomId,
            startAtUtc = At(9, 30).UtcDateTime,
            endAtUtc = At(10, 30).UtcDateTime,
            reason = "Bảo trì sàn"
        });

        Assert.Equal(HttpStatusCode.Conflict, blocked.StatusCode);
        var body = JsonDocument.Parse(await blocked.Content.ReadAsStringAsync()).RootElement;
        Assert.Equal("occupancy_conflict", body.GetProperty("error").GetString());
        Assert.Equal(1, body.GetProperty("conflicts").GetArrayLength());

        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SportHubDbContext>();
        Assert.Equal(0, await db.RoomBlocks.CountAsync(b => b.RoomId == roomId));

        // Khung trống thì khóa được, và khóa chiếm chỗ thật: đặt chồng lên khóa bị chặn; xóa khóa thì đặt lại được.
        var ok = await client.PostAsJsonAsync("api/manager/room-blocks", new
        {
            roomId, startAtUtc = At(12).UtcDateTime, endAtUtc = At(13).UtcDateTime, reason = "Sự kiện nội bộ"
        });
        Assert.Equal(HttpStatusCode.Created, ok.StatusCode);
        var blockId = JsonDocument.Parse(await ok.Content.ReadAsStringAsync()).RootElement.GetProperty("blockId").GetGuid();

        Assert.False((await ReserveInOwnTransactionAsync(Req(OccupancySources.ClassSession, roomId, null, At(12, 15), At(12, 45)))).Succeeded);

        Assert.Equal(HttpStatusCode.NoContent, (await client.DeleteAsync($"api/manager/room-blocks/{blockId}")).StatusCode);
        Assert.True((await ReserveInOwnTransactionAsync(Req(OccupancySources.ClassSession, roomId, null, At(12, 15), At(12, 45)))).Succeeded);
    }

    [Fact]
    public async Task Only_the_manager_can_create_room_blocks()
    {
        var roomId = await SeedRoomAsync();
        var payload = new { roomId, startAtUtc = At(20).UtcDateTime, endAtUtc = At(21).UtcDateTime, reason = "thử" };

        foreach (var role in new[] { UserRole.Receptionist, UserRole.Coach, UserRole.Member, UserRole.SystemAdministrator })
        {
            var user = await factory.SeedUserAsync(role);
            var response = await factory.CreateApiClient(user.UserId, role).PostAsJsonAsync("api/manager/room-blocks", payload);

            Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
        }
    }
}
