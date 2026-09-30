using Microsoft.EntityFrameworkCore;
using SportHub.BuildingBlocks.Abstractions.Audit;
using SportHub.BuildingBlocks.Abstractions.Notifications;
using SportHub.BuildingBlocks.Abstractions.Persistence;
using SportHub.BuildingBlocks.SharedKernel.Errors;
using SportHub.BuildingBlocks.SharedKernel.Time;
using SportHub.Membership.Domain.Entities;
using SportHub.Membership.Domain.Enums;
using SportHub.Membership.Domain.Rules;
using SportHub.Payment.Application.Commands;
using SportHub.Payment.Application.DTOs;
using SportHub.Payment.Application.Interfaces;
using SportHub.Payment.Domain.Rules;

namespace SportHub.Payment.Application.Services;

public sealed class PaymentRecordingService(
    ISportHubDbContext db,
    IInvoiceQueryService invoiceQuery,
    IAuditWriter audit,
    INotificationWriter notifications,
    IPackageActivationService packageActivation,
    IClock clock) : IPaymentRecordingService
{
    public async Task<InvoiceDetailResponse> RecordAsync(
        Guid invoiceId,
        RecordPaymentRequest request,
        Guid actorUserId,
        CancellationToken ct = default)
    {
        if (!Enum.TryParse<PaymentMethod>(request.Method, ignoreCase: true, out var method))
        {
            throw new BadRequestException(
                "invalid_payment_method",
                $"Hình thức thanh toán không hợp lệ: '{request.Method}'. Hợp lệ: Cash, Card, Transfer, EWallet.");
        }

        var amount = decimal.Truncate(request.Amount);

        await using var transaction = await db.Database.BeginTransactionAsync(ct);

        var invoice = await LockInvoiceAsync(invoiceId, ct);

        if (await db.Set<CheckoutSession>().AnyAsync(x => x.InvoiceId == invoiceId, ct))
            throw new ConflictException("checkout_requires_verified_payment",
                "Checkout mới chỉ chấp nhận thanh toán đã xác minh qua cổng.");

        if (invoice.Status == InvoiceStatus.Void)
        {
            throw new ConflictException("invoice_void", "Hóa đơn đã bị hủy bằng điều chỉnh, không thu thêm được.");
        }
        if (invoice.PointsApplied > 0 || await db.Set<Wallet.Domain.PointConfirmation>().AnyAsync(x =>
                x.InvoiceId == invoiceId && x.ConsumedAtUtc == null && x.RevokedAtUtc == null
                && x.ExpiresAtUtc > clock.UtcNow, ct))
            throw new ConflictException("point_checkout_requires_gateway",
                "Hóa đơn đang chọn hoặc giữ điểm; không thể thu tiền qua luồng thủ công cũ.");

        var balance = await invoiceQuery.GetBalanceAsync(invoiceId, ct);
        var now = clock.UtcNow;

        if (!InvoiceMath.CanAcceptPayment(balance, amount))
        {
            throw new ConflictException(
                "payment_exceeds_invoice_balance",
                $"Số tiền phải bằng đúng số còn phải thu ({balance.Outstanding:N0} VND) của hóa đơn (BR-41).");
        }

        db.Set<Domain.Entities.Payment>().Add(new Domain.Entities.Payment
        {
            PaymentId = Guid.NewGuid(),
            InvoiceId = invoiceId,
            Amount = amount,
            Method = method,
            ReferenceCode = string.IsNullOrWhiteSpace(request.ReferenceCode) ? null : request.ReferenceCode.Trim(),
            Status = PaymentStatus.Success,
            ReceivedByUserId = actorUserId,
            PaidAt = now
        });

        var updatedBalance = balance with { GrossCollected = balance.GrossCollected + amount };

        var previousStatus = invoice.Status;
        invoice.Status = InvoiceMath.DeriveStatus(invoice.Status, updatedBalance);

        audit.Write(new AuditEntry(
            actorUserId, "RECORD_PAYMENT", nameof(Invoice), invoiceId.ToString(),
            OldValue: $"{{\"status\":\"{previousStatus}\",\"collected\":{balance.GrossCollected}}}",
            NewValue: $"{{\"status\":\"{invoice.Status}\",\"collected\":{updatedBalance.GrossCollected},"
                      + $"\"amount\":{amount},\"method\":\"{method}\"}}"));

        notifications.Queue(new NotificationRequest(
            invoice.MemberId,
            NotificationEvents.PaymentReceived,
            $"Đã ghi nhận thanh toán {amount:N0} VND cho hóa đơn {invoice.InvoiceNumber}. "
            + $"Còn lại {updatedBalance.Outstanding:N0} VND.",
            invoiceId));

        await packageActivation.ActivateIfObligationMetAsync(invoice, updatedBalance, actorUserId, ct);

        await db.SaveChangesAsync(ct);
        await transaction.CommitAsync(ct);

        return await invoiceQuery.GetDetailAsync(invoiceId, ct);
    }

    private async Task<Invoice> LockInvoiceAsync(Guid invoiceId, CancellationToken ct)
    {
        var locked = await db.Set<Invoice>()
            .FromSqlRaw("SELECT * FROM invoices WHERE invoice_id = {0} FOR UPDATE", invoiceId)
            .ToListAsync(ct);

        return locked.SingleOrDefault()
               ?? throw new NotFoundException("invoice_not_found", "Không tìm thấy hóa đơn.");
    }
}
