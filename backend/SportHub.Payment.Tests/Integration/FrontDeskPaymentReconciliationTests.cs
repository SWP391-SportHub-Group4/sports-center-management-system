using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using SportHub.Identity.Domain.Enums;
using SportHub.Payment.Domain.Entities;
using SportHub.Payment.Domain.Enums;

namespace SportHub.Payment.Tests.Integration;

[Collection(nameof(PaymentApiCollection))]
public sealed class FrontDeskPaymentReconciliationTests(PaymentApiFactory factory)
{
    [Fact]
    public async Task Desk_sees_verified_unfulfilled_payment_after_hold_expiry_and_unverified_attempt()
    {
        var member = await factory.SeedUserAsync(UserRole.Member);
        var desk = await factory.SeedUserAsync(UserRole.Receptionist);
        var invoiceId = Guid.NewGuid();
        var attemptId = Guid.NewGuid();
        var proofId = Guid.NewGuid();
        var expiredInvoiceId = Guid.NewGuid();
        var expiredAttemptId = Guid.NewGuid();
        var compensatedInvoiceId = Guid.NewGuid();
        var compensatedAttemptId = Guid.NewGuid();
        await factory.QueryAsync(async db =>
        {
            db.Invoices.Add(new Invoice
            {
                InvoiceId = invoiceId, InvoiceNumber = "RECON-" + Guid.NewGuid().ToString("N"),
                MemberId = member.UserId, IssuedByUserId = desk.UserId,
                TotalAmount = 100_000m, CashAmount = 100_000m, Status = InvoiceStatus.Issued,
                IssuedAt = DateTime.UtcNow.AddHours(-2), HoldExpiresAtUtc = DateTime.UtcNow.AddMinutes(-1)
            });
            db.PaymentAttempts.Add(new PaymentAttempt
            {
                PaymentAttemptId = attemptId, InvoiceId = invoiceId,
                VnpTxnRef = "RECON-" + Guid.NewGuid().ToString("N"), Amount = 100_000m,
                CashSnapshot = 100_000m, VnpExpireDate = DateTime.UtcNow.AddMinutes(-1),
                Status = PaymentAttemptStatus.ReconciliationRequired, CreatedAt = DateTime.UtcNow.AddHours(-1)
            });
            db.VerifiedGatewayEvents.Add(new VerifiedGatewayEvent
            {
                VerifiedGatewayEventId = proofId, PaymentAttemptId = attemptId,
                ProviderTransactionId = Guid.NewGuid().ToString("N"),
                TransactionReference = Guid.NewGuid().ToString("N"), Amount = 100_000m,
                ResponseCode = "00", TransactionStatus = "00", ProcessingStatus = "ReconciliationRequired",
                ProviderPaidAtUtc = DateTime.UtcNow.AddMinutes(-5), VerifiedAtUtc = DateTime.UtcNow.AddMinutes(-4)
            });
            db.Invoices.Add(new Invoice
            {
                InvoiceId = expiredInvoiceId, InvoiceNumber = "EXPIRED-" + Guid.NewGuid().ToString("N"),
                MemberId = member.UserId, IssuedByUserId = desk.UserId,
                TotalAmount = 100_000m, CashAmount = 100_000m, Status = InvoiceStatus.Void,
                IssuedAt = DateTime.UtcNow.AddHours(-2), HoldExpiresAtUtc = DateTime.UtcNow.AddMinutes(-1)
            });
            db.PaymentAttempts.Add(new PaymentAttempt
            {
                PaymentAttemptId = expiredAttemptId, InvoiceId = expiredInvoiceId,
                VnpTxnRef = "EXPIRED-" + Guid.NewGuid().ToString("N"), Amount = 100_000m,
                CashSnapshot = 100_000m, VnpExpireDate = DateTime.UtcNow.AddMinutes(-1),
                Status = PaymentAttemptStatus.Expired, CreatedAt = DateTime.UtcNow.AddHours(-1)
            });
            db.Invoices.Add(new Invoice
            {
                InvoiceId = compensatedInvoiceId, InvoiceNumber = "COMPENSATED-" + Guid.NewGuid().ToString("N"),
                MemberId = member.UserId, IssuedByUserId = desk.UserId,
                TotalAmount = 100_000m, CashAmount = 100_000m,
                Status = InvoiceStatus.PaidAfterReconciliation, PaidVia = "VnPayCompensated",
                IssuedAt = DateTime.UtcNow.AddHours(-2), HoldExpiresAtUtc = DateTime.UtcNow.AddMinutes(-1)
            });
            db.PaymentAttempts.Add(new PaymentAttempt
            {
                PaymentAttemptId = compensatedAttemptId, InvoiceId = compensatedInvoiceId,
                VnpTxnRef = "COMPENSATED-" + Guid.NewGuid().ToString("N"), Amount = 100_000m,
                CashSnapshot = 100_000m, VnpExpireDate = DateTime.UtcNow.AddMinutes(-1),
                Status = PaymentAttemptStatus.Failed, CreatedAt = DateTime.UtcNow.AddHours(-1)
            });
            db.VerifiedGatewayEvents.Add(new VerifiedGatewayEvent
            {
                VerifiedGatewayEventId = Guid.NewGuid(), PaymentAttemptId = compensatedAttemptId,
                ProviderTransactionId = Guid.NewGuid().ToString("N"),
                TransactionReference = Guid.NewGuid().ToString("N"), Amount = 100_000m,
                ResponseCode = "00", TransactionStatus = "00", ProcessingStatus = "Compensated",
                ProviderPaidAtUtc = DateTime.UtcNow.AddMinutes(-5), VerifiedAtUtc = DateTime.UtcNow.AddMinutes(-4)
            });
            await db.SaveChangesAsync();
            return 0;
        });
        using var client = factory.CreateApiClient(desk.UserId, UserRole.Receptionist);
        var rows = await client.GetFromJsonAsync<JsonElement>(
            $"/api/front-desk/payment-reconciliation?memberId={member.UserId}");
        Assert.Contains(rows.GetProperty("items").EnumerateArray(), x => x.GetProperty("invoiceId").GetGuid() == invoiceId
            && x.GetProperty("verifiedEventId").GetGuid() == proofId
            && x.GetProperty("state").GetString() == "ReconciliationRequired");
        Assert.Contains(rows.GetProperty("items").EnumerateArray(), x => x.GetProperty("invoiceId").GetGuid() == expiredInvoiceId
            && x.GetProperty("paymentAttemptId").GetGuid() == expiredAttemptId
            && x.GetProperty("state").GetString() == "AWAITING_VERIFICATION");
        Assert.DoesNotContain(rows.GetProperty("items").EnumerateArray(),
            x => x.GetProperty("invoiceId").GetGuid() == compensatedInvoiceId);
        Assert.Equal(HttpStatusCode.NotFound,
            (await client.PostAsync($"/api/front-desk/payment-reconciliation/{compensatedInvoiceId}/retry", null)).StatusCode);
        using var memberClient = factory.CreateApiClient(member.UserId, UserRole.Member);
        Assert.Equal(HttpStatusCode.Forbidden,
            (await memberClient.GetAsync("/api/front-desk/payment-reconciliation")).StatusCode);
    }
}
