using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using System.Text.Json.Serialization;
using SportHub.BuildingBlocks.Abstractions.Persistence;
using SportHub.BuildingBlocks.Api;
using SportHub.BuildingBlocks.SharedKernel.Errors;
using SportHub.Payment.Application.Services;

namespace SportHub.Payment.Api;

public sealed record VnPayIpnResponse(
    [property: JsonPropertyName("RspCode")] string RspCode,
    [property: JsonPropertyName("Message")] string Message);

[ApiController, Route("api/payments/vnpay")]
public sealed class PaymentsController(PaymentReconciliationService reconciliation,
    ISportHubDbContext db, ILogger<PaymentsController> logger) : ControllerBase
{
    [Authorize(Policy = SportHubPolicies.FrontDesk)]
    [HttpPost("/api/invoices/{invoiceId:guid}/reconcile")]
    public async Task<IActionResult> Reconcile(Guid invoiceId, CancellationToken ct)
    {
        var attemptId = await db.Set<PaymentAttempt>().AsNoTracking()
            .Where(x => x.InvoiceId == invoiceId).OrderByDescending(x => x.CreatedAt)
            .Select(x => (Guid?)x.PaymentAttemptId).FirstOrDefaultAsync(ct)
            ?? throw new NotFoundException("payment_attempt_not_found", "Payment attempt not found.");
        return Ok(new { verified = await reconciliation.ReconcileAttemptAsync(attemptId, ct) });
    }
    [AllowAnonymous]
    [HttpGet("return")]
    public IActionResult Return()
        => Ok(new { message = "The payment result is being confirmed through IPN. Refresh the checkout status." });

    [AllowAnonymous]
    [HttpGet("ipn")]
    [EnableRateLimiting("vnp-ipn")]
    public async Task<IActionResult> Ipn(CancellationToken ct)
    {
        var fields = Request.Query.ToDictionary(x => x.Key, x => x.Value.ToString(), StringComparer.Ordinal);
        var reference = fields.GetValueOrDefault("vnp_TxnRef");
        logger.LogInformation("VNPay IPN received for reference {Reference}", reference);
        try
        {
            await reconciliation.ReceiveCallbackAsync(fields, ct);
            logger.LogInformation("VNPay IPN accepted for reference {Reference}", reference);
            return Ok(new VnPayIpnResponse("00", "Confirm Success"));
        }
        catch (BadRequestException)
        {
            logger.LogWarning("VNPay IPN rejected: invalid signature or payload for reference {Reference}", reference);
            return Ok(new VnPayIpnResponse("97", "Invalid signature or payload"));
        }
        catch (NotFoundException)
        {
            logger.LogWarning("VNPay IPN rejected: reference {Reference} not found", reference);
            return Ok(new VnPayIpnResponse("01", "Order not found"));
        }
        catch (ConflictException)
        {
            logger.LogWarning("VNPay IPN rejected: transaction conflict for reference {Reference}", reference);
            return Ok(new VnPayIpnResponse("04", "Invalid transaction"));
        }
    }
}
