using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;
using SportHub.BuildingBlocks.Abstractions.Persistence;
using SportHub.BuildingBlocks.Api;
using SportHub.BuildingBlocks.SharedKernel.Errors;
using SportHub.Payment.Application.Commands;
using SportHub.Payment.Application.Commands.Checkouts;
using SportHub.Payment.Application.Interfaces;
using SportHub.Payment.Application.Services;

namespace SportHub.Payment.Api;

[ApiController, Authorize, Route("api/checkouts")]
public sealed class CheckoutsController(CheckoutService checkouts, IPackagePurchaseService packages,
    PaymentReconciliationService reconciliation, ISportHubDbContext db) : ControllerBase
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
            throw new BadRequestException("idempotency_key_required", "Idempotency key required.");
        var memberId = staff ? request.TargetMemberId ?? throw new BadRequestException(
                "target_member_required", "Target member required.") : actorId;
        if (!staff && request.TargetMemberId is Guid target && target != actorId)
            throw new ForbiddenException("target_member_forbidden", "Target member forbidden.");
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

    [HttpPost("court-rental")]
    [EnableRateLimiting("checkout-write")]
    public async Task<IActionResult> CourtRental([FromBody] CourtRentalCheckoutRequest request,
        [FromHeader(Name = "Idempotency-Key")] string key, CancellationToken ct)
    {
        RequireMemberBuyer();
        if (string.IsNullOrWhiteSpace(key) || key.Length > 120)
            throw new BadRequestException("idempotency_key_required", "Idempotency key required.");
        var actorId = User.RequireUserId();
        var staff = IsStaff();
        var memberId = staff ? request.TargetMemberId ?? throw new BadRequestException(
            "target_member_required", "Target member required.") : actorId;
        if (!staff && request.TargetMemberId is Guid target && target != actorId)
            throw new ForbiddenException("target_member_forbidden", "Target member forbidden.");
        var command = new SportHub.BuildingBlocks.Abstractions.Scheduling.CourtRentalRequest(
            memberId, request.SportId, request.RoomId, request.StartUtc, request.EndUtc);
        var result = await checkouts.CreateCourtRentalAsync(command, key, actorId, ct, staff);
        return Created($"/api/checkouts/{result.InvoiceId}", result);
    }

    [HttpGet("by-reference")]
    public async Task<IActionResult> ByReference([FromQuery] string reference, CancellationToken ct)
    {
        RequireBuyer();
        return Ok(await checkouts.FindByReferenceAsync(reference, User.RequireUserId(), ct));
    }

    [HttpPost("verify-reference")]
    [EnableRateLimiting("checkout-write")]
    public async Task<IActionResult> VerifyReference([FromBody] VerifyPaymentReferenceRequest request,
        CancellationToken ct)
    {
        RequireBuyer();
        var actorId = User.RequireUserId();
        // Ownership is checked before calling VNPay. The browser's return parameters are never
        // accepted as proof of payment; only a signed QueryDR response can change the invoice.
        var checkout = await checkouts.FindByReferenceAsync(request.Reference, actorId, ct);
        var attempt = await db.Set<PaymentAttempt>().AsNoTracking()
            .SingleAsync(x => x.VnpTxnRef == request.Reference && x.InvoiceId == checkout.InvoiceId, ct);
        // Expiry releases the resource hold; it does not prove that VNPay did not collect money.
        // Query the expired attempt too so the existing late-payment pipeline can resolve it.
        if (attempt.Status is PaymentAttemptStatus.Pending or PaymentAttemptStatus.Expired)
        {
            if (!await reconciliation.ReconcileAttemptAsync(attempt.PaymentAttemptId, ct))
                throw new ConflictException("payment_verification_pending",
                    "VNPay has not returned a verified payment result yet.");
        }
        return Ok(await checkouts.GetAsync(checkout.InvoiceId, actorId, IsStaff(), ct));
    }

    [HttpPost("cancel-reference")]
    [EnableRateLimiting("checkout-write")]
    public async Task<IActionResult> CancelReference([FromBody] CancelPaymentReferenceRequest request,
        CancellationToken ct)
    {
        RequireBuyer();
        var actorId = User.RequireUserId();
        var fields = request.Fields ?? new Dictionary<string, string>();
        var reference = fields.GetValueOrDefault("vnp_TxnRef") ?? string.Empty;
        var checkout = await checkouts.FindByReferenceAsync(reference, actorId, ct);
        // The return URL is attacker-controllable, so only a correctly signed cancel code is honoured.
        if (!await reconciliation.RecordUserCancellationAsync(fields, checkout.InvoiceId, ct))
            throw new ConflictException("payment_not_cancelled", "The gateway did not report a cancellation.");
        return Ok(await checkouts.GetAsync(checkout.InvoiceId, actorId, IsStaff(), ct));
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
        [FromHeader(Name = "Idempotency-Key")] string key, CancellationToken ct)
    {
        RequireBuyer();
        var result = await checkouts.RetryAsync(invoiceId, key,
            User.RequireUserId(), IsStaff(), User.IsInRole(SportHubRoleNames.CenterManager), ct);
        return Created($"/api/checkouts/{result.InvoiceId}", result);
    }

    private bool IsStaff() => User.IsInRole(SportHubRoleNames.Receptionist)
        || User.IsInRole(SportHubRoleNames.CenterManager);

    private void RequireBuyer()
    {
        if (!User.IsInRole(SportHubRoleNames.Member) && !IsStaff())
            throw new ForbiddenException("checkout_forbidden", "Checkout forbidden.");
    }

    private void RequireMemberBuyer()
    {
        if (!User.IsInRole(SportHubRoleNames.Member) && !IsStaff())
            throw new ForbiddenException("checkout_forbidden", "Checkout forbidden.");
    }
}

public sealed record CourtRentalCheckoutRequest(int SportId, int RoomId,
    DateTimeOffset StartUtc, DateTimeOffset EndUtc, Guid? TargetMemberId = null);

public sealed record VerifyPaymentReferenceRequest(string Reference);
public sealed record CancelPaymentReferenceRequest(Dictionary<string, string>? Fields);
