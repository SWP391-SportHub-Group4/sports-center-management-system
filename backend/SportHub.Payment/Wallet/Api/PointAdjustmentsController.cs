using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SportHub.BuildingBlocks.Api;
using SportHub.Payment.Wallet.Application;

namespace SportHub.Payment.Wallet.Api;

[ApiController]
[Authorize(Policy = SportHubPolicies.CenterManager)]
[Route("api/wallets/{ownerId:guid}/adjustments")]
public sealed class PointAdjustmentsController : ControllerBase
{
    [HttpPost]
    public IActionResult Adjust(Guid ownerId, AdjustPointsRequest request)
        => Forbid();
}
