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
/// Điều chỉnh/hoàn tiền — BR-40 (hoá đơn không bao giờ bị xoá, mọi sửa đổi đi qua đây),
/// BR-42 (Lễ tân tạo yêu cầu, Manager duyệt, không tự duyệt), BR-52 (số tiền hoàn mặc định).
///
/// Vòng đời: Requested → Approved → Completed, hoặc Requested → Rejected (SSOT §4).
/// Approve và Completed gộp làm một bước: ở MVP tiền mặt được trả tại quầy ngay khi Manager
/// duyệt, không có bước đối soát với cổng ngoài nào nằm giữa hai trạng thái đó.
/// </summary>
public sealed class PaymentAdjustmentService(
    ISportHubDbContext db,
    IInvoiceQueryService invoiceQuery,
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

        // Trần của yêu cầu: không điều chỉnh vượt quá phần chưa bị điều chỉnh của hoá đơn.
        // Cố tình KHÔNG so với TotalCollected — hoàn tiền trên hoá đơn đã thu đủ chính là ca
        // dùng chính của BR-52 (xem implementation-decisions.md C1).
        if (amount > balance.NetPayable)
        {
            throw new ConflictException(
                "adjustment_exceeds_invoice",
                $"Số tiền điều chỉnh vượt quá giá trị còn lại của hóa đơn ({balance.NetPayable:N0} VND).");
        }

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

        var adjustment = await db.Set<PaymentAdjustment>()
            .SingleOrDefaultAsync(a => a.AdjustmentId == adjustmentId, ct)
            ?? throw new NotFoundException("adjustment_not_found", "Không tìm thấy yêu cầu điều chỉnh.");

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

        // BR-52 — Manager được ghi đè số tiền mặc định khi phê duyệt.
        if (request.OverrideAmount is not null)
        {
            var overridden = decimal.Truncate(request.OverrideAmount.Value);

            if (overridden > balanceBefore.NetPayable)
            {
                throw new ConflictException(
                    "adjustment_exceeds_invoice",
                    $"Số tiền ghi đè vượt quá giá trị còn lại của hóa đơn ({balanceBefore.NetPayable:N0} VND).");
            }

            adjustment.Amount = overridden;
        }

        // Approve và Completed trong cùng một bước — xem ghi chú ở đầu class.
        adjustment.Status = PaymentAdjustmentStatus.Completed;
        adjustment.ApprovedByUserId = actorUserId;
        adjustment.ResolvedAt = clock.UtcNow;

        var balanceAfter = balanceBefore with
        {
            CompletedAdjustments = balanceBefore.CompletedAdjustments + adjustment.Amount
        };

        // SSOT §4: Issued → Void CHỈ khi một Correction toàn phần được duyệt. Hoá đơn đã thu
        // tiền thì không Void được — tiền đã vào thì phải đối soát qua Refund, không xoá dấu vết.
        if (adjustment.Type == PaymentAdjustmentType.Correction
            && balanceAfter.NetPayable <= 0m
            && balanceBefore.TotalCollected == 0m)
        {
            invoice.Status = InvoiceStatus.Void;
        }
        else
        {
            invoice.Status = InvoiceMath.DeriveStatus(invoice.Status, balanceAfter);
        }

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

        adjustment.Status = PaymentAdjustmentStatus.Rejected;
        adjustment.ApprovedByUserId = actorUserId;
        adjustment.ResolvedAt = clock.UtcNow;

        // Rejected KHÔNG trừ vào hoá đơn: chỉ Adjustment COMPLETED mới vào công thức BR-41.
        audit.Write(new AuditEntry(
            actorUserId, "REJECT_PAYMENT_ADJUSTMENT", nameof(PaymentAdjustment), adjustmentId.ToString(),
            OldValue: $"{{\"status\":\"{PaymentAdjustmentStatus.Requested}\"}}",
            NewValue: $"{{\"status\":\"{PaymentAdjustmentStatus.Rejected}\"}}",
            Reason: reason.Trim()));

        await db.SaveChangesAsync(ct);

        return await GetOneAsync(adjustmentId, ct);
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
