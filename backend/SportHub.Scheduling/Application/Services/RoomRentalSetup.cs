using System.Globalization;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using SportHub.BuildingBlocks.Abstractions.Audit;
using SportHub.BuildingBlocks.Abstractions.Scheduling;
using SportHub.BuildingBlocks.SharedKernel.Errors;
using SportHub.Scheduling.Application.Commands;
using SportHub.Scheduling.Application.DTOs;
using SportHub.Scheduling.Catalog.Domain;

namespace SportHub.Scheduling.Application.Services;

public sealed partial class RoomService
{
    private static readonly string[] RentalDays = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

    public async Task<RoomResponse> CreateRentalAsync(CreateRentalCourtRequest request, Guid actorUserId, CancellationToken ct = default)
    {
        var name = request.Name.Trim();
        if (name.Length is < 1 or > 100 || request.Capacity is < 1 or > 500
            || request.Hours.Count is < 1 or > 7 || request.Rates.Count is < 1 or > 49)
            throw new BadRequestException("invalid_rental_setup", "Enter a court name, capacity, opening hours and prices.");

        // Shared with price edits: setup, catalog changes and duplicate submissions serialize.
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        await db.Database.ExecuteSqlRawAsync("SELECT pg_advisory_xact_lock(877459021)", ct);
        await db.Database.ExecuteSqlInterpolatedAsync(
            $"SELECT room_type_id FROM room_types WHERE room_type_id = {request.RoomTypeId} FOR UPDATE", ct);
        await db.Database.ExecuteSqlInterpolatedAsync(
            $"SELECT sport_id FROM sports WHERE sport_id = {request.SportId} FOR UPDATE", ct);
        if (await db.Set<Room>().AnyAsync(r => r.Name == name, ct))
            throw new ConflictException("room_name_taken", "This court name is already used. Choose another name.");
        if (!await db.Set<RoomType>().AnyAsync(t => t.RoomTypeId == request.RoomTypeId && t.IsActive, ct)
            || !await db.Set<Sport>().AnyAsync(s => s.SportId == request.SportId && s.IsActive, ct)
            || !await db.Set<SportRoomType>().AnyAsync(l => l.RoomTypeId == request.RoomTypeId && l.SportId == request.SportId, ct))
            throw new BadRequestException("sport_not_compatible", "Choose an active sport and a compatible active room type.");

        var hours = request.Hours.Select(h => new RoomOpeningHour
        {
            DayOfWeek = h.DayOfWeek, OpenTimeLocal = SetupTime(h.OpenTimeLocal), CloseTimeLocal = SetupTime(h.CloseTimeLocal)
        }).ToList();
        if (hours.Any(h => h.DayOfWeek is < 0 or > 6 || h.CloseTimeLocal <= h.OpenTimeLocal
                || h.OpenTimeLocal.Minute != 0 || h.CloseTimeLocal.Minute != 0
                || h.CloseTimeLocal - h.OpenTimeLocal < TimeSpan.FromHours(1))
            || hours.Select(h => h.DayOfWeek).Distinct().Count() != hours.Count)
            throw new BadRequestException("invalid_opening_hours", "Use whole-hour opening times with at least one hour per day.");

        var rates = request.Rates.Select(r => new CourtRate
        {
            RoomTypeId = request.RoomTypeId, SportId = request.SportId, IsActive = true,
            DaysOfWeek = string.Join(",", r.DaysOfWeek.Select(d => d.Trim().ToUpperInvariant()).Distinct()),
            StartTimeLocal = SetupTime(r.StartTimeLocal), EndTimeLocal = SetupTime(r.EndTimeLocal), PricePerHour = r.PricePerHour
        }).ToList();
        foreach (var rate in rates)
        {
            if (rate.PricePerHour <= 0 || rate.PricePerHour % 2000 != 0)
                throw new BadRequestException("invalid_price", "Enter a positive hourly price in steps of 2,000 VND so 30-minute slots can be paid.");
            var days = rate.DaysOfWeek.Split(',');
            if (days.Any(d => !RentalDays.Contains(d)) || rate.EndTimeLocal <= rate.StartTimeLocal
                || rate.StartTimeLocal.Minute != 0 || rate.EndTimeLocal.Minute != 0)
                throw new BadRequestException("invalid_rate_window", "Choose valid days and whole-hour price windows.");
            if (rates.Any(other => other != rate && other.StartTimeLocal < rate.EndTimeLocal && other.EndTimeLocal > rate.StartTimeLocal
                && other.DaysOfWeek.Split(',').Intersect(days).Any()))
                throw new ConflictException("court_rate_overlap", "Price windows overlap. Use one price for each time window.");
            if (days.Any(day => !hours.Any(h => RentalDays[h.DayOfWeek] == day
                    && h.OpenTimeLocal <= rate.StartTimeLocal && h.CloseTimeLocal >= rate.EndTimeLocal)))
                throw new BadRequestException("invalid_rate_window", "Each price window must be inside the court's opening hours.");
        }
        // Check every half-hour, covering either supported rental slot policy with no price gaps.
        foreach (var h in hours)
            for (var minute = h.OpenTimeLocal.Hour * 60; minute < h.CloseTimeLocal.Hour * 60; minute += 30)
                if (!rates.Any(r => r.DaysOfWeek.Split(',').Contains(RentalDays[h.DayOfWeek])
                    && r.StartTimeLocal <= TimeOnly.MinValue.AddMinutes(minute)
                    && r.EndTimeLocal >= TimeOnly.MinValue.AddMinutes(minute + 30)))
                    throw new BadRequestException("rental_rate_unavailable", "Add prices covering every opening hour before opening this court.");

        // Store one price window with its applicable days, rather than one copy per weekday.
        rates = rates.GroupBy(r => new { r.StartTimeLocal, r.EndTimeLocal, r.PricePerHour })
            .Select(group =>
            {
                var rate = group.First();
                var days = group.SelectMany(r => r.DaysOfWeek.Split(',')).ToHashSet();
                rate.DaysOfWeek = string.Join(",", RentalDays.Skip(1).Append(RentalDays[0]).Where(days.Contains));
                return rate;
            }).ToList();

        var room = new Room { Name = name, Capacity = request.Capacity, RoomTypeId = request.RoomTypeId, IsActive = true };
        db.Set<Room>().Add(room);
        await db.SaveChangesAsync(ct);
        foreach (var h in hours) h.RoomId = room.RoomId;
        foreach (var r in rates) r.RoomId = room.RoomId;
        db.Set<RoomOpeningHour>().AddRange(hours);
        db.Set<CourtRate>().AddRange(rates);
        var offering = await db.Set<SportServiceOffering>().SingleOrDefaultAsync(
            s => s.SportId == request.SportId && s.ServiceType == SportServiceType.CourtRental, ct);
        var enabledRental = offering is null || !offering.IsEnabled;
        if (offering is null)
            db.Set<SportServiceOffering>().Add(new() { SportId = request.SportId, ServiceType = SportServiceType.CourtRental, IsEnabled = true });
        else offering.IsEnabled = true;
        await db.SaveChangesAsync(ct);
        audit.Write(new AuditEntry(actorUserId, "CREATE_ROOM", nameof(Room), room.RoomId.ToString(), NewValue: Describe(room)));
        audit.Write(new AuditEntry(actorUserId, "SET_ROOM_OPENING_HOURS", nameof(Room), room.RoomId.ToString(),
            NewValue: JsonSerializer.Serialize(new { name, hours = request.Hours })));
        foreach (var rate in rates)
            audit.Write(new AuditEntry(actorUserId, "CREATE_COURT_RATE", nameof(CourtRate), rate.RateId.ToString(),
                NewValue: JsonSerializer.Serialize(new { roomId = room.RoomId, roomName = name, roomTypeId = rate.RoomTypeId,
                    sportId = rate.SportId, days = rate.DaysOfWeek, startTimeLocal = rate.StartTimeLocal.ToString("HH:mm"),
                    endTimeLocal = rate.EndTimeLocal.ToString("HH:mm"), price = rate.PricePerHour, active = true })));
        if (enabledRental)
            audit.Write(new AuditEntry(actorUserId, "ENABLE_COURT_RENTAL", nameof(Sport), request.SportId.ToString()));
        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);
        return await GetOneAsync(room.RoomId, ct);
    }

    private static TimeOnly SetupTime(string value)
        => TimeOnly.TryParseExact(value, "HH:mm", CultureInfo.InvariantCulture, DateTimeStyles.None, out var time)
            ? time : throw new BadRequestException("invalid_time", "Use HH:mm for opening hours and price windows.");
}
