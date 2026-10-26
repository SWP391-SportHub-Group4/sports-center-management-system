using SportHub.BuildingBlocks.Abstractions.Configuration;
using SportHub.BuildingBlocks.SharedKernel.Errors;
using SportHub.Scheduling.Application.Commands;
using SportHub.Scheduling.Catalog.Domain;

namespace SportHub.Scheduling.Application.Services;

public sealed partial class RoomService
{
    private async Task<List<RoomOpeningHour>> CreationOpeningHoursAsync(SaveRoomRequest request, CancellationToken ct)
    {
        var center = await CenterOperatingHours.ReadAsync(settings, ct);
        if (request.AllowRental != true)
            return Enumerable.Range(0, 7).Select(day => new RoomOpeningHour {
                DayOfWeek = day, OpenTimeLocal = SetupTime(center.Opens), CloseTimeLocal = SetupTime(center.Closes)
            }).ToList();

        var setup = request.RentalSetup;
        if (setup is null || setup.Hours is null || setup.Hours.Count is < 1 or > 7)
            throw new BadRequestException("invalid_rental_setup", "Choose at least one rental day and enter an hourly price.");
        if (setup.PricePerHour < 2000 || setup.PricePerHour % 2000 != 0)
            throw new BadRequestException("invalid_price", "Enter a positive hourly price in steps of 2,000 VND.");
        var hours = setup.Hours.Select(h => new RoomOpeningHour {
            DayOfWeek = h.DayOfWeek, OpenTimeLocal = SetupTime(h.OpenTimeLocal), CloseTimeLocal = SetupTime(h.CloseTimeLocal)
        }).ToList();
        if (hours.Any(h => h.DayOfWeek is < 0 or > 6 || h.CloseTimeLocal <= h.OpenTimeLocal
                || h.OpenTimeLocal.Minute != 0 || h.CloseTimeLocal.Minute != 0
                || h.CloseTimeLocal - h.OpenTimeLocal < TimeSpan.FromHours(1))
            || hours.Select(h => h.DayOfWeek).Distinct().Count() != hours.Count)
            throw new BadRequestException("invalid_opening_hours", "Choose distinct weekdays and whole-hour opening times with at least one hour per day.");
        foreach (var hour in hours) center.EnsureRange(hour.OpenTimeLocal, hour.CloseTimeLocal);
        return hours;
    }

    private List<CourtRate> AddCreationRentalRates(Room room, SaveRoomRequest request, List<RoomOpeningHour> hours)
    {
        if (!room.AllowRental) return [];
        var rates = hours.GroupBy(h => new { h.OpenTimeLocal, h.CloseTimeLocal }).Select(group => new CourtRate {
            RoomId = room.RoomId, RoomTypeId = room.RoomTypeId!.Value, SportId = null, IsActive = true,
            DaysOfWeek = string.Join(",", group.Select(h => RentalDays[h.DayOfWeek])),
            StartTimeLocal = group.Key.OpenTimeLocal, EndTimeLocal = group.Key.CloseTimeLocal,
            PricePerHour = request.RentalSetup!.PricePerHour
        }).ToList();
        db.Set<CourtRate>().AddRange(rates);
        return rates;
    }
}
