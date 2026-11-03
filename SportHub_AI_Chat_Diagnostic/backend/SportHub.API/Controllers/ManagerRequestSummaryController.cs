using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SportHub.API.Persistence;
using SportHub.BuildingBlocks.Api;
using SportHub.Identity.Domain.Entities;
using SportHub.Payment.Domain.Enums;
using SportHub.Scheduling.Domain.Entities;

namespace SportHub.API.Controllers;

/// <summary>Composed request counts and per-Manager read receipts. Business mutations stay in their modules.</summary>
[ApiController, Authorize(Policy = SportHubPolicies.CenterManager)]
public sealed class ManagerRequestSummaryController(SportHubDbContext db) : ControllerBase
{
    [HttpGet("api/manager/requests/summary")]
    public async Task<IActionResult> Get(CancellationToken ct)
    {
        var managerId = User.RequireUserId();
        var reads = db.Set<ManagerRequestReadReceipt>().Where(r => r.ManagerId == managerId);
        var coach = await db.Set<ClassSessionChangeRequest>().CountAsync(r => r.Status == "PENDING", ct);
        var refunds = await db.PaymentAdjustments.CountAsync(r => r.Type == PaymentAdjustmentType.Refund && r.Status == PaymentAdjustmentStatus.Requested, ct);
        var support = await db.MemberSupportRequests.CountAsync(r => r.Status != "CLOSED" && r.Status != "DONE" && r.Status != "REJECTED", ct);
        var unreadCoach = await db.Set<ClassSessionChangeRequest>().CountAsync(r => r.Status == "PENDING"
            && !reads.Any(read => read.RequestType == "coach" && read.RequestId == r.RequestId), ct);
        var unreadRefunds = await db.PaymentAdjustments.CountAsync(r => r.Type == PaymentAdjustmentType.Refund && r.Status == PaymentAdjustmentStatus.Requested
            && !reads.Any(read => read.RequestType == "refunds" && read.RequestId == r.AdjustmentId), ct);
        var unreadSupport = await db.MemberSupportRequests.CountAsync(r => r.Status != "CLOSED" && r.Status != "DONE" && r.Status != "REJECTED"
            && !reads.Any(read => read.RequestType == "support" && read.RequestId == r.RequestId), ct);
        return Ok(new { coach, refunds, support, unread = unreadCoach + unreadRefunds + unreadSupport });
    }

    [HttpPost("api/manager/requests/{type}/{id:guid}/read")]
    public async Task<IActionResult> Read(string type, Guid id, CancellationToken ct)
    {
        var exists = type switch {
            "coach" => await db.Set<ClassSessionChangeRequest>().AnyAsync(r => r.RequestId == id, ct),
            "refunds" => await db.PaymentAdjustments.AnyAsync(r => r.AdjustmentId == id && r.Type == PaymentAdjustmentType.Refund, ct),
            "support" => await db.MemberSupportRequests.AnyAsync(r => r.RequestId == id, ct),
            _ => false
        };
        if (!exists) return NotFound();
        var managerId = User.RequireUserId();
        var now = DateTime.UtcNow;
        await db.Database.ExecuteSqlInterpolatedAsync($"INSERT INTO manager_request_reads (manager_id, request_type, request_id, read_at_utc) VALUES ({managerId}, {type}, {id}, {now}) ON CONFLICT (manager_id, request_type, request_id) DO NOTHING", ct);
        return NoContent();
    }
}
