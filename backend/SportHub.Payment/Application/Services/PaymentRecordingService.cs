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

        var amount = decimal.Truncate(request.Amount); // VND nguyên (SSOT §5.2)

        await using var transaction = await db.Database.BeginTransactionAsync(ct);

        // KHOÁ hàng hoá đơn trước khi đọc số dư. Đọc-bên-trong-transaction là CHƯA đủ ở mức
        // cô lập mặc định Read Committed của PostgreSQL: hai transaction song song cùng nhìn
        // thấy ảnh chụp trước khi nhau ghi, cùng kết luận còn đủ Outstanding, và cùng được
        // chấp nhận — thu vượt trần BR-41. Đã tái hiện được bằng test
        // DepositAndActivationTests.Hai_khoan_thu_dong_thoi_khong_vuot_tran (thu 2 triệu trên
        // hoá đơn 1 triệu).
        //
        // Khoá ở HOÁ ĐƠN chứ không ở từng khoản thu: trần là đại lượng của hoá đơn, nên hoá
        // đơn mới là điểm tuần tự hoá đúng.
        var invoice = await LockInvoiceAsync(invoiceId, ct);

        if (invoice.Status == InvoiceStatus.Void)
        {
            throw new ConflictException("invoice_void", "Hóa đơn đã bị hủy bằng điều chỉnh, không thu thêm được.");
        }

        // Đọc số dư BÊN TRONG transaction: đọc trước khi mở transaction sẽ để hở khe cho hai
        // khoản thu đồng thời cùng nhìn thấy một số dư cũ và cùng được chấp nhận (vượt BR-41).
        var balance = await invoiceQuery.GetBalanceAsync(invoiceId, ct);
        var now = clock.UtcNow;

        // BR-55 — sau hạn thì đường thu THÔNG THƯỜNG bị chặn. Cố ý chỉ chặn, không tự Void hoá
        // đơn, không tự Cancel gói và không tịch thu cọc: quy trình Manager xử lý quá hạn chưa
        // được chốt (SSOT §7), nên hệ thống dừng lại và để người quyết định.
        if (now > invoice.DueDateUtc)
        {
            throw new ConflictException(
                "invoice_overdue",
                $"Hóa đơn đã quá hạn thanh toán ({invoice.DueDateUtc:dd/MM/yyyy}). "
                + "Cần Center Manager xử lý ngoại lệ trước khi thu tiếp (BR-55).");
        }

        if (!InvoiceMath.CanAcceptPayment(balance, amount))
        {
            throw new ConflictException(
                "payment_exceeds_invoice_balance",
                $"Số tiền vượt quá phần còn phải thu ({balance.Outstanding:N0} VND) của hóa đơn (BR-41).");
        }

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

        var updatedBalance = balance with { GrossCollected = balance.GrossCollected + amount };

        // BR-55 — chỉ CỌC mới gia hạn. "Cọc" = khoản Success đầu tiên mà SAU khi thu vẫn còn
        // Outstanding; trả đủ ngay lần đầu không phải cọc nên không được hưởng 12 tháng.
        // Ngoài ra cọc phải nhận TẠI HOẶC TRƯỚC hạn ban đầu — nhận sau hạn thì không có gì
        // để gia hạn nữa.
        var isFirstSuccessfulPayment = balance.GrossCollected == 0m && invoice.FirstDepositAtUtc is null;
        var leavesBalanceOutstanding = updatedBalance.Outstanding > 0m;

        if (isFirstSuccessfulPayment && leavesBalanceOutstanding && now <= invoice.DueDateUtc)
        {
            invoice.FirstDepositAtUtc = now;
            invoice.DueDateUtc = InvoiceMath.DueDateAfterFirstDeposit(now);
        }

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

        // BR-30 — gói chỉ chuyển Active sau khi nghĩa vụ hoá đơn được thoả ĐẦY ĐỦ.
        await packageActivation.ActivateIfObligationMetAsync(invoice, updatedBalance, actorUserId, ct);

        await db.SaveChangesAsync(ct);
        await transaction.CommitAsync(ct);

        return await invoiceQuery.GetDetailAsync(invoiceId, ct);
    }

    /// <summary>
    /// Khoá hàng hoá đơn trong transaction hiện tại (BR-41 — "khóa/kiểm tra số dư nguyên tử").
    /// Trả về entity CÓ tracking để các thay đổi sau đó vẫn được SaveChanges ghi lại.
    /// </summary>
    private async Task<Invoice> LockInvoiceAsync(Guid invoiceId, CancellationToken ct)
    {
        var locked = await db.Set<Invoice>()
            .FromSqlRaw("SELECT * FROM invoices WHERE invoice_id = {0} FOR UPDATE", invoiceId)
            .ToListAsync(ct);

        return locked.SingleOrDefault()
               ?? throw new NotFoundException("invoice_not_found", "Không tìm thấy hóa đơn.");
    }
}
