using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SportHub.API.Persistence;
using SportHub.BuildingBlocks.Api;
using SportHub.Identity.Domain.Entities;
using SportHub.Payment.Domain.Enums;
using SportHub.Scheduling.Domain.Entities;

namespace SportHub.API.Controllers;

/// <summary>Read-only composition of inbox counts; each module still owns its mutations.</summary>
[ApiController, Authorize(Policy = SportHubPolicies.CenterManager)]
public sealed class ManagerRequestSummaryController(SportHubDbContext db) : ControllerBase
{
    [HttpGet("api/manager/requests/summary")]
    public async Task<IActionResult> Get(CancellationToken ct)
    {
        var coach = await db.Set<ClassSessionChangeRequest>().CountAsync(r => r.Status == "PENDING", ct);
        var refunds = await db.PaymentAdjustments.CountAsync(r => r.Type == PaymentAdjustmentType.Refund && r.Status == PaymentAdjustmentStatus.Requested, ct);
        var support = await db.MemberSupportRequests.CountAsync(r => r.Status != "CLOSED", ct);
        var avatar = await db.Set<AvatarReport>().CountAsync(r => r.Status == "OPEN", ct);
        return Ok(new { coach, refunds, support, avatar });
    }
}
