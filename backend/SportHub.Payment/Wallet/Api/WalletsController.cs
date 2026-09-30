using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SportHub.BuildingBlocks.Api;
using SportHub.Payment.Wallet.Application;

namespace SportHub.Payment.Wallet.Api;

[ApiController]
[Authorize]
[Route("api")]
public sealed class WalletsController(WalletQueryService query) : ControllerBase
{
    [HttpGet("wallet/me")]
    [Authorize(Policy = SportHubPolicies.WalletOwner)]
    public async Task<IActionResult> Mine(CancellationToken ct) => Ok(await query.BalanceAsync(Actor(), null, ct));

    [HttpGet("wallet/me/ledger")]
    [Authorize(Policy = SportHubPolicies.WalletOwner)]
    public async Task<IActionResult> MyLedger(CancellationToken ct, int page = 1, int pageSize = 20)
        => Ok(await query.LedgerAsync(Actor(), null, page, pageSize, ct));

    [HttpGet("members/{memberId:guid}/points")]
    [Authorize(Roles = SportHubRoleNames.Receptionist + "," + SportHubRoleNames.CenterManager)]
    public async Task<IActionResult> Member(Guid memberId, CancellationToken ct)
        => Ok(await query.BalanceAsync(memberId, Actor(), ct));

    [HttpGet("members/{memberId:guid}/points/ledger")]
    [Authorize(Roles = SportHubRoleNames.Receptionist + "," + SportHubRoleNames.CenterManager)]
    public async Task<IActionResult> MemberLedger(Guid memberId, CancellationToken ct, int page = 1, int pageSize = 20)
        => Ok(await query.LedgerAsync(memberId, Actor(), page, pageSize, ct));

    private Guid Actor() => Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
}
