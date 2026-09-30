using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SportHub.BuildingBlocks.Api;
using SportHub.Payment.Wallet.Application;

namespace SportHub.Payment.Wallet.Api;

[ApiController]
[Authorize(Policy = SportHubPolicies.CenterManager)]
[Route("api/wallets/{ownerId:guid}/adjustments")]
public sealed class PointAdjustmentsController(PointAdjustmentService adjustments) : ControllerBase
{
    [HttpPost]
    public async Task<IActionResult> Adjust(Guid ownerId, AdjustPointsRequest request, CancellationToken ct)
        => Ok(await adjustments.AdjustAsync(ownerId, request, Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!), ct));
}
