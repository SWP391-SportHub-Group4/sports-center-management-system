using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using SportHub.BuildingBlocks.Api;
using SportHub.BuildingBlocks.SharedKernel.Errors;
using SportHub.Payment.Application.Commands;
using SportHub.Payment.Application.Commands.Checkouts;
using SportHub.Payment.Application.Interfaces;
using SportHub.Payment.Application.Services;

namespace SportHub.Payment.Api;

[ApiController, Authorize, Route("api/checkouts")]
public sealed class CheckoutsController(CheckoutService checkouts, IPackagePurchaseService packages) : ControllerBase
{
    [HttpPost("membership")]
    [EnableRateLimiting("checkout-write")]
    public async Task<IActionResult> Membership([FromBody] MembershipCheckoutRequest request,
        [FromHeader(Name = "Idempotency-Key")] string key, CancellationToken ct)
    {
        RequireMemberBuyer();
        var actorId = User.RequireUserId();
        var staff = User.IsInRole(SportHubRoleNames.Receptionist)
            || User.IsInRole(SportHubRoleNames.CenterManager);
        if (string.IsNullOrWhiteSpace(key) || key.Length > 120)
            throw new BadRequestException("idempotency_key_required", "Cần Idempotency-Key hợp lệ.");
        var memberId = staff ? request.TargetMemberId ?? throw new BadRequestException(
                "target_member_required", "Cần chọn hội viên.") : actorId;
        if (!staff && request.TargetMemberId is Guid target && target != actorId)
            throw new ForbiddenException("target_member_forbidden", "Không thể thanh toán cho hội viên khác.");
        var detail = await packages.PurchaseAsync(new PurchasePackageRequest
        {
            MemberId = memberId, PackageId = request.PackageId, AllowStacking = request.AllowStacking,
            StackingApprovalReason = request.StackingApprovalReason
        }, actorId, User.IsInRole(SportHubRoleNames.CenterManager), ct, key);
        return Created($"/api/checkouts/{detail.Summary.InvoiceId}",
            await checkouts.GetAsync(detail.Summary.InvoiceId, actorId, staff, ct));
    }

    [HttpPost("class")]
    [EnableRateLimiting("checkout-write")]
    public async Task<IActionResult> Class([FromBody] ClassCheckoutRequest request,
        [FromHeader(Name = "Idempotency-Key")] string key, CancellationToken ct)
    {
        RequireMemberBuyer();
        var staff = User.IsInRole(SportHubRoleNames.Receptionist)
            || User.IsInRole(SportHubRoleNames.CenterManager);
        var result = await checkouts.CreateClassAsync(request, key, User.RequireUserId(), staff, ct);
        return Created($"/api/checkouts/{result.InvoiceId}", result);
    }

    [HttpPost("pt")]
    [EnableRateLimiting("checkout-write")]
    public async Task<IActionResult> Pt([FromBody] PtCheckoutRequest request,
        [FromHeader(Name = "Idempotency-Key")] string key, CancellationToken ct)
    {
        RequireMemberBuyer();
        var result = await checkouts.CreatePtAsync(request, key, User.RequireUserId(), IsStaff(), ct);
        return Created($"/api/checkouts/{result.InvoiceId}", result);
    }

    [Authorize(Roles = SportHubRoleNames.ExternalCoach)]
    [HttpPost("court-rental")]
    [EnableRateLimiting("checkout-write")]
    public async Task<IActionResult> CourtRental([FromBody] CourtRentalCheckoutRequest request,
        [FromHeader(Name = "Idempotency-Key")] string key, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(key) || key.Length > 120)
            throw new BadRequestException("idempotency_key_required", "Cần Idempotency-Key hợp lệ.");
        var coachId = User.RequireUserId();
        var command = new SportHub.BuildingBlocks.Abstractions.Scheduling.CourtRentalRequest(
            coachId, request.SportId, request.RoomId, request.StartUtc, request.EndUtc, request.ExpectedAttendees);
        var result = await checkouts.CreateCourtRentalAsync(command, key, coachId, ct);
        return Created($"/api/checkouts/{result.InvoiceId}", result);
    }

    [HttpGet("by-reference")]
    public async Task<IActionResult> ByReference([FromQuery] string reference, CancellationToken ct)
    {
        RequireBuyer();
        return Ok(await checkouts.FindByReferenceAsync(reference, User.RequireUserId(), ct));
    }

    [HttpGet("by-key")]
    public async Task<IActionResult> ByKey([FromQuery] string key, CancellationToken ct)
    {
        RequireBuyer();
        return Ok(await checkouts.FindByKeyAsync(key, User.RequireUserId(), ct));
    }

    [HttpGet("{invoiceId:guid}")]
    public Task<IActionResult> Get(Guid invoiceId, CancellationToken ct)
    {
        RequireBuyer();
        return GetCore(invoiceId, ct);
    }

    private async Task<IActionResult> GetCore(Guid invoiceId, CancellationToken ct)
        => Ok(await checkouts.GetAsync(invoiceId, User.RequireUserId(), IsStaff(), ct));

    [HttpPost("{invoiceId:guid}/confirm-points")]
    [EnableRateLimiting("checkout-write")]
    public async Task<IActionResult> ConfirmPoints(Guid invoiceId, CancellationToken ct)
    {
        RequireBuyer();
        return Ok(await checkouts.ConfirmPointsAsync(invoiceId, User.RequireUserId(), IsStaff(), ct));
    }

    [HttpPost("{invoiceId:guid}/attempts")]
    [EnableRateLimiting("checkout-write")]
    public async Task<IActionResult> Attempt(Guid invoiceId, CancellationToken ct)
    {
        RequireBuyer();
        var ip = HttpContext.Connection.RemoteIpAddress?.ToString() ?? "127.0.0.1";
        return Ok(await checkouts.StartPaymentAsync(invoiceId, User.RequireUserId(), IsStaff(), ip, ct));
    }

    [HttpPost("{invoiceId:guid}/cancel")]
    [EnableRateLimiting("checkout-write")]
    public async Task<IActionResult> Cancel(Guid invoiceId, CancellationToken ct)
    {
        RequireBuyer();
        await checkouts.CancelAsync(invoiceId, User.RequireUserId(), IsStaff(), ct);
        return NoContent();
    }

    [HttpPost("{invoiceId:guid}/retry")]
    [EnableRateLimiting("checkout-write")]
    public async Task<IActionResult> Retry(Guid invoiceId,
        [FromHeader(Name = "Idempotency-Key")] string key,
        [FromBody] RetryCheckoutRequest request, CancellationToken ct)
    {
        RequireBuyer();
        var result = await checkouts.RetryAsync(invoiceId, key, request.PriceVersion,
            User.RequireUserId(), IsStaff(), User.IsInRole(SportHubRoleNames.CenterManager), ct);
        return Created($"/api/checkouts/{result.InvoiceId}", result);
    }

    private bool IsStaff() => User.IsInRole(SportHubRoleNames.Receptionist)
        || User.IsInRole(SportHubRoleNames.CenterManager);

    private void RequireBuyer()
    {
        if (!User.IsInRole(SportHubRoleNames.Member) && !User.IsInRole(SportHubRoleNames.ExternalCoach) && !IsStaff())
            throw new ForbiddenException("checkout_forbidden", "Tài khoản không được thực hiện checkout.");
    }

    private void RequireMemberBuyer()
    {
        if (!User.IsInRole(SportHubRoleNames.Member) && !IsStaff())
            throw new ForbiddenException("checkout_forbidden", "Chỉ Member hoặc nhân viên quầy được mua Membership, lớp và PT.");
    }
}

public sealed record RetryCheckoutRequest(string? PriceVersion = null);

public sealed record CourtRentalCheckoutRequest(int SportId, int RoomId,
    DateTimeOffset StartUtc, DateTimeOffset EndUtc, int ExpectedAttendees);
