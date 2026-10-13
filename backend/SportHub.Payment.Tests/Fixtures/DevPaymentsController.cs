using SportHub.Payment.Domain.Entities;
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

// Chỉ chạy được ở Development với MockPaymentGateway (kiểm tra trong Simulate) nên cho mọi user đăng nhập,
// để Member tự thử luồng mua gói khi chưa tích hợp VNPay sandbox.
[ApiController, Authorize, Route("api/dev/payments")]
public sealed class DevPaymentsController(IHostEnvironment environment, IPaymentGateway gateway,
    ISportHubDbContext db, PaymentReconciliationService reconciliation) : ControllerBase
{
    [HttpPost("{reference}/simulate")]
    public async Task<IActionResult> Simulate(string reference, [FromQuery] bool success = true,
        CancellationToken ct = default)
    {
        if (!environment.IsDevelopment() || gateway is not MockPaymentGateway mock)
            throw new NotFoundException("dev_payment_unavailable", "Dev payment unavailable.");
        var attempt = await db.Set<PaymentAttempt>().AsNoTracking()
            .SingleOrDefaultAsync(x => x.VnpTxnRef == reference, ct)
            ?? throw new NotFoundException("payment_attempt_not_found", "Payment attempt not found.");
        await reconciliation.ReceiveCallbackAsync(mock.BuildCallback(reference, attempt.Amount, success), ct);
        return Ok(new { attempt.InvoiceId, reference });
    }
}
