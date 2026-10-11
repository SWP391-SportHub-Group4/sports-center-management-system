using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SportHub.BuildingBlocks.Abstractions.Training;
using SportHub.BuildingBlocks.Api;
using SportHub.BuildingBlocks.SharedKernel.Errors;
using SportHub.Training.Application.Services;

namespace SportHub.Training.Api;

public sealed record PtQuoteRequest(Guid MemberPackageId, Guid CoachId, int FrequencyPerWeek,
    Guid? TargetMemberId, DateTime? StartAtUtc = null, int? RoomId = null);

[ApiController, Authorize, Route("api")]
public sealed class PtPricingController(PtPricingService pricing) : ControllerBase
{
    [HttpGet("pt-pricing")]
    public async Task<IActionResult> Get(CancellationToken ct)
    {
        var price = await pricing.GetPriceAsync(ct);
        return Ok(new { pricePerSessionVnd = price.Value, priceVersion = price.Version });
    }

    [HttpPost("checkouts/pt/quote")]
    public async Task<IActionResult> Quote(PtQuoteRequest request, CancellationToken ct)
    {
        var staff = User.IsInRole(SportHubRoleNames.Receptionist)
            || User.IsInRole(SportHubRoleNames.CenterManager);
        if (!staff && !User.IsInRole(SportHubRoleNames.Member))
            throw new ForbiddenException("pt_quote_forbidden", "Không có quyền báo giá PT.");
        var member = staff ? request.TargetMemberId ?? throw new BadRequestException(
                "target_member_required", "Cần chọn hội viên.") : User.RequireUserId();
        if (!staff && request.TargetMemberId is Guid target && target != member)
            throw new ForbiddenException("target_member_forbidden", "Không thể báo giá cho hội viên khác.");
        return Ok(await pricing.QuoteAsync(new PtPurchaseRequest(member, request.MemberPackageId,
            request.CoachId, request.FrequencyPerWeek, request.StartAtUtc, request.RoomId), ct));
    }
}
