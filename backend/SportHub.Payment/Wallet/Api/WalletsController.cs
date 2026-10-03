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
    [HttpGet("manager/wallets/{ownerId:guid}")]
    [Authorize(Policy = SportHubPolicies.CenterManager)]
    public async Task<IActionResult> Owner(Guid ownerId, CancellationToken ct)
        => Ok(await query.BalanceAsync(ownerId, Actor(), ct, manager: true));

    [HttpGet("manager/wallets/{ownerId:guid}/ledger")]
    [Authorize(Policy = SportHubPolicies.CenterManager)]
    public async Task<IActionResult> OwnerLedger(Guid ownerId, CancellationToken ct, int page = 1, int pageSize = 20, string? entryType = null)
        => Ok(await query.LedgerAsync(ownerId, Actor(), page, pageSize, ct, entryType, manager: true));

    [HttpGet("wallet/me")]
    [Authorize(Policy = SportHubPolicies.WalletOwner)]
    public async Task<IActionResult> Mine(CancellationToken ct) => Ok(await query.BalanceAsync(Actor(), null, ct));

    [HttpGet("wallet/me/ledger")]
    [Authorize(Policy = SportHubPolicies.WalletOwner)]
    public async Task<IActionResult> MyLedger(CancellationToken ct, int page = 1, int pageSize = 20, string? entryType = null)
        => Ok(await query.LedgerAsync(Actor(), null, page, pageSize, ct, entryType));

    [HttpGet("members/{memberId:guid}/points")]
    [Authorize(Roles = SportHubRoleNames.Receptionist + "," + SportHubRoleNames.CenterManager)]
    public async Task<IActionResult> Member(Guid memberId, CancellationToken ct)
        => Ok(await query.BalanceAsync(memberId, Actor(), ct));

    [HttpGet("members/{memberId:guid}/points/ledger")]
    [Authorize(Roles = SportHubRoleNames.Receptionist + "," + SportHubRoleNames.CenterManager)]
    public async Task<IActionResult> MemberLedger(Guid memberId, CancellationToken ct, int page = 1, int pageSize = 20, string? entryType = null)
        => Ok(await query.LedgerAsync(memberId, Actor(), page, pageSize, ct, entryType));

    private Guid Actor() => Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
}
