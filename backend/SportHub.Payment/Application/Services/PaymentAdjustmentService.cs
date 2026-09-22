using Microsoft.EntityFrameworkCore;
using SportHub.BuildingBlocks.Abstractions.Audit;
using SportHub.BuildingBlocks.Abstractions.Persistence;
using SportHub.BuildingBlocks.SharedKernel.Errors;
using SportHub.BuildingBlocks.SharedKernel.Pagination;
using SportHub.BuildingBlocks.SharedKernel.Time;
using SportHub.Payment.Application.Commands;
using SportHub.Payment.Application.DTOs;
using SportHub.Payment.Application.Interfaces;
using SportHub.Payment.Domain.Rules;

namespace SportHub.Payment.Application.Services;

/// <summary>
/// Điều chỉnh/hoàn tiền — BR-40, BR-42 v1.4, BR-52.
///
/// Vòng đời (SSOT §4): Requested → Approved → Completed, hoặc Requested → Rejected.
///
/// Approve và Complete là HAI bước tách rời cho Refund, khác bản v1.3 gộp làm một:
/// "Manager đồng ý hoàn" và "tiền đã ra khỏi quầy" là hai sự kiện khác nhau, xảy ra ở hai
/// thời điểm, do hai người làm, và có thể rơi vào hai kỳ báo cáo khác nhau (BR-43). Gộp lại
/// thì hệ thống ghi nhận đã trả tiền cho hội viên vào lúc chưa ai trả gì cả.
///
/// Discount/Correction vẫn Completed ngay trong transaction duyệt: chúng chỉ giảm nghĩa vụ
/// trên giấy, không có tiền chuyển đi nên không có gì để xác nhận ở quầy.
/// </summary>
public sealed class PaymentAdjustmentService(
    ISportHubDbContext db,
    IInvoiceQueryService invoiceQuery,
    IPackageActivationService packageActivation,
    IAuditWriter audit,
    IClock clock) : IPaymentAdjustmentService
{
    public async Task<PagedResult<PaymentAdjustmentResponse>> SearchAsync(
        string? status,
        Guid? invoiceId,
        int page,
        int pageSize,
        CancellationToken ct = default)
    {
        page = page < 1 ? 1 : page;
        pageSize = Math.Clamp(pageSize <= 0 ? 20 : pageSize, 1, 100);

        var query = db.Set<PaymentAdjustment>().AsNoTracking();

        if (!string.IsNullOrWhiteSpace(status))
        {
            var parsed = ParseStatus(status);
            query = query.Where(a => a.Status == parsed);
        }

        if (invoiceId is not null)
        {
            query = query.Where(a => a.InvoiceId == invoiceId);
        }

        var total = await query.CountAsync(ct);

        var items = await query
            .OrderByDescending(a => a.CreatedAt)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .Select(InvoiceQueryService.AdjustmentProjection())
            .ToListAsync(ct);

        return new PagedResult<PaymentAdjustmentResponse>
        {
            Items = items,
            Page = page,
            PageSize = pageSize,
            TotalCount = total
        };
    }

    public async Task<PaymentAdjustmentResponse> RequestAsync(
        Guid invoiceId,
        CreateAdjustmentRequest request,
        Guid actorUserId,
        CancellationToken ct = default)
    {
        if (!Enum.TryParse<PaymentAdjustmentType>(request.Type, ignoreCase: true, out var type))
        {
            throw new BadRequestException(
                "invalid_adjustment_type",
                $"Loại điều chỉnh không hợp lệ: '{request.Type}'. Hợp lệ: Refund, Correction, Discount.");
        }

        var invoice = await db.Set<Invoice>().AsNoTracking()
            .SingleOrDefaultAsync(i => i.InvoiceId == invoiceId, ct)
            ?? throw new NotFoundException("invoice_not_found", "Không tìm thấy hóa đơn.");

        if (invoice.Status == InvoiceStatus.Void)
        {
            throw new ConflictException("invoice_void", "Hóa đơn đã bị hủy, không điều chỉnh thêm được.");
        }

        var amount = decimal.Truncate(request.Amount);
        var balance = await invoiceQuery.GetBalanceAsync(invoiceId, ct);

        EnsureWithinCeiling(type, amount, balance);

        if (request.PaymentId is not null)
        {
            var paymentBelongs = await db.Set<Domain.Entities.Payment>()
                .AnyAsync(p => p.PaymentId == request.PaymentId && p.InvoiceId == invoiceId, ct);

            if (!paymentBelongs)
            {
                throw new BadRequestException(
                    "payment_not_in_invoice", "Giao dịch thanh toán không thuộc hóa đơn này (BR-41).");
            }
        }

        var adjustment = new PaymentAdjustment
        {
            AdjustmentId = Guid.NewGuid(),
            InvoiceId = invoiceId,
            PaymentId = request.PaymentId,
            Type = type,
            Amount = amount,
            RequestedAmount = amount,
            Reason = request.Reason.Trim(),
            Status = PaymentAdjustmentStatus.Requested,
            RequestedByUserId = actorUserId,
            CreatedAt = clock.UtcNow
        };

        db.Set<PaymentAdjustment>().Add(adjustment);

        audit.Write(new AuditEntry(
            actorUserId, "REQUEST_PAYMENT_ADJUSTMENT", nameof(PaymentAdjustment), adjustment.AdjustmentId.ToString(),
            NewValue: $"{{\"invoiceId\":\"{invoiceId}\",\"type\":\"{type}\",\"amount\":{amount}}}",
            Reason: adjustment.Reason));

        await db.SaveChangesAsync(ct);

        return await GetOneAsync(adjustment.AdjustmentId, ct);
    }

    public async Task<PaymentAdjustmentResponse> ApproveAsync(
        Guid adjustmentId,
        ApproveAdjustmentRequest request,
        Guid actorUserId,
        CancellationToken ct = default)
    {
        await using var transaction = await db.Database.BeginTransactionAsync(ct);

        var adjustment = await LockAdjustmentAsync(adjustmentId, ct);

        if (adjustment.Status != PaymentAdjustmentStatus.Requested)
        {
            throw new ConflictException(
                "adjustment_already_resolved",
                $"Yêu cầu đang ở trạng thái {adjustment.Status}, không duyệt lại được.");
        }

        // BR-42 — người tạo yêu cầu không được tự duyệt, kể cả khi họ là Center Manager.
        if (adjustment.RequestedByUserId == actorUserId)
        {
            throw new ForbiddenException(
                "cannot_approve_own_request",
                "Không được tự phê duyệt yêu cầu điều chỉnh do chính mình tạo (BR-42).");
        }

        var invoice = await db.Set<Invoice>().SingleAsync(i => i.InvoiceId == adjustment.InvoiceId, ct);
        var balanceBefore = await invoiceQuery.GetBalanceAsync(adjustment.InvoiceId, ct);
        var previousAmount = adjustment.Amount;
        var now = clock.UtcNow;

        // BR-52 — Manager được ghi đè số tiền mặc định, nhưng phải có lý do và vẫn trong trần.
        if (request.OverrideAmount is not null)
        {
            var overridden = decimal.Truncate(request.OverrideAmount.Value);

            if (overridden != previousAmount && string.IsNullOrWhiteSpace(request.Reason))
            {
                throw new BadRequestException(
                    "override_requires_reason", "Ghi đè số tiền phải kèm lý do (BR-52).");
            }

            EnsureWithinCeiling(adjustment.Type, overridden, balanceBefore);
            adjustment.Amount = overridden;
        }

        adjustment.ApprovedByUserId = actorUserId;
        adjustment.ApprovedAtUtc = now;

        InvoiceBalance balanceAfter;

        if (adjustment.Type == PaymentAdjustmentType.Refund)
        {
            // BR-42 v1.4 — dừng ở Approved. Không đụng vào bất kỳ đại lượng tiền nào: được
            // phép hoàn không phải là đã hoàn.
            adjustment.Status = PaymentAdjustmentStatus.Approved;
            balanceAfter = balanceBefore;
        }
        else
        {
            adjustment.Status = PaymentAdjustmentStatus.Completed;
            adjustment.CompletedAtUtc = now;
            adjustment.ResolvedAt = now;

            balanceAfter = balanceBefore with
            {
                ObligationReduction = balanceBefore.ObligationReduction + adjustment.Amount
            };
        }

        // SSOT §4: Issued → Void CHỈ khi một Correction toàn phần được duyệt trên hoá đơn chưa
        // thu đồng nào. Đã có tiền vào thì phải đối soát qua Refund, không xoá dấu vết.
        if (adjustment.Type == PaymentAdjustmentType.Correction
            && balanceAfter.NetPayable <= 0m
            && balanceBefore.GrossCollected == 0m)
        {
            invoice.Status = InvoiceStatus.Void;
        }
        else
        {
            invoice.Status = InvoiceMath.DeriveStatus(invoice.Status, balanceAfter);
        }

        // BR-30 — một Discount/Correction có thể kéo nghĩa vụ xuống bằng số đã thu, tức là
        // hoá đơn vừa được trả đủ mà không có đồng nào chạy qua đường thu.
        await packageActivation.ActivateIfObligationMetAsync(invoice, balanceAfter, actorUserId, ct);

        audit.Write(new AuditEntry(
            actorUserId, "APPROVE_PAYMENT_ADJUSTMENT", nameof(PaymentAdjustment), adjustmentId.ToString(),
            OldValue: $"{{\"status\":\"{PaymentAdjustmentStatus.Requested}\",\"amount\":{previousAmount}}}",
            NewValue: $"{{\"status\":\"{adjustment.Status}\",\"amount\":{adjustment.Amount},"
                      + $"\"invoiceStatus\":\"{invoice.Status}\"}}",
            Reason: request.Reason.Trim()));

        await db.SaveChangesAsync(ct);
        await transaction.CommitAsync(ct);

        return await GetOneAsync(adjustmentId, ct);
    }

    /// <summary>
    /// BR-42 v1.4 — Lễ tân xác nhận đã thực trả một Refund Approved. Đây là thời điểm DUY NHẤT
    /// <c>RefundedAmount</c> tăng, và là ngày mà báo cáo thu ròng dùng để quy kỳ (BR-43).
    /// </summary>
    public async Task<PaymentAdjustmentResponse> CompleteRefundAsync(
        Guid adjustmentId,
        CompleteAdjustmentRequest request,
        Guid actorUserId,
        CancellationToken ct = default)
    {
        if (!Enum.TryParse<PaymentMethod>(request.RefundMethod, ignoreCase: true, out var method))
        {
            throw new BadRequestException(
                "invalid_payment_method",
                $"Hình thức hoàn tiền không hợp lệ: '{request.RefundMethod}'. Hợp lệ: Cash, Card, Transfer, EWallet.");
        }

        var reference = string.IsNullOrWhiteSpace(request.RefundReferenceCode)
            ? null
            : request.RefundReferenceCode.Trim();

        // Tiền mặt tại quầy có actor + thời điểm + Audit làm bằng chứng; mọi kênh còn lại đi
        // qua hệ thống khác nên phải có mã đối soát, nếu không thì không ai chứng minh được
        // khoản này đã thực sự ra khỏi tài khoản trung tâm.
        if (method != PaymentMethod.Cash && reference is null)
        {
            throw new BadRequestException(
                "refund_reference_required",
                $"Hoàn tiền bằng {method} phải có mã tham chiếu giao dịch (BR-42).");
        }

        await using var transaction = await db.Database.BeginTransactionAsync(ct);

        var adjustment = await LockAdjustmentAsync(adjustmentId, ct);

        if (adjustment.Type != PaymentAdjustmentType.Refund)
        {
            throw new ConflictException(
                "not_a_refund",
                $"Chỉ Refund mới cần xác nhận thực trả; điều chỉnh này là {adjustment.Type}.");
        }

        // Retry của cùng một thao tác không được tạo thêm một lần hoàn nữa (BR-42).
        if (adjustment.Status != PaymentAdjustmentStatus.Approved)
        {
            throw new ConflictException(
                "adjustment_not_approved",
                adjustment.Status == PaymentAdjustmentStatus.Completed
                    ? "Khoản hoàn này đã được xác nhận thực trả trước đó."
                    : $"Chỉ Refund đã duyệt mới xác nhận thực trả được; trạng thái hiện tại: {adjustment.Status}.");
        }

        var invoice = await db.Set<Invoice>().SingleAsync(i => i.InvoiceId == adjustment.InvoiceId, ct);

        // Đọc lại số dư SAU khi đã khoá bản ghi: giữa lúc duyệt và lúc trả tiền, hoá đơn có
        // thể đã có thêm khoản hoàn khác hoặc thêm khoản thu, nên trần lúc duyệt không còn
        // đúng nữa.
        var balanceBefore = await invoiceQuery.GetBalanceAsync(adjustment.InvoiceId, ct);

        if (adjustment.Amount > balanceBefore.MaxRefundable)
        {
            throw new ConflictException(
                "refund_exceeds_collected",
                $"Số tiền hoàn ({adjustment.Amount:N0} VND) vượt quá số thực thu còn có thể hoàn "
                + $"({balanceBefore.MaxRefundable:N0} VND).");
        }

        if (adjustment.Amount > balanceBefore.RefundDue)
        {
            throw new ConflictException(
                "refund_exceeds_refund_due",
                $"Số tiền hoàn ({adjustment.Amount:N0} VND) vượt quá khoản cần hoàn hiện tại "
                + $"({balanceBefore.RefundDue:N0} VND). Cần có căn cứ giảm nghĩa vụ trước (BR-52).");
        }

        var now = clock.UtcNow;

        adjustment.Status = PaymentAdjustmentStatus.Completed;
        adjustment.CompletedAtUtc = now;
        adjustment.CompletedByUserId = actorUserId;
        adjustment.RefundMethod = method;
        adjustment.RefundReferenceCode = reference;
        adjustment.ResolvedAt = now;

        var balanceAfter = balanceBefore with
        {
            RefundedAmount = balanceBefore.RefundedAmount + adjustment.Amount
        };

        // BR-40: Paid ở lại Paid — DeriveStatus tự giữ. Gọi ở đây để hoá đơn chưa Paid cũng
        // được cập nhật đúng.
        invoice.Status = InvoiceMath.DeriveStatus(invoice.Status, balanceAfter);

        var referenceJson = reference is null ? "null" : $"\"{reference}\"";

        audit.Write(new AuditEntry(
            actorUserId, "COMPLETE_PAYMENT_REFUND", nameof(PaymentAdjustment), adjustmentId.ToString(),
            OldValue: $"{{\"status\":\"{PaymentAdjustmentStatus.Approved}\","
                      + $"\"refundedAmount\":{balanceBefore.RefundedAmount}}}",
            NewValue: $"{{\"status\":\"{PaymentAdjustmentStatus.Completed}\",\"amount\":{adjustment.Amount},"
                      + $"\"method\":\"{method}\",\"reference\":{referenceJson},"
                      + $"\"refundedAmount\":{balanceAfter.RefundedAmount},\"completedAtUtc\":\"{now:O}\"}}",
            Reason: request.Note.Trim()));

        await db.SaveChangesAsync(ct);
        await transaction.CommitAsync(ct);

        return await GetOneAsync(adjustmentId, ct);
    }

    public async Task<PaymentAdjustmentResponse> RejectAsync(
        Guid adjustmentId,
        string reason,
        Guid actorUserId,
        CancellationToken ct = default)
    {
        var adjustment = await db.Set<PaymentAdjustment>()
            .SingleOrDefaultAsync(a => a.AdjustmentId == adjustmentId, ct)
            ?? throw new NotFoundException("adjustment_not_found", "Không tìm thấy yêu cầu điều chỉnh.");

        if (adjustment.Status != PaymentAdjustmentStatus.Requested)
        {
            throw new ConflictException(
                "adjustment_already_resolved",
                $"Yêu cầu đang ở trạng thái {adjustment.Status}, không từ chối lại được.");
        }

        if (adjustment.RequestedByUserId == actorUserId)
        {
            throw new ForbiddenException(
                "cannot_approve_own_request",
                "Không được tự xử lý yêu cầu điều chỉnh do chính mình tạo (BR-42).");
        }

        var now = clock.UtcNow;

        adjustment.Status = PaymentAdjustmentStatus.Rejected;
        adjustment.ApprovedByUserId = actorUserId;
        adjustment.ApprovedAtUtc = now;
        adjustment.ResolvedAt = now;

        // Rejected KHÔNG đụng vào hoá đơn: chỉ Adjustment COMPLETED mới vào công thức BR-41.
        audit.Write(new AuditEntry(
            actorUserId, "REJECT_PAYMENT_ADJUSTMENT", nameof(PaymentAdjustment), adjustmentId.ToString(),
            OldValue: $"{{\"status\":\"{PaymentAdjustmentStatus.Requested}\"}}",
            NewValue: $"{{\"status\":\"{PaymentAdjustmentStatus.Rejected}\"}}",
            Reason: reason.Trim()));

        await db.SaveChangesAsync(ct);

        return await GetOneAsync(adjustmentId, ct);
    }

    /// <summary>
    /// Khoá cả hoá đơn lẫn adjustment trong transaction hiện tại (BR-41/42).
    ///
    /// Cần CẢ HAI khoá vì có hai kiểu đua khác nhau:
    /// - Hai request trên CÙNG một adjustment (retry, double-click) → khoá adjustment chặn.
    /// - Hai request trên HAI adjustment khác nhau của cùng hoá đơn → khoá adjustment không
    ///   chặn được gì, vì đó là hai hàng khác nhau; chỉ khoá hoá đơn mới tuần tự hoá được,
    ///   và trần <c>MaxRefundable</c>/<c>RefundDue</c> là đại lượng của hoá đơn.
    ///
    /// Thứ tự khoá LUÔN là hoá đơn → adjustment, giống thứ tự ở
    /// <c>PaymentRecordingService</c>. Hai đường ghi khoá ngược thứ tự nhau là công thức
    /// deadlock.
    /// </summary>
    private async Task<PaymentAdjustment> LockAdjustmentAsync(Guid adjustmentId, CancellationToken ct)
    {
        var invoiceId = await db.Set<PaymentAdjustment>()
            .AsNoTracking()
            .Where(a => a.AdjustmentId == adjustmentId)
            .Select(a => (Guid?)a.InvoiceId)
            .SingleOrDefaultAsync(ct)
            ?? throw new NotFoundException("adjustment_not_found", "Không tìm thấy yêu cầu điều chỉnh.");

        await db.Database.ExecuteSqlRawAsync(
            "SELECT 1 FROM invoices WHERE invoice_id = {0} FOR UPDATE", [invoiceId], ct);

        var locked = await db.Set<PaymentAdjustment>()
            .FromSqlRaw("SELECT * FROM payment_adjustments WHERE adjustment_id = {0} FOR UPDATE", adjustmentId)
            .ToListAsync(ct);

        return locked.SingleOrDefault()
               ?? throw new NotFoundException("adjustment_not_found", "Không tìm thấy yêu cầu điều chỉnh.");
    }

    /// <summary>
    /// Trần của một điều chỉnh, khác nhau theo loại (BR-41/52 v1.4):
    /// - Discount/Correction giảm nghĩa vụ ⇒ không vượt nghĩa vụ còn lại.
    /// - Refund trả lại tiền đã thu ⇒ không vượt số thực thu còn có thể hoàn.
    /// </summary>
    private static void EnsureWithinCeiling(PaymentAdjustmentType type, decimal amount, InvoiceBalance balance)
    {
        if (amount <= 0m)
        {
            throw new BadRequestException("invalid_adjustment_amount", "Số tiền điều chỉnh phải lớn hơn 0.");
        }

        if (type == PaymentAdjustmentType.Refund)
        {
            if (amount > balance.MaxRefundable)
            {
                throw new ConflictException(
                    "adjustment_exceeds_invoice",
                    $"Số tiền hoàn vượt quá số thực thu còn có thể hoàn ({balance.MaxRefundable:N0} VND).");
            }

            return;
        }

        if (amount > balance.NetPayable)
        {
            throw new ConflictException(
                "adjustment_exceeds_invoice",
                $"Số tiền điều chỉnh vượt quá nghĩa vụ còn lại của hóa đơn ({balance.NetPayable:N0} VND).");
        }
    }

    private async Task<PaymentAdjustmentResponse> GetOneAsync(Guid adjustmentId, CancellationToken ct)
        => await db.Set<PaymentAdjustment>()
               .AsNoTracking()
               .Where(a => a.AdjustmentId == adjustmentId)
               .Select(InvoiceQueryService.AdjustmentProjection())
               .SingleOrDefaultAsync(ct)
           ?? throw new NotFoundException("adjustment_not_found", "Không tìm thấy yêu cầu điều chỉnh.");

    private static PaymentAdjustmentStatus ParseStatus(string status)
        => Enum.TryParse<PaymentAdjustmentStatus>(status, ignoreCase: true, out var parsed)
            ? parsed
            : throw new BadRequestException("invalid_status", $"Trạng thái điều chỉnh không hợp lệ: '{status}'.");
}
