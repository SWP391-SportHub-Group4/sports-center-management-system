using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Hosting;
using SportHub.BuildingBlocks.Abstractions.Persistence;
using SportHub.BuildingBlocks.Api;
using SportHub.BuildingBlocks.SharedKernel.Errors;
using SportHub.Payment.Application.Services;
using SportHub.Payment.VnPay;

namespace SportHub.Payment.Api;

[ApiController, Authorize(Policy = SportHubPolicies.FrontDesk), Route("api/dev/payments")]
public sealed class DevPaymentsController(IHostEnvironment environment, IPaymentGateway gateway,
    ISportHubDbContext db, PaymentReconciliationService reconciliation) : ControllerBase
{
    [HttpPost("{reference}/simulate")]
    public async Task<IActionResult> Simulate(string reference, [FromQuery] bool success = true,
        CancellationToken ct = default)
    {
        if (!environment.IsDevelopment() || gateway is not MockPaymentGateway mock)
            throw new NotFoundException("dev_payment_unavailable", "Thanh toán thử không khả dụng.");
        var attempt = await db.Set<PaymentAttempt>().AsNoTracking()
            .SingleOrDefaultAsync(x => x.VnpTxnRef == reference, ct)
            ?? throw new NotFoundException("payment_attempt_not_found", "Không tìm thấy attempt.");
        await reconciliation.ReceiveCallbackAsync(mock.BuildCallback(reference, attempt.Amount, success), ct);
        return Ok(new { attempt.InvoiceId, reference });
    }
}
