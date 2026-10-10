using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SportHub.Administration.Application.Services;
using SportHub.BuildingBlocks.Api;

namespace SportHub.Administration.Api;

[ApiController]
[Authorize]
[Route("api/member-codes")]
public sealed class MemberCodesController(MemberCodeService codes) : ControllerBase
{
    [Authorize(Policy = SportHubPolicies.Member)]
    [HttpGet("me")]
    public async Task<IActionResult> Mine(CancellationToken ct)
        => Ok(await codes.IssueAsync(User.RequireUserId(), ct));

    [Authorize(Policy = SportHubPolicies.FrontDesk)]
    [HttpPost("lookup")]
    public async Task<IActionResult> Lookup(MemberCodeLookupRequest request, CancellationToken ct)
        => Ok(await codes.LookupAsync(request.Code, ct));
}

public sealed record MemberCodeLookupRequest(string Code);
