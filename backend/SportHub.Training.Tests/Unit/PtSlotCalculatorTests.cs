using SportHub.BuildingBlocks.Abstractions.Scheduling;
using SportHub.BuildingBlocks.SharedKernel.Errors;
using SportHub.BuildingBlocks.SharedKernel.Time;
using SportHub.Training.Domain.Rules;

namespace SportHub.Training.Tests.Unit;

public sealed class PtSlotCalculatorTests
{
    // 2030-10-07 là Thứ Hai (DayOfWeek = 1). Giờ địa phương = UTC + 7.
    private static readonly DateOnly Monday = new(2030, 10, 7);
    private static readonly DateTime NowUtc = new(2030, 10, 1, 0, 0, 0, DateTimeKind.Utc);
    private static readonly DateTime ValidityStart = new(2030, 1, 1, 0, 0, 0, DateTimeKind.Utc);
    private static readonly DateTime ValidityEnd = new(2031, 1, 1, 0, 0, 0, DateTimeKind.Utc);

    private static DateTime Local(DateOnly date, int hour, int minute = 0)
        => VietnamTime.StartOfDayUtc(date).AddHours(hour).AddMinutes(minute);

    private static RoomAvailability Room(int id, string name, int openHour, int closeHour, params TimeWindow[] busy)
        => new(id, name, [new RoomOpeningDay(1, new TimeOnly(openHour, 0), new TimeOnly(closeHour, 0))], busy);

    private static IReadOnlyList<PtSlot> Compute(
        IReadOnlyList<RoomAvailability> rooms,
        IReadOnlyList<TimeWindow>? coachBusy = null,
        IReadOnlyList<TimeWindow>? memberBusy = null,
        DateTime? now = null)
        => PtSlotCalculator.Compute(
            now ?? NowUtc, Monday, Monday, rooms, coachBusy ?? [], memberBusy ?? [], ValidityStart, ValidityEnd);

    [Fact]
    public void Slots_are_90_minutes_on_a_30_minute_grid_and_end_by_closing_time()
    {
        var slots = Compute([Room(1, "Studio A", 6, 9)]);

        Assert.Equal(
            [Local(Monday, 6), Local(Monday, 6, 30), Local(Monday, 7), Local(Monday, 7, 30)],
            slots.Select(s => s.StartAtUtc));
        Assert.All(slots, s => Assert.Equal(TimeSpan.FromMinutes(90), s.EndAtUtc - s.StartAtUtc));
    }

    [Fact]
    public void A_busy_coach_blocks_every_overlapping_slot_but_touching_edges_are_allowed()
    {
        var busy = new TimeWindow(Local(Monday, 7), Local(Monday, 8, 30));
        var slots = Compute([Room(1, "Studio A", 6, 12)], coachBusy: [busy]);
        var starts = slots.Select(s => s.StartAtUtc).ToList();

        Assert.DoesNotContain(Local(Monday, 6), starts);     // 06:00–07:30 chồng 30 phút
        Assert.DoesNotContain(Local(Monday, 6, 30), starts); // 06:30–08:00
        Assert.DoesNotContain(Local(Monday, 8), starts);     // 08:00–09:30
        Assert.Contains(Local(Monday, 8, 30), starts);       // bắt đầu đúng lúc Coach rảnh
    }

    [Fact]
    public void A_slot_that_ends_exactly_when_the_coach_becomes_busy_is_free()
    {
        var busy = new TimeWindow(Local(Monday, 9), Local(Monday, 10, 30));
        var starts = Compute([Room(1, "Studio A", 6, 12)], coachBusy: [busy]).Select(s => s.StartAtUtc).ToList();

        Assert.Contains(Local(Monday, 7, 30), starts);   // 07:30–09:00 chạm biên 09:00
        Assert.DoesNotContain(Local(Monday, 8), starts); // 08:00–09:30 chồng
        Assert.Contains(Local(Monday, 10, 30), starts);  // bắt đầu đúng lúc Coach rảnh
    }

    [Fact]
    public void A_slot_needs_at_least_one_free_room_and_lists_all_free_rooms_by_name()
    {
        var roomBusy = new TimeWindow(Local(Monday, 6), Local(Monday, 12));
        var slots = Compute([Room(2, "Zone B", 6, 9), Room(1, "Zone A", 6, 9, roomBusy)]);

        Assert.All(slots, s => Assert.Equal(["Zone B"], s.Rooms.Select(r => r.Name)));

        var both = Compute([Room(2, "Zone B", 6, 9), Room(1, "Zone A", 6, 9)]);
        Assert.All(both, s => Assert.Equal(["Zone A", "Zone B"], s.Rooms.Select(r => r.Name)));
    }

    [Fact]
    public void The_members_own_sessions_block_slots()
    {
        var own = new TimeWindow(Local(Monday, 6), Local(Monday, 7, 30));
        var starts = Compute([Room(1, "Studio A", 6, 12)], memberBusy: [own]).Select(s => s.StartAtUtc).ToList();

        Assert.DoesNotContain(Local(Monday, 6), starts);
        Assert.DoesNotContain(Local(Monday, 7), starts);
        Assert.Contains(Local(Monday, 7, 30), starts);
    }

    [Fact]
    public void Lead_time_and_membership_validity_limit_the_slots()
    {
        // 12 giờ báo trước: "bây giờ" = 06:00 địa phương → khung sớm nhất 18:00.
        var now = Local(Monday, 6);
        var slots = PtSlotCalculator.Compute(
            now, Monday, Monday, [Room(1, "Studio A", 6, 22)], [], [], ValidityStart, ValidityEnd);
        Assert.Equal(Local(Monday, 18), slots.First().StartAtUtc);

        // Hiệu lực kết thúc 20:00 → buổi 90 phút phải kết thúc trước đó.
        var capped = PtSlotCalculator.Compute(
            NowUtc, Monday, Monday, [Room(1, "Studio A", 6, 22)], [], [], ValidityStart, Local(Monday, 20));
        Assert.Equal(Local(Monday, 18, 30), capped.Last().StartAtUtc);
    }

    [Fact]
    public void A_day_without_opening_hours_has_no_slots()
    {
        var tuesday = Monday.AddDays(1);
        var slots = PtSlotCalculator.Compute(
            NowUtc, tuesday, tuesday, [Room(1, "Studio A", 6, 22)], [], [], ValidityStart, ValidityEnd);

        Assert.Empty(slots);
    }

    [Fact]
    public void Slots_beyond_the_advance_window_are_not_offered()
    {
        var far = NowUtc.AddDays(PtSessionRules.SelfBookMaxAdvanceDays + 5);
        var date = DateOnly.FromDateTime(VietnamTime.ToLocal(far));
        var room = new RoomAvailability(1, "A", Enumerable.Range(0, 7).Select(d => new RoomOpeningDay(d, new TimeOnly(6, 0), new TimeOnly(22, 0))).ToList(), []);

        Assert.Empty(PtSlotCalculator.Compute(NowUtc, date, date, [room], [], [], ValidityStart, ValidityEnd.AddYears(1)));
    }

    [Theory]
    [InlineData(6, 0, true)]
    [InlineData(6, 30, true)]
    [InlineData(6, 15, false)]
    public void ValidateStart_requires_the_30_minute_grid(int hour, int minute, bool valid)
    {
        var start = Local(Monday, hour, minute);
        if (valid) PtSlotCalculator.ValidateStart(NowUtc, start);
        else Assert.Equal("pt_start_not_aligned", Assert.Throws<BadRequestException>(() => PtSlotCalculator.ValidateStart(NowUtc, start)).ErrorCode);
    }

    [Fact]
    public void ValidateStart_rejects_too_soon_and_too_far()
    {
        Assert.Equal("pt_booking_too_soon",
            Assert.Throws<BadRequestException>(() => PtSlotCalculator.ValidateStart(NowUtc, NowUtc.AddHours(11).AddMinutes(30))).ErrorCode);
        Assert.Equal("pt_booking_too_far",
            Assert.Throws<BadRequestException>(() => PtSlotCalculator.ValidateStart(NowUtc, Local(DateOnly.FromDateTime(VietnamTime.ToLocal(NowUtc)).AddDays(40), 6))).ErrorCode);
    }

    [Fact]
    public void Configured_booking_window_controls_both_available_slots_and_submission()
    {
        var now = Local(Monday, 6);
        var room = Room(1, "Studio A", 6, 22);
        var slots = PtSlotCalculator.Compute(now, Monday, Monday, [room], [], [],
            ValidityStart, ValidityEnd, minLeadHours: 20, maxAdvanceDays: 1);
        Assert.Empty(slots);
        Assert.Equal("pt_booking_too_soon", Assert.Throws<BadRequestException>(() =>
            PtSlotCalculator.ValidateStart(now, Local(Monday, 18), minLeadHours: 20, maxAdvanceDays: 1)).ErrorCode);
        Assert.Equal("pt_booking_too_far", Assert.Throws<BadRequestException>(() =>
            PtSlotCalculator.ValidateStart(now, Local(Monday.AddDays(2), 6), minLeadHours: 1, maxAdvanceDays: 1)).ErrorCode);
    }
}
