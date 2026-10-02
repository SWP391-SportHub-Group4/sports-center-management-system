using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using SportHub.BuildingBlocks.Api;
using SportHub.Payment.Wallet.Application;

namespace SportHub.Payment.Wallet.Api;

[ApiController]
[Authorize]
[Route("api")]
public sealed class PointConfirmationsController(PointConfirmationService confirmations) : ControllerBase
{
    [HttpPost("invoices/{invoiceId:guid}/point-confirmations")]
    [Authorize(Policy = SportHubPolicies.Receptionist)]
    [EnableRateLimiting("point-confirmation")]
    public async Task<IActionResult> RequestCode(Guid invoiceId, RequestPointConfirmationRequest request, CancellationToken ct)
        => Ok(await confirmations.RequestAsync(invoiceId, request.MemberId, request.Points, request.Revision, User.RequireUserId(), ct));

    [HttpGet("invoices/{invoiceId:guid}/point-selection")]
    public async Task<IActionResult> GetSelection(Guid invoiceId, CancellationToken ct)
        => Ok(await confirmations.GetSelectionAsync(invoiceId, User.RequireUserId(), ct));

    [HttpGet("invoices/{invoiceId:guid}/point-confirmations/current")]
    [Authorize(Policy = SportHubPolicies.Receptionist)]
    public async Task<IActionResult> Current(Guid invoiceId, CancellationToken ct)
        => Ok(await confirmations.GetCounterStatusAsync(invoiceId, User.RequireUserId(), ct));

    [HttpPost("invoices/{invoiceId:guid}/point-confirmations/clear")]
    [Authorize(Policy = SportHubPolicies.Receptionist)]
    public async Task<IActionResult> Clear(Guid invoiceId, ClearCounterPointsRequest request, CancellationToken ct)
        => Ok(await confirmations.ClearCounterAsync(invoiceId, request.MemberId, request.Revision, User.RequireUserId(), ct));

    [HttpPost("point-confirmations/{confirmationId:guid}/verify")]
    [Authorize(Policy = SportHubPolicies.Receptionist)]
    public async Task<IActionResult> Verify(Guid confirmationId, VerifyPointConfirmationRequest request, CancellationToken ct)
        => Ok(await confirmations.VerifyAsync(confirmationId, request.Code, User.RequireUserId(), ct));

    [HttpPost("wallet/me/checkouts/{invoiceId:guid}/points")]
    [Authorize(Policy = SportHubPolicies.WalletOwner)]
    public async Task<IActionResult> SelectSelf(Guid invoiceId, SelectSelfPointsRequest request, CancellationToken ct)
        => Ok(await confirmations.SelectSelfAsync(invoiceId, request.Points, User.RequireUserId(), ct));
}
