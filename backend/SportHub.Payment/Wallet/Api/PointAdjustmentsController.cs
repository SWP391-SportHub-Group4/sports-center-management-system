using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SportHub.BuildingBlocks.Api;
using SportHub.Payment.Wallet.Application;
using SportHub.BuildingBlocks.Abstractions.Wallet;

namespace SportHub.Payment.Wallet.Api;

[ApiController]
[Authorize(Policy = SportHubPolicies.CenterManager)]
[Route("api/wallets/{ownerId:guid}/adjustments")]
public sealed class PointAdjustmentsController(PointAdjustmentService adjustments) : ControllerBase
{
    [HttpPost]
    public async Task<IActionResult> Adjust(Guid ownerId, AdjustPointsRequest request, CancellationToken ct)
    {
        var actorId = Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
        if (request.Direction == WalletAdjustmentDirection.Credit)
            return Accepted(await adjustments.RequestCreditAsync(ownerId, request, actorId, ct));
        return Ok(await adjustments.AdjustDebitAsync(ownerId, request, actorId, ct));
    }
}
