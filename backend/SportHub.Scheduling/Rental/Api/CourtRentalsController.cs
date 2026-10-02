using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SportHub.BuildingBlocks.Api;
using SportHub.BuildingBlocks.Abstractions.Identity;
using SportHub.BuildingBlocks.Abstractions.Scheduling;
using SportHub.BuildingBlocks.SharedKernel.Errors;
using SportHub.Scheduling.Occupancy.Application;
using SportHub.Scheduling.Rental.Application;

namespace SportHub.Scheduling.Rental.Api;

[ApiController]
public sealed class CourtRentalsController(CourtRentalOperationsService operations,
    CourtRentalService rentals, AvailabilityService availability) : ControllerBase
{
    [Authorize(Policy = SportHubPolicies.CourtRental), HttpGet("api/court-rentals/policy")]
    public async Task<IActionResult> Policy(CancellationToken ct) => Ok(await operations.PolicyAsync(ct));

    [Authorize(Policy = SportHubPolicies.CourtRental), HttpGet("api/court-rentals/{rentalId:guid}")]
    public async Task<IActionResult> Detail(Guid rentalId, CancellationToken ct)
        => Ok(await operations.GetMineAsync(rentalId, User.RequireUserId(), ct));

    [Authorize(Policy = SportHubPolicies.CourtRental)]
    [HttpGet("api/court-rentals/mine")]
    public async Task<IActionResult> Mine([FromQuery] DateTime fromUtc, [FromQuery] DateTime toUtc, CancellationToken ct)
        => Ok(await operations.MineAsync(User.RequireUserId(), fromUtc, toUtc, ct));

    [Authorize(Policy = SportHubPolicies.CourtRental)]
    [HttpGet("api/court-rentals/availability")]
    public async Task<IActionResult> Availability([FromQuery] int sportId, [FromQuery] DateTime startUtc,
        [FromQuery] DateTime endUtc, CancellationToken ct)
    {
        var start = DateTime.SpecifyKind(startUtc, DateTimeKind.Utc);
        var end = DateTime.SpecifyKind(endUtc, DateTimeKind.Utc);
        var free = await availability.FreeRoomsAsync(sportId, start, end, ct);
        var coachId = User.RequireUserId();
        var options = new List<CourtRentalAvailabilityOption>();
        foreach (var room in free)
        {
            try
            {
                var quote = await rentals.QuoteAsync(new CourtRentalRequest(coachId, sportId, room.RoomId,
                    new DateTimeOffset(start, TimeSpan.Zero), new DateTimeOffset(end, TimeSpan.Zero), 1), ct);
                options.Add(new CourtRentalAvailabilityOption(room.RoomId, room.Name, room.Capacity,
                    quote.TotalPrice, quote.Blocks));
            }
            catch (ConflictException) { }
        }
        return Ok(options);
    }

    [Authorize(Policy = SportHubPolicies.CourtRental)]
    [HttpPost("api/court-rentals/{rentalId:guid}/cancel")]
    public async Task<IActionResult> Cancel(Guid rentalId, CancellationToken ct)
    {
        await operations.CancelByOwnerAsync(rentalId, User.RequireUserId(), ct);
        return NoContent();
    }

    [Authorize(Policy = SportHubPolicies.FrontDesk)]
    [HttpGet("api/manager/court-schedule/rentals")]
    public async Task<IActionResult> StaffSchedule([FromQuery] int? roomId, [FromQuery] DateTime fromUtc,
        [FromQuery] DateTime toUtc, CancellationToken ct)
        => Ok(await operations.StaffScheduleAsync(roomId, fromUtc, toUtc, ct));

    [Authorize(Policy = SportHubPolicies.CenterManager)]
    [HttpPost("api/manager/court-rentals/{rentalId:guid}/cancel")]
    public async Task<IActionResult> CancelByCenter(Guid rentalId, [FromBody] CancelCourtRentalRequest request, CancellationToken ct)
    {
        await operations.CancelByCenterAsync(rentalId, User.RequireUserId(), request.Reason, ct);
        return NoContent();
    }
}

public sealed record CourtRentalAvailabilityOption(int RoomId, string Name, int Capacity, decimal TotalPrice,
    IReadOnlyList<CourtRentalBlockPrice> Blocks);
public sealed record CancelCourtRentalRequest(string Reason);
