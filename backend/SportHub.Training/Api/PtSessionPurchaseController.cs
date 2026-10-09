using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SportHub.BuildingBlocks.Abstractions.Membership;
using SportHub.BuildingBlocks.Api;
using SportHub.BuildingBlocks.SharedKernel.Time;
using SportHub.Training.Application.Services;

namespace SportHub.Training.Api;

[ApiController, Authorize(Policy = SportHubPolicies.Member)]
public sealed class PtSessionPurchaseController(PtSessionService sessions, IMembershipAccessReader memberships) : ControllerBase
{
    [HttpGet("api/members/me/pt-session-availability")]
    public async Task<IActionResult> Availability(Guid memberPackageId, Guid coachId,
        DateOnly fromDate, DateOnly toDate, CancellationToken ct)
        => Ok(await sessions.GetPurchaseAvailabilityAsync(User.RequireUserId(), memberPackageId, coachId,
            fromDate, toDate, memberships, ct));
}
