using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;
using SportHub.BuildingBlocks.Abstractions.Persistence;
using SportHub.BuildingBlocks.Api;
using SportHub.BuildingBlocks.SharedKernel.Errors;
using SportHub.Payment.Application.Services;

namespace SportHub.Payment.Api;

[ApiController, Route("api/payments/vnpay")]
public sealed class PaymentsController(PaymentReconciliationService reconciliation,
    ISportHubDbContext db) : ControllerBase
{
    [Authorize(Policy = SportHubPolicies.FrontDesk)]
    [HttpPost("/api/invoices/{invoiceId:guid}/reconcile")]
    public async Task<IActionResult> Reconcile(Guid invoiceId, CancellationToken ct)
    {
        var attemptId = await db.Set<PaymentAttempt>().AsNoTracking()
            .Where(x => x.InvoiceId == invoiceId).OrderByDescending(x => x.CreatedAt)
            .Select(x => (Guid?)x.PaymentAttemptId).FirstOrDefaultAsync(ct)
            ?? throw new NotFoundException("payment_attempt_not_found", "Không tìm thấy attempt.");
        return Ok(new { verified = await reconciliation.ReconcileAttemptAsync(attemptId, ct) });
    }
    [AllowAnonymous]
    [HttpGet("return")]
    public IActionResult Return()
        => Ok(new { message = "Kết quả đang được xác nhận qua IPN. Hãy tải lại trạng thái checkout." });

    [AllowAnonymous]
    [HttpGet("ipn")]
    [EnableRateLimiting("vnp-ipn")]
    public async Task<IActionResult> Ipn(CancellationToken ct)
    {
        var fields = Request.Query.ToDictionary(x => x.Key, x => x.Value.ToString(), StringComparer.Ordinal);
        try
        {
            await reconciliation.ReceiveCallbackAsync(fields, ct);
            return Ok(new { RspCode = "00", Message = "Confirm Success" });
        }
        catch (BadRequestException)
        {
            return Ok(new { RspCode = "97", Message = "Invalid signature or payload" });
        }
        catch (NotFoundException)
        {
            return Ok(new { RspCode = "01", Message = "Order not found" });
        }
        catch (ConflictException)
        {
            return Ok(new { RspCode = "04", Message = "Invalid transaction" });
        }
    }
}
