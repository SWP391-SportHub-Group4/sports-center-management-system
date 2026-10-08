using SportHub.BuildingBlocks.Abstractions.Scheduling;
using SportHub.BuildingBlocks.SharedKernel.Errors;
using SportHub.BuildingBlocks.SharedKernel.Time;

namespace SportHub.Training.Domain.Rules;

public sealed record PtSlotRoom(int RoomId, string Name);

public sealed record PtSlot(DateTime StartAtUtc, DateTime EndAtUtc, IReadOnlyList<PtSlotRoom> Rooms);

/// <summary>
/// Tính khung PT còn trống, thuần tính toán (không DB) nên test được độc lập. Một khung 90 phút hợp lệ khi:
/// bắt đầu trên lưới 30 phút giờ địa phương; nằm trong giờ mở cửa của ít nhất một phòng PT còn trống;
/// Coach và Member đều không bận; trong hiệu lực của gói; cách hiện tại đủ thời gian báo trước và không quá xa.
/// </summary>
public static class PtSlotCalculator
{
    public static IReadOnlyList<PtSlot> Compute(
        DateTime nowUtc,
        DateOnly fromDate,
        DateOnly toDate,
        IReadOnlyList<RoomAvailability> rooms,
        IReadOnlyList<TimeWindow> coachBusy,
        IReadOnlyList<TimeWindow> memberBusy,
        DateTime validityStartUtc,
        DateTime validityEndUtc)
    {
        var earliest = nowUtc.AddHours(PtSessionRules.SelfBookMinLeadHours);
        var latest = nowUtc.AddDays(PtSessionRules.SelfBookMaxAdvanceDays);
        var slots = new List<PtSlot>();

        for (var date = fromDate; date <= toDate; date = date.AddDays(1))
        {
            var dayStartUtc = VietnamTime.StartOfDayUtc(date);
            var dayOfWeek = (int)date.DayOfWeek;
            var starts = new SortedSet<int>();

            foreach (var room in rooms)
            {
                var hours = room.OpeningHours.FirstOrDefault(h => h.DayOfWeek == dayOfWeek);

                if (hours is null)
                {
                    continue;
                }

                var open = hours.Open.Hour * 60 + hours.Open.Minute;
                var close = hours.Close.Hour * 60 + hours.Close.Minute;
                var first = (int)Math.Ceiling(open / (double)PtSessionRules.SlotStepMinutes) * PtSessionRules.SlotStepMinutes;

                for (var minute = first; minute + PtSessionRules.SessionDurationMinutes <= close; minute += PtSessionRules.SlotStepMinutes)
                {
                    starts.Add(minute);
                }
            }

            foreach (var minute in starts)
            {
                var start = dayStartUtc.AddMinutes(minute);
                var end = PtSessionRules.EndAtUtc(start);

                if (start < earliest || start > latest || start < validityStartUtc || end > validityEndUtc)
                {
                    continue;
                }

                if (IsBusy(coachBusy, start, end) || IsBusy(memberBusy, start, end))
                {
                    continue;
                }

                var free = FreeRooms(rooms, start, end);

                if (free.Count > 0)
                {
                    slots.Add(new PtSlot(start, end, free));
                }
            }
        }

        return slots;
    }

    /// <summary>Phòng mở cửa trọn khoảng (cùng ngày địa phương) và không bị chiếm, sắp theo tên.</summary>
    public static IReadOnlyList<PtSlotRoom> FreeRooms(IReadOnlyList<RoomAvailability> rooms, DateTime startUtc, DateTime endUtc)
    {
        var localStart = VietnamTime.ToLocal(startUtc);
        var localEnd = VietnamTime.ToLocal(endUtc);

        if (localStart.Date != localEnd.Date)
        {
            return [];
        }

        var dayOfWeek = (int)localStart.DayOfWeek;
        var startTime = TimeOnly.FromDateTime(localStart);
        var endTime = TimeOnly.FromDateTime(localEnd);

        return rooms
            .Where(room => room.OpeningHours.Any(h => h.DayOfWeek == dayOfWeek && startTime >= h.Open && endTime <= h.Close)
                           && !IsBusy(room.Busy, startUtc, endUtc))
            .OrderBy(room => room.Name, StringComparer.OrdinalIgnoreCase)
            .Select(room => new PtSlotRoom(room.RoomId, room.Name))
            .ToList();
    }

    /// <summary>Kiểm tra giờ bắt đầu do Member gửi lên; ném lỗi 400 có mã ổn định để giao diện giải thích.</summary>
    public static void ValidateStart(DateTime nowUtc, DateTime startAtUtc)
    {
        var local = VietnamTime.ToLocal(startAtUtc);

        if (local.Second != 0 || local.Millisecond != 0 || local.Minute % PtSessionRules.SlotStepMinutes != 0)
        {
            throw new BadRequestException(
                "pt_start_not_aligned",
                $"Giờ bắt đầu phải rơi vào bội số {PtSessionRules.SlotStepMinutes} phút (giờ Việt Nam).");
        }

        if (startAtUtc < nowUtc.AddHours(PtSessionRules.SelfBookMinLeadHours))
        {
            throw new BadRequestException(
                "pt_booking_too_soon",
                $"Cần đặt trước ít nhất {PtSessionRules.SelfBookMinLeadHours} giờ. Liên hệ lễ tân nếu cần gấp.");
        }

        if (startAtUtc > nowUtc.AddDays(PtSessionRules.SelfBookMaxAdvanceDays))
        {
            throw new BadRequestException(
                "pt_booking_too_far", $"Chỉ đặt trước tối đa {PtSessionRules.SelfBookMaxAdvanceDays} ngày.");
        }
    }

    private static bool IsBusy(IReadOnlyList<TimeWindow> busy, DateTime start, DateTime end)
        => busy.Any(b => PtSessionRules.Overlaps(start, end, b.StartUtc, b.EndUtc));
}
