using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.ComponentModel.DataAnnotations;
using System.Text.Json;
using SportHub.BuildingBlocks.Abstractions.Audit;
using SportHub.BuildingBlocks.Abstractions.Persistence;
using SportHub.BuildingBlocks.Api;
using SportHub.BuildingBlocks.SharedKernel.Errors;
using SportHub.BuildingBlocks.SharedKernel.Time;
using SportHub.Scheduling.Application.Commands;
using SportHub.Scheduling.Application.Interfaces;
using SportHub.Scheduling.Domain.Entities;

namespace SportHub.Scheduling.Api;

[ApiController]
[Route("api/gym-checkins")]
public class GymCheckInsController(IGymCheckInService gymCheckInService,
    ISportHubDbContext db, IAuditWriter audit, IClock clock) : ControllerBase
{
    [Authorize(Policy = GymCheckInPolicies.Create)]
    [HttpPost]
    public async Task<IActionResult> Create(
        [FromBody] CreateGymCheckInRequest request,
        CancellationToken cancellationToken)
    {
        // Người check-in lấy từ claim, không từ body — xem CreateGymCheckInRequest.
        var result = await gymCheckInService.CreateAsync(
            request.TargetMemberId!.Value,
            User.RequireUserId(),
            cancellationToken);

        return StatusCode(StatusCodes.Status201Created, result);
    }

    /// <summary>Lễ tân ghi giờ ra (giờ server). Idempotent: check-out lần hai trả bản ghi cũ, không ghi đè.</summary>
    [Authorize(Policy = GymCheckInPolicies.Create)]
    [HttpPost("{checkInId:guid}/checkout")]
    public async Task<IActionResult> CheckOut(Guid checkInId, CancellationToken cancellationToken)
        => Ok(await gymCheckInService.CheckOutAsync(checkInId, User.RequireUserId(), cancellationToken));

    /// <summary>Correct an open visit from a previous Vietnam calendar day using the actual departure time.</summary>
    [Authorize(Policy = SportHubPolicies.Receptionist)]
    [HttpPost("{checkInId:guid}/forgotten-checkout")]
    public async Task<IActionResult> ResolveForgotten(Guid checkInId,
        [FromBody] ResolveForgottenGymCheckout request, CancellationToken ct)
    {
        var reason = request.Reason?.Trim();
        if (reason?.Length is not >= 3 or > 500)
            throw new BadRequestException("gym_checkout_reason_required", "A reason of 3 to 500 characters is required.");
        var now = clock.UtcNow;
        var departure = request.DepartedAtUtc.UtcDateTime;
        var todayStart = VietnamTime.StartOfDayUtc(DateOnly.FromDateTime(VietnamTime.ToLocal(now)));
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        var rows = await db.Set<GymCheckIn>().FromSqlInterpolated(
            $"SELECT * FROM gym_checkins WHERE check_in_id = {checkInId} FOR UPDATE").ToListAsync(ct);
        var visit = rows.SingleOrDefault()
            ?? throw new NotFoundException("gym_checkin_not_found", "Gym check-in not found.");
        if (visit.CheckOutTime is not null)
            throw new ConflictException("gym_already_checked_out", "This visit is already checked out.");
        if (visit.CheckInTime >= todayStart)
            throw new ConflictException("gym_checkout_not_stale", "This visit is from today; use regular check-out.");
        if (departure <= visit.CheckInTime || departure > now)
            throw new BadRequestException("gym_departure_invalid", "Departure must be after check-in and no later than now.");
        visit.CheckOutTime = departure;
        visit.CheckedOutByUserId = User.RequireUserId();
        audit.Write(new AuditEntry(User.RequireUserId(), "RESOLVE_FORGOTTEN_GYM_CHECKOUT", nameof(GymCheckIn),
            checkInId.ToString(), NewValue: JsonSerializer.Serialize(departure), Reason: reason));
        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);
        return Ok(new { visit.CheckInId, visit.MemberId, visit.CheckInTime,
            visit.CheckOutTime, visit.CheckedOutByUserId });
    }
}

public sealed class ResolveForgottenGymCheckout
{
    [Required] public DateTimeOffset DepartedAtUtc { get; set; }
    [Required, MinLength(3), MaxLength(500)] public string Reason { get; set; } = string.Empty;
}
