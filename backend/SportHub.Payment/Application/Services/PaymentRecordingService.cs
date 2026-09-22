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

/// <summary>
/// Ghi nhận một khoản thu (MVP: thủ công tại quầy, không qua cổng thanh toán thật — SSOT §1.3).
///
/// Một transaction làm đủ bốn việc, vì bỏ sót bất kỳ việc nào cũng để lại dữ liệu sai:
/// 1. Thêm Payment sau khi kiểm BR-41 (không thu vượt trần).
/// 2. Cập nhật hạn thanh toán theo BR-55 nếu đây là khoản Success đầu tiên.
/// 3. Cập nhật Invoice.Status theo số liệu (SSOT §4).
/// 4. Kích hoạt MemberPackage khi hoá đơn đã thanh toán ĐẦY ĐỦ (BR-30) + thông báo (BR-33/34).
/// </summary>
public sealed class PaymentRecordingService(
    ISportHubDbContext db,
    IInvoiceQueryService invoiceQuery,
    IAuditWriter audit,
    INotificationWriter notifications,
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

        var amount = decimal.Truncate(request.Amount); // VND nguyên (SSOT §5.2)

        await using var transaction = await db.Database.BeginTransactionAsync(ct);

        var invoice = await db.Set<Invoice>().SingleOrDefaultAsync(i => i.InvoiceId == invoiceId, ct)
            ?? throw new NotFoundException("invoice_not_found", "Không tìm thấy hóa đơn.");

        if (invoice.Status == InvoiceStatus.Void)
        {
            throw new ConflictException("invoice_void", "Hóa đơn đã bị hủy bằng điều chỉnh, không thu thêm được.");
        }

        // Đọc số dư BÊN TRONG transaction: đọc trước khi mở transaction sẽ để hở khe cho hai
        // khoản thu đồng thời cùng nhìn thấy một số dư cũ và cùng được chấp nhận (vượt BR-41).
        var balance = await invoiceQuery.GetBalanceAsync(invoiceId, ct);

        if (!InvoiceMath.CanAcceptPayment(balance, amount))
        {
            throw new ConflictException(
                "payment_exceeds_invoice_balance",
                $"Số tiền vượt quá phần còn phải thu ({balance.Outstanding:N0} VND) của hóa đơn (BR-41).");
        }

        var now = clock.UtcNow;

        db.Set<Domain.Entities.Payment>().Add(new Domain.Entities.Payment
        {
            PaymentId = Guid.NewGuid(),
            InvoiceId = invoiceId,
            Amount = amount,
            Method = method,
            ReferenceCode = string.IsNullOrWhiteSpace(request.ReferenceCode) ? null : request.ReferenceCode.Trim(),

            // MVP ghi nhận thủ công tại quầy nên khoản thu có hiệu lực ngay khi nhân viên
            // bấm lưu — không có bước đối soát với cổng ngoài để chờ ở trạng thái Pending.
            Status = PaymentStatus.Success,
            ReceivedByUserId = actorUserId,
            PaidAt = now
        });

        // BR-55 — chỉ khoản Success ĐẦU TIÊN mới dời hạn sang 12 tháng; khoản sau không gia hạn.
        if (invoice.FirstDepositAtUtc is null)
        {
            invoice.FirstDepositAtUtc = now;
            invoice.DueDateUtc = InvoiceMath.DueDateAfterFirstDeposit(now);
        }

        var updatedBalance = balance with { TotalCollected = balance.TotalCollected + amount };
        var previousStatus = invoice.Status;
        invoice.Status = InvoiceMath.DeriveStatus(invoice.Status, updatedBalance);

        audit.Write(new AuditEntry(
            actorUserId, "RECORD_PAYMENT", nameof(Invoice), invoiceId.ToString(),
            OldValue: $"{{\"status\":\"{previousStatus}\",\"collected\":{balance.TotalCollected}}}",
            NewValue: $"{{\"status\":\"{invoice.Status}\",\"collected\":{updatedBalance.TotalCollected},"
                      + $"\"amount\":{amount},\"method\":\"{method}\"}}"));

        notifications.Queue(new NotificationRequest(
            invoice.MemberId,
            NotificationEvents.PaymentReceived,
            $"Đã ghi nhận thanh toán {amount:N0} VND cho hóa đơn {invoice.InvoiceNumber}. "
            + $"Còn lại {updatedBalance.Outstanding:N0} VND.",
            invoiceId));

        // BR-30 — gói chỉ chuyển Active sau khi hoá đơn được thanh toán ĐẦY ĐỦ.
        if (invoice.Status == InvoiceStatus.Paid && invoice.MemberPackageId is not null)
        {
            await ActivatePackageAsync(invoice, actorUserId, ct);
        }

        await db.SaveChangesAsync(ct);
        await transaction.CommitAsync(ct);

        return await invoiceQuery.GetDetailAsync(invoiceId, ct);
    }

    private async Task ActivatePackageAsync(Invoice invoice, Guid actorUserId, CancellationToken ct)
    {
        var memberPackage = await db.Set<MemberPackage>()
            .SingleOrDefaultAsync(mp => mp.MemberPackageId == invoice.MemberPackageId, ct);

        // Gói đã bị huỷ trước khi thu đủ thì KHÔNG hồi sinh: SSOT §4 không có nhánh
        // Cancelled → Active. Tiền đã thu vẫn còn trên hoá đơn và xử lý qua PaymentAdjustment (BR-42).
        if (memberPackage is null || memberPackage.Status != MemberPackageStatus.PendingPayment)
        {
            return;
        }

        var catalog = await db.Set<MembershipPackage>()
            .SingleAsync(p => p.PackageId == memberPackage.PackageId, ct);

        // Quyết định C4: gói chạy từ NGÀY thanh toán đủ (giờ VN), không phải từ ngày phát hành
        // hoá đơn — hội viên trả góp hai tháng không bị mất hai tháng sử dụng.
        var (startDate, endDate) = MemberPackageRules.ComputePeriod(
            VietnamTime.TodayLocal(clock), catalog.DurationDays);

        memberPackage.StartDate = startDate;
        memberPackage.EndDate = endDate;
        memberPackage.RemainingSessions = catalog.SessionLimit;
        memberPackage.Status = MemberPackageStatus.Active;

        audit.Write(new AuditEntry(
            actorUserId, "ACTIVATE_MEMBER_PACKAGE", nameof(MemberPackage), memberPackage.MemberPackageId.ToString(),
            OldValue: $"{{\"status\":\"{MemberPackageStatus.PendingPayment}\"}}",
            NewValue: $"{{\"status\":\"{MemberPackageStatus.Active}\",\"startDate\":\"{startDate:yyyy-MM-dd}\","
                      + $"\"endDate\":\"{endDate:yyyy-MM-dd}\"}}"));

        notifications.Queue(new NotificationRequest(
            invoice.MemberId,
            NotificationEvents.PaymentReceived,
            $"Gói {catalog.Name} đã được kích hoạt, hiệu lực từ {startDate:dd/MM/yyyy} đến {endDate:dd/MM/yyyy}.",
            memberPackage.MemberPackageId));
    }
}
