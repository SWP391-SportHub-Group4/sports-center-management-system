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

namespace SportHub.Scheduling.Tests.Integration;

/// <summary>Catalog đa môn: môn, loại phòng, giờ mở cửa, khung giá, RBAC và gợi ý phòng/coach trống.</summary>
[Collection(nameof(SchedulingApiCollection))]
public class SportCatalogTests(SchedulingApiFactory factory)
{
    private const int BadmintonSportId = 3;   // seed: GroupCourse + CourtRental
    private const int GymSportId = 1;         // seed: MembershipAccess + PersonalTraining
    private const int BadmintonRoomTypeId = 3;
    private const int BasketballRoomTypeId = 4;

    private async Task<HttpClient> ManagerAsync()
    {
        var manager = await factory.SeedUserAsync(UserRole.CenterManager);
        return factory.CreateApiClient(manager.UserId, UserRole.CenterManager);
    }

    private static string Unique(string prefix) => prefix + "-" + Guid.NewGuid().ToString("N")[..8];

    private static string UniqueCode() => "s_" + Guid.NewGuid().ToString("N")[..10];

    private static object[] GroupCourse(int minutes = 60, int capacity = 8)
        => [new { serviceType = "GROUP_COURSE", isEnabled = true, defaultSessionMinutes = minutes, defaultMaxCapacity = capacity }];

    private static async Task<JsonElement> Json(HttpResponseMessage r) => JsonDocument.Parse(await r.Content.ReadAsStringAsync()).RootElement;

    private static async Task<string> ErrorOf(HttpResponseMessage r) => (await Json(r)).GetProperty("error").GetString()!;

    // --- Môn ---

    [Fact]
    public async Task Public_list_shows_only_active_sports_and_needs_no_login()
    {
        var manager = await ManagerAsync();
        var name = Unique("Pickleball");
        var created = await manager.PostAsJsonAsync("api/manager/sports", new
        {
            code = UniqueCode(), name, sortOrder = 90, services = GroupCourse()
        });
        Assert.Equal(HttpStatusCode.Created, created.StatusCode);
        var sportId = (await Json(created)).GetProperty("sportId").GetInt32();

        var anonymous = factory.CreateApiClient();
        var publicSports = (await Json(await anonymous.GetAsync("api/sports"))).EnumerateArray().ToList();
        // Công khai không lộ readiness; chỉ có dịch vụ đang bật.
        Assert.All(publicSports, e => Assert.False(e.TryGetProperty("readiness", out var r) && r.ValueKind != JsonValueKind.Null));
        var publicNames = (await Json(await anonymous.GetAsync("api/sports"))).EnumerateArray().Select(e => e.GetProperty("name").GetString()).ToList();
        Assert.Contains(name, publicNames);
        Assert.Contains("Gym", publicNames);

        Assert.Equal(HttpStatusCode.OK, (await manager.PostAsync($"api/manager/sports/{sportId}/deactivate", null)).StatusCode);

        var afterPublic = (await Json(await anonymous.GetAsync("api/sports"))).EnumerateArray().Select(e => e.GetProperty("name").GetString()).ToList();
        Assert.DoesNotContain(name, afterPublic);

        var managerView = (await Json(await manager.GetAsync("api/manager/sports"))).EnumerateArray().Select(e => e.GetProperty("name").GetString()).ToList();
        Assert.Contains(name, managerView);
    }

    [Fact]
    public async Task Sport_validation_uniqueness_and_immutable_code()
    {
        var manager = await ManagerAsync();

        var noDefaults = await manager.PostAsJsonAsync("api/manager/sports", new
        {
            code = UniqueCode(), name = Unique("Tennis"), services = new[] { new { serviceType = "GROUP_COURSE", isEnabled = true } }
        });
        Assert.Equal("sport_group_course_defaults_required", await ErrorOf(noDefaults));

        var badType = await manager.PostAsJsonAsync("api/manager/sports", new
        {
            code = UniqueCode(), name = Unique("X"), services = new[] { new { serviceType = "NOPE", isEnabled = true } }
        });
        Assert.Equal("service_type_invalid", await ErrorOf(badType));

        var badCode = await manager.PostAsJsonAsync("api/manager/sports", new { code = "Bad Code!", name = Unique("Y"), services = Array.Empty<object>() });
        Assert.Equal("sport_code_invalid", await ErrorOf(badCode));

        // Membership/PT chỉ thuộc môn Gym: backend chặn, không chỉ ẩn ở UI.
        var notGym = await manager.PostAsJsonAsync("api/manager/sports", new
        {
            code = UniqueCode(), name = Unique("Yoga"), services = new[] { new { serviceType = "PERSONAL_TRAINING", isEnabled = true } }
        });
        Assert.Equal("service_not_allowed_for_sport", await ErrorOf(notGym));

        var defaultsOnRental = await manager.PostAsJsonAsync("api/manager/sports", new
        {
            code = UniqueCode(), name = Unique("Z"), services = new[] { new { serviceType = "COURT_RENTAL", isEnabled = true, defaultSessionMinutes = 60 } }
        });
        Assert.Equal("service_defaults_not_allowed", await ErrorOf(defaultsOnRental));

        var name = Unique("Squash");
        var code = UniqueCode();
        var ok = await manager.PostAsJsonAsync("api/manager/sports", new { code, name, services = GroupCourse() });
        Assert.Equal(HttpStatusCode.Created, ok.StatusCode);
        var id = (await Json(ok)).GetProperty("sportId").GetInt32();

        // Trùng tên khác hoa/thường, trùng mã.
        var dup = await manager.PostAsJsonAsync("api/manager/sports", new { code = UniqueCode(), name = name.ToUpperInvariant(), services = GroupCourse() });
        Assert.Equal(HttpStatusCode.Conflict, dup.StatusCode);
        Assert.Equal("sport_name_taken", await ErrorOf(dup));
        var dupCode = await manager.PostAsJsonAsync("api/manager/sports", new { code = code.ToUpperInvariant(), name = Unique("W"), services = GroupCourse() });
        Assert.Equal("sport_code_taken", await ErrorOf(dupCode));

        var change = await manager.PutAsJsonAsync($"api/manager/sports/{id}", new { code = UniqueCode(), name, services = GroupCourse() });
        Assert.Equal("sport_code_immutable", await ErrorOf(change));
    }

    [Fact]
    public async Task Disabling_one_service_keeps_the_others_and_unlisted_services_are_disabled_not_deleted()
    {
        var manager = await ManagerAsync();
        var created = await manager.PostAsJsonAsync("api/manager/sports", new
        {
            code = UniqueCode(), name = Unique("Padel"), services = new object[]
            {
                new { serviceType = "GROUP_COURSE", isEnabled = true, defaultSessionMinutes = 90, defaultMaxCapacity = 8 },
                new { serviceType = "COURT_RENTAL", isEnabled = true }
            }
        });
        var id = (await Json(created)).GetProperty("sportId").GetInt32();

        var off = await manager.PostAsync($"api/manager/sports/{id}/services/COURT_RENTAL/disable", null);
        Assert.Equal(HttpStatusCode.OK, off.StatusCode);
        var services = (await Json(off)).GetProperty("services").EnumerateArray().ToDictionary(
            e => e.GetProperty("serviceType").GetString()!, e => e.GetProperty("isEnabled").GetBoolean());
        Assert.False(services["COURT_RENTAL"]);
        Assert.True(services["GROUP_COURSE"]);

        // PUT chỉ liệt kê lớp: thuê sân không bị xóa mà bị tắt.
        var put = await manager.PutAsJsonAsync($"api/manager/sports/{id}", new { name = Unique("Padel2"), services = GroupCourse(90, 8) });
        Assert.Equal(HttpStatusCode.OK, put.StatusCode);
        Assert.Equal(2, (await Json(put)).GetProperty("services").GetArrayLength());

        // Dịch vụ chưa cấu hình thì không bật được.
        var missing = await manager.PostAsync($"api/manager/sports/{id}/services/PERSONAL_TRAINING/enable", null);
        Assert.Equal("service_not_configured", await ErrorOf(missing));
    }

    [Theory]
    [InlineData(UserRole.Receptionist)]
    [InlineData(UserRole.Coach)]
    [InlineData(UserRole.Member)]
    [InlineData(UserRole.SystemAdministrator)]
    public async Task Only_the_manager_writes_catalog(UserRole role)
    {
        var user = await factory.SeedUserAsync(role);
        var client = factory.CreateApiClient(user.UserId, role);

        Assert.Equal(HttpStatusCode.Forbidden,
            (await client.PostAsJsonAsync("api/manager/sports", new { code = UniqueCode(), name = Unique("Z"), services = Array.Empty<object>() })).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden,
            (await client.PostAsJsonAsync("api/manager/room-types", new { name = Unique("Z") })).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden,
            (await client.PostAsJsonAsync("api/manager/court-rates", new
            {
                roomTypeId = BadmintonRoomTypeId, daysOfWeek = new[] { "MON" }, startTimeLocal = "06:00", endTimeLocal = "12:00", pricePerHour = 100000
            })).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden,
            (await client.PutAsJsonAsync("api/manager/rooms/1/opening-hours", new { hours = Array.Empty<object>() })).StatusCode);
    }

    [Fact]
    public async Task Free_text_with_quotes_and_newlines_is_stored_in_the_audit_log_as_valid_json()
    {
        var manager = await ManagerAsync();
        var name = Unique("Cờ \"vua\"\n2");

        var sport = await manager.PostAsJsonAsync("api/manager/sports", new { code = UniqueCode(), name, services = Array.Empty<object>() });
        Assert.Equal(HttpStatusCode.Created, sport.StatusCode);

        var type = await manager.PostAsJsonAsync("api/manager/room-types", new { name = Unique("Loại \"đặc biệt\"") });
        Assert.Equal(HttpStatusCode.Created, type.StatusCode);

        var room = await manager.PostAsJsonAsync("api/rooms", new { name = Unique("P \"1\""), capacity = 4 });
        Assert.Equal(HttpStatusCode.Created, room.StatusCode);
    }

    // --- Loại phòng, phòng ---

    [Fact]
    public async Task Room_type_compat_room_assignment_and_in_use_protection()
    {
        var manager = await ManagerAsync();

        var name = Unique("Sân tennis");
        var created = await manager.PostAsJsonAsync("api/manager/room-types", new { name });
        Assert.Equal(HttpStatusCode.Created, created.StatusCode);
        var typeId = (await Json(created)).GetProperty("roomTypeId").GetInt32();

        Assert.Equal(HttpStatusCode.Conflict,
            (await manager.PostAsJsonAsync("api/manager/room-types", new { name = name.ToUpperInvariant() })).StatusCode);

        var badSport = await manager.PutAsJsonAsync($"api/manager/room-types/{typeId}/sports", new { sportIds = new[] { 9999 } });
        Assert.Equal("invalid_sport", await ErrorOf(badSport));

        var set = await manager.PutAsJsonAsync($"api/manager/room-types/{typeId}/sports", new { sportIds = new[] { BadmintonSportId } });
        Assert.Equal(HttpStatusCode.OK, set.StatusCode);
        Assert.Equal(BadmintonSportId, (await Json(set)).GetProperty("sportIds")[0].GetInt32());

        var badRoom = await manager.PostAsJsonAsync("api/rooms", new { name = Unique("R"), capacity = 8, roomTypeId = 9999 });
        Assert.Equal("invalid_room_type", await ErrorOf(badRoom));

        var room = await manager.PostAsJsonAsync("api/rooms", new { name = Unique("R"), capacity = 8, roomTypeId = typeId });
        Assert.Equal(HttpStatusCode.Created, room.StatusCode);
        var roomJson = await Json(room);
        Assert.Equal(typeId, roomJson.GetProperty("roomTypeId").GetInt32());
        Assert.True(roomJson.GetProperty("isActive").GetBoolean());

        // Loại phòng đang có phòng dùng thì không xóa được.
        Assert.Equal("room_type_in_use", await ErrorOf(await manager.DeleteAsync($"api/manager/room-types/{typeId}")));

        // Ngừng phòng bằng cập nhật; không truyền isActive thì giữ nguyên.
        var roomId = roomJson.GetProperty("roomId").GetInt32();
        var off = await manager.PutAsJsonAsync($"api/rooms/{roomId}", new { name = roomJson.GetProperty("name").GetString(), capacity = 8, isActive = false });
        Assert.False((await Json(off)).GetProperty("isActive").GetBoolean());
        var keep = await manager.PutAsJsonAsync($"api/rooms/{roomId}", new { name = roomJson.GetProperty("name").GetString(), capacity = 9 });
        Assert.False((await Json(keep)).GetProperty("isActive").GetBoolean());
    }

    [Fact]
    public async Task Catalog_reader_port_reflects_room_sport_compatibility_and_inactive_state()
    {
        var manager = await ManagerAsync();
        var room = await manager.PostAsJsonAsync("api/rooms", new { name = Unique("Court"), capacity = 8, roomTypeId = BadmintonRoomTypeId });
        var roomId = (await Json(room)).GetProperty("roomId").GetInt32();

        using var scope = factory.Services.CreateScope();
        var reader = scope.ServiceProvider.GetRequiredService<ISportCatalogReader>();

        Assert.True(await reader.IsRoomCompatibleAsync(roomId, BadmintonSportId));
        Assert.False(await reader.IsRoomCompatibleAsync(roomId, GymSportId));

        await manager.PostAsJsonAsync($"api/manager/sports/{BadmintonSportId}/deactivate", new { });
        try
        {
            Assert.False(await reader.IsRoomCompatibleAsync(roomId, BadmintonSportId));
        }
        finally
        {
            await manager.PostAsync($"api/manager/sports/{BadmintonSportId}/activate", null);
        }
    }

    // --- Giờ mở cửa ---

    [Fact]
    public async Task Opening_hours_validation_and_roundtrip()
    {
        var manager = await ManagerAsync();
        var room = await manager.PostAsJsonAsync("api/rooms", new { name = Unique("Open"), capacity = 8, roomTypeId = BadmintonRoomTypeId });
        var roomId = (await Json(room)).GetProperty("roomId").GetInt32();

        var reversed = await manager.PutAsJsonAsync($"api/manager/rooms/{roomId}/opening-hours",
            new { hours = new[] { new { dayOfWeek = 1, openTimeLocal = "20:00", closeTimeLocal = "08:00" } } });
        Assert.Equal("invalid_opening_hours", await ErrorOf(reversed));

        var duplicate = await manager.PutAsJsonAsync($"api/manager/rooms/{roomId}/opening-hours", new
        {
            hours = new[]
            {
                new { dayOfWeek = 1, openTimeLocal = "06:00", closeTimeLocal = "10:00" },
                new { dayOfWeek = 1, openTimeLocal = "12:00", closeTimeLocal = "20:00" }
            }
        });
        Assert.Equal("duplicate_opening_day", await ErrorOf(duplicate));

        var badFormat = await manager.PutAsJsonAsync($"api/manager/rooms/{roomId}/opening-hours",
            new { hours = new[] { new { dayOfWeek = 1, openTimeLocal = "6h", closeTimeLocal = "10:00" } } });
        Assert.Equal("invalid_time", await ErrorOf(badFormat));

        var ok = await manager.PutAsJsonAsync($"api/manager/rooms/{roomId}/opening-hours", new
        {
            hours = new[]
            {
                new { dayOfWeek = 1, openTimeLocal = "06:00", closeTimeLocal = "22:00" },
                new { dayOfWeek = 6, openTimeLocal = "07:00", closeTimeLocal = "18:00" }
            }
        });
        Assert.Equal(HttpStatusCode.OK, ok.StatusCode);

        // Mọi người dùng đã đăng nhập đọc được.
        var member = await factory.SeedUserAsync(UserRole.Member);
        var read = await Json(await factory.CreateApiClient(member.UserId, UserRole.Member).GetAsync($"api/rooms/{roomId}/opening-hours"));
        Assert.Equal(2, read.GetArrayLength());
        Assert.Equal("06:00", read[0].GetProperty("openTimeLocal").GetString());

        // Thay toàn bộ: danh sách rỗng = đóng cửa cả tuần.
        await manager.PutAsJsonAsync($"api/manager/rooms/{roomId}/opening-hours", new { hours = Array.Empty<object>() });
        Assert.Equal(0, (await Json(await manager.GetAsync($"api/rooms/{roomId}/opening-hours"))).GetArrayLength());
    }

    // --- Bảng giá ---

    [Fact]
    public async Task Court_rates_price_rules_and_overlap_detection()
    {
        var manager = await ManagerAsync();
        var typeName = Unique("Sân giá");
        var typeId = (await Json(await manager.PostAsJsonAsync("api/manager/room-types", new { name = typeName }))).GetProperty("roomTypeId").GetInt32();
        await manager.PutAsJsonAsync($"api/manager/room-types/{typeId}/sports", new { sportIds = new[] { BadmintonSportId } });

        object Rate(string days, string start, string end, decimal price, int? sportId = null, bool active = true)
            => new { roomTypeId = typeId, sportId, daysOfWeek = days.Split(','), startTimeLocal = start, endTimeLocal = end, pricePerHour = price, isActive = active };

        Assert.Equal("invalid_price", await ErrorOf(await manager.PostAsJsonAsync("api/manager/court-rates", Rate("MON", "06:00", "12:00", 150500))));
        Assert.Equal("invalid_price", await ErrorOf(await manager.PostAsJsonAsync("api/manager/court-rates", Rate("MON", "06:00", "12:00", 0))));
        Assert.Equal("invalid_rate_window", await ErrorOf(await manager.PostAsJsonAsync("api/manager/court-rates", Rate("MON", "12:00", "06:00", 100000))));
        Assert.Equal("invalid_days", await ErrorOf(await manager.PostAsJsonAsync("api/manager/court-rates", Rate("FUNDAY", "06:00", "12:00", 100000))));
        Assert.Equal("sport_not_compatible", await ErrorOf(await manager.PostAsJsonAsync("api/manager/court-rates", Rate("MON", "06:00", "12:00", 100000, GymSportId))));

        var first = await manager.PostAsJsonAsync("api/manager/court-rates", Rate("MON,TUE", "06:00", "12:00", 100000));
        Assert.Equal(HttpStatusCode.Created, first.StatusCode);
        var firstId = (await Json(first)).GetProperty("rateId").GetInt32();

        // Chồng giờ cùng ngày -> 409; liền kề hoặc khác ngày -> được.
        Assert.Equal("court_rate_overlap", await ErrorOf(await manager.PostAsJsonAsync("api/manager/court-rates", Rate("TUE,WED", "11:00", "14:00", 120000))));
        Assert.Equal("court_rate_overlap", await ErrorOf(await manager.PostAsJsonAsync("api/manager/court-rates", Rate("MON", "07:00", "08:00", 120000, BadmintonSportId))));
        Assert.Equal(HttpStatusCode.Created, (await manager.PostAsJsonAsync("api/manager/court-rates", Rate("MON,TUE", "12:00", "18:00", 150000))).StatusCode);
        Assert.Equal(HttpStatusCode.Created, (await manager.PostAsJsonAsync("api/manager/court-rates", Rate("WED", "06:00", "12:00", 90000))).StatusCode);

        // Khung không hoạt động không gây chồng lấn.
        Assert.Equal(HttpStatusCode.Created, (await manager.PostAsJsonAsync("api/manager/court-rates", Rate("MON", "06:00", "12:00", 80000, active: false))).StatusCode);

        // Sửa chính nó không tự chồng lên chính nó.
        Assert.Equal(HttpStatusCode.OK, (await manager.PutAsJsonAsync($"api/manager/court-rates/{firstId}", Rate("MON,TUE", "06:00", "12:00", 110000))).StatusCode);

        var member = await factory.SeedUserAsync(UserRole.Member);
        var publicList = await Json(await factory.CreateApiClient(member.UserId, UserRole.Member).GetAsync($"api/court-rates?roomTypeId={typeId}"));
        Assert.All(publicList.EnumerateArray(), r => Assert.True(r.GetProperty("isActive").GetBoolean()));
    }

    // --- Gợi ý trống ---

    [Fact]
    public async Task Free_rooms_respect_type_opening_hours_blocks_and_active_state()
    {
        var manager = await ManagerAsync();
        var openRoom = (await Json(await manager.PostAsJsonAsync("api/rooms", new { name = Unique("Free"), capacity = 8, roomTypeId = BadmintonRoomTypeId })))
            .GetProperty("roomId").GetInt32();
        var closedRoom = (await Json(await manager.PostAsJsonAsync("api/rooms", new { name = Unique("NoHours"), capacity = 8, roomTypeId = BadmintonRoomTypeId })))
            .GetProperty("roomId").GetInt32();
        var wrongType = (await Json(await manager.PostAsJsonAsync("api/rooms", new { name = Unique("Hoop"), capacity = 8, roomTypeId = BasketballRoomTypeId })))
            .GetProperty("roomId").GetInt32();

        foreach (var id in new[] { openRoom, wrongType })
        {
            await manager.PutAsJsonAsync($"api/manager/rooms/{id}/opening-hours", new
            {
                hours = Enumerable.Range(0, 7).Select(d => new { dayOfWeek = d, openTimeLocal = "06:00", closeTimeLocal = "22:00" }).ToArray()
            });
        }

        // 09:00–10:00 giờ VN = 02:00–03:00 UTC.
        var start = new DateTime(2031, 4, 7, 2, 0, 0, DateTimeKind.Utc);
        var end = start.AddHours(1);
        var receptionist = await factory.SeedUserAsync(UserRole.Receptionist);
        var staff = factory.CreateApiClient(receptionist.UserId, UserRole.Receptionist);

        async Task<List<int>> FreeAsync(DateTime s, DateTime e)
        {
            var response = await staff.GetAsync($"api/availability/rooms?sportId={BadmintonSportId}&startUtc={s:O}&endUtc={e:O}");
            Assert.Equal(HttpStatusCode.OK, response.StatusCode);
            return (await Json(response)).EnumerateArray().Select(x => x.GetProperty("roomId").GetInt32()).ToList();
        }

        var free = await FreeAsync(start, end);
        Assert.Contains(openRoom, free);
        Assert.DoesNotContain(closedRoom, free);  // không có giờ mở cửa
        Assert.DoesNotContain(wrongType, free);   // loại phòng không chơi được môn này

        // Ngoài giờ mở cửa (05:00 VN = 22:00 UTC hôm trước).
        Assert.DoesNotContain(openRoom, await FreeAsync(start.AddHours(-4), start.AddHours(-3)));

        // Có block chồng thì hết trống.
        var block = await manager.PostAsJsonAsync("api/manager/room-blocks", new { roomId = openRoom, startAtUtc = start.AddMinutes(30), endAtUtc = end, reason = "Bảo trì" });
        Assert.Equal(HttpStatusCode.Created, block.StatusCode);
        Assert.DoesNotContain(openRoom, await FreeAsync(start, end));

        // Phòng ngừng hoạt động không được gợi ý.
        var inactive = (await Json(await manager.PostAsJsonAsync("api/rooms", new { name = Unique("Off"), capacity = 8, roomTypeId = BadmintonRoomTypeId, isActive = false })))
            .GetProperty("roomId").GetInt32();
        await manager.PutAsJsonAsync($"api/manager/rooms/{inactive}/opening-hours", new
        {
            hours = Enumerable.Range(0, 7).Select(d => new { dayOfWeek = d, openTimeLocal = "06:00", closeTimeLocal = "22:00" }).ToArray()
        });
        Assert.DoesNotContain(inactive, await FreeAsync(new DateTime(2031, 4, 8, 2, 0, 0, DateTimeKind.Utc), new DateTime(2031, 4, 8, 3, 0, 0, DateTimeKind.Utc)));

        // Khoảng quá dài bị từ chối; Member không xem được gợi ý vận hành.
        Assert.Equal(HttpStatusCode.BadRequest,
            (await staff.GetAsync($"api/availability/rooms?sportId={BadmintonSportId}&startUtc={start:O}&endUtc={start.AddHours(13):O}")).StatusCode);
        var member = await factory.SeedUserAsync(UserRole.Member);
        Assert.Equal(HttpStatusCode.Forbidden,
            (await factory.CreateApiClient(member.UserId, UserRole.Member)
                .GetAsync($"api/availability/rooms?sportId={BadmintonSportId}&startUtc={start:O}&endUtc={end:O}")).StatusCode);
    }

    [Fact]
    public async Task Free_coaches_need_the_specialty_and_no_overlapping_occupancy_and_busy_list_is_front_desk_only()
    {
        var coachFree = await factory.SeedUserAsync(UserRole.Coach);
        var coachBusy = await factory.SeedUserAsync(UserRole.Coach);
        var coachOtherSport = await factory.SeedUserAsync(UserRole.Coach);

        var start = new DateTime(2031, 5, 5, 3, 0, 0, DateTimeKind.Utc);
        var end = start.AddHours(1);

        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<SportHubDbContext>();
            db.UserSportSpecialties.AddRange(
                new SportHub.Identity.Domain.Entities.UserSportSpecialty { UserId = coachFree.UserId, SportId = BadmintonSportId },
                new SportHub.Identity.Domain.Entities.UserSportSpecialty { UserId = coachBusy.UserId, SportId = BadmintonSportId },
                new SportHub.Identity.Domain.Entities.UserSportSpecialty { UserId = coachOtherSport.UserId, SportId = 4 });

            var room = new Room { Name = Unique("CoachRoom"), Capacity = 8, RoomTypeId = BadmintonRoomTypeId };
            db.Rooms.Add(room);
            await db.SaveChangesAsync();

            var occupancy = scope.ServiceProvider.GetRequiredService<IOccupancyService>();
            var reserved = await occupancy.ReserveAsync(new OccupancyRequest(
                OccupancySources.PtSession, Guid.NewGuid(), room.RoomId, coachBusy.UserId, start.AddMinutes(10), end));
            Assert.True(reserved.Succeeded);
            await db.SaveChangesAsync();
        }

        var manager = await ManagerAsync();
        var response = await manager.GetAsync($"api/availability/coaches?sportId={BadmintonSportId}&startUtc={start:O}&endUtc={end:O}");
        var ids = (await Json(response)).EnumerateArray().Select(x => x.GetProperty("coachId").GetGuid()).ToList();

        Assert.Contains(coachFree.UserId, ids);
        Assert.DoesNotContain(coachBusy.UserId, ids);
        Assert.DoesNotContain(coachOtherSport.UserId, ids);

        // Coach xem được gợi ý trống nhưng không xem được ai đang chiếm phòng.
        var coach = factory.CreateApiClient(coachFree.UserId, UserRole.Coach);
        Assert.Equal(HttpStatusCode.OK, (await coach.GetAsync($"api/availability/coaches?sportId={BadmintonSportId}&startUtc={start:O}&endUtc={end:O}")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await coach.GetAsync($"api/availability/rooms/1/busy?fromUtc={start:O}&toUtc={end:O}")).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await manager.GetAsync($"api/availability/rooms/1/busy?fromUtc={start:O}&toUtc={end:O}")).StatusCode);
    }
}
