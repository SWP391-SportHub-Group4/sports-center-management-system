using Microsoft.EntityFrameworkCore;
using SportHub.BuildingBlocks.Abstractions.Persistence;
using SportHub.BuildingBlocks.SharedKernel.Errors;
using SportHub.BuildingBlocks.SharedKernel.Pagination;
using SportHub.BuildingBlocks.SharedKernel.Time;
using SportHub.Membership.Domain.Entities;
using SportHub.Payment.Application.DTOs;
using SportHub.Payment.Application.Interfaces;
using SportHub.Payment.Domain.Rules;

namespace SportHub.Payment.Application.Services;

public sealed class InvoiceQueryService(ISportHubDbContext db, IClock clock) : IInvoiceQueryService
{
    /// <summary>
    /// Hàng thô lấy từ SQL: chỉ các TỔNG, chưa suy ra đại lượng nào.
    ///
    /// Mọi phép suy ra (NetPayable, Outstanding, RefundedAmount) làm trong C# qua
    /// <see cref="InvoiceBalance"/>. Viết chúng thành biểu thức LINQ sẽ phải lặp lại cùng
    /// một tổng con bốn, năm lần trong một Select và đó là nơi định nghĩa BR-41 rất dễ trôi
    /// khỏi bản gốc ở InvoiceMath.
    /// </summary>
    private sealed record InvoiceRow(
        Guid InvoiceId,
        string InvoiceNumber,
        Guid MemberId,
        string MemberEmail,
        string MemberName,
        decimal TotalAmount,
        decimal GrossCollected,
        decimal ObligationReduction,
        decimal RefundedAmount,
        InvoiceStatus Status,
        DateTime IssuedAt,
        DateTime DueDateUtc,
        DateTime? FirstDepositAtUtc,
        Guid? MemberPackageId);

    public async Task<PagedResult<InvoiceSummaryResponse>> SearchAsync(
        Guid? memberId,
        string? status,
        bool overdueOnly,
        string? keyword,
        int page,
        int pageSize,
        CancellationToken ct = default)
    {
        page = page < 1 ? 1 : page;
        pageSize = Math.Clamp(pageSize <= 0 ? 20 : pageSize, 1, 100);

        var now = clock.UtcNow;
        var query = db.Set<Invoice>().AsNoTracking();

        if (memberId is not null)
        {
            query = query.Where(i => i.MemberId == memberId);
        }

        if (!string.IsNullOrWhiteSpace(status))
        {
            var parsed = ParseStatus(status);
            query = query.Where(i => i.Status == parsed);
        }

        if (overdueOnly)
        {
            // BR-55: "quá hạn" là NHÃN tính khi đọc, không phải trạng thái lưu trong DB —
            // hoá đơn quá hạn không tự chuyển Void (BR-40 cấm sửa/xoá ngoài đường Adjustment).
            query = query.Where(i =>
                i.DueDateUtc < now && i.Status != InvoiceStatus.Paid && i.Status != InvoiceStatus.Void);
        }

        if (!string.IsNullOrWhiteSpace(keyword))
        {
            var term = keyword.Trim().ToLowerInvariant();
            query = query.Where(i =>
                i.InvoiceNumber.ToLower().Contains(term)
                || i.Member!.Email.ToLower().Contains(term)
                || (i.Member.Profile != null && i.Member.Profile.FullName.ToLower().Contains(term)));
        }

        var total = await query.CountAsync(ct);

        var rows = await query
            .OrderByDescending(i => i.IssuedAt)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .Select(RowProjection())
            .ToListAsync(ct);

        return new PagedResult<InvoiceSummaryResponse>
        {
            Items = [.. rows.Select(r => ToSummary(r, now))],
            Page = page,
            PageSize = pageSize,
            TotalCount = total
        };
    }

    public async Task<InvoiceDetailResponse> GetDetailAsync(Guid invoiceId, CancellationToken ct = default)
    {
        var now = clock.UtcNow;

        var row = await db.Set<Invoice>()
                      .AsNoTracking()
                      .Where(i => i.InvoiceId == invoiceId)
                      .Select(RowProjection())
                      .SingleOrDefaultAsync(ct)
                  ?? throw new NotFoundException("invoice_not_found", "Không tìm thấy hóa đơn.");

        var items = await db.Set<InvoiceItem>()
            .AsNoTracking()
            .Where(it => it.InvoiceId == invoiceId)
            .Select(it => new InvoiceItemResponse(it.ItemId, it.Description, it.Amount, it.RelatedEntityType.ToString()))
            .ToListAsync(ct);

        var payments = await db.Set<Domain.Entities.Payment>()
            .AsNoTracking()
            .Where(p => p.InvoiceId == invoiceId)
            .OrderBy(p => p.PaidAt)
            .Select(p => new PaymentResponse(
                p.PaymentId, p.Amount, p.Method.ToString(), p.Status.ToString(), p.ReferenceCode,
                p.ReceivedByUserId,
                p.ReceivedByUser!.Profile != null ? p.ReceivedByUser.Profile.FullName : p.ReceivedByUser.Email,
                p.PaidAt))
            .ToListAsync(ct);

        var adjustments = await db.Set<PaymentAdjustment>()
            .AsNoTracking()
            .Where(a => a.InvoiceId == invoiceId)
            .OrderByDescending(a => a.CreatedAt)
            .Select(AdjustmentProjection())
            .ToListAsync(ct);

        // Gợi ý hoàn tiền (BR-52) tính sẵn để màn hình duyệt không phải gọi thêm endpoint.
        // Chỉ là gợi ý — Manager vẫn được ghi đè khi phê duyệt.
        var suggestedRefund = 0m;

        if (row.MemberPackageId is not null)
        {
            var packageInfo = await db.Set<MemberPackage>()
                .AsNoTracking()
                .Where(mp => mp.MemberPackageId == row.MemberPackageId)
                .Select(mp => new { MemberPackage = mp, Catalog = mp.Package })
                .SingleOrDefaultAsync(ct);

            if (packageInfo is not null)
            {
                suggestedRefund = RefundCalculator.SuggestDefault(
                    row.TotalAmount, packageInfo.MemberPackage, packageInfo.Catalog, VietnamTime.TodayLocal(clock));
            }
        }

        return new InvoiceDetailResponse(
            ToSummary(row, now), row.MemberPackageId, items, payments, adjustments, suggestedRefund);
    }

    public async Task<InvoiceBalance> GetBalanceAsync(Guid invoiceId, CancellationToken ct = default)
    {
        var row = await db.Set<Invoice>()
                      .AsNoTracking()
                      .Where(i => i.InvoiceId == invoiceId)
                      .Select(RowProjection())
                      .SingleOrDefaultAsync(ct)
                  ?? throw new NotFoundException("invoice_not_found", "Không tìm thấy hóa đơn.");

        return new InvoiceBalance(row.TotalAmount, row.GrossCollected, row.ObligationReduction, row.RefundedAmount);
    }

    private static InvoiceSummaryResponse ToSummary(InvoiceRow row, DateTime now)
    {
        var balance = new InvoiceBalance(row.TotalAmount, row.GrossCollected, row.ObligationReduction, row.RefundedAmount);

        return new InvoiceSummaryResponse(
            row.InvoiceId,
            row.InvoiceNumber,
            row.MemberId,
            row.MemberEmail,
            row.MemberName,
            row.TotalAmount,
            balance.GrossCollected,
            balance.ObligationReduction,
            balance.RefundedAmount,
            balance.NetCollected,
            balance.NetPayable,
            balance.Outstanding,
            balance.RefundDue,
            row.Status.ToString(),
            row.IssuedAt,
            row.DueDateUtc,
            row.FirstDepositAtUtc,
            row.DueDateUtc < now && row.Status != InvoiceStatus.Paid && row.Status != InvoiceStatus.Void);
    }

    private static System.Linq.Expressions.Expression<Func<Invoice, InvoiceRow>> RowProjection()
        => i => new InvoiceRow(
            i.InvoiceId,
            i.InvoiceNumber,
            i.MemberId,
            i.Member!.Email,
            i.Member.Profile != null ? i.Member.Profile.FullName : string.Empty,
            i.TotalAmount,

            // BR-41: chỉ Payment SUCCESS mới tính vào tổng đã thu.
            i.Payments.Where(p => p.Status == PaymentStatus.Success).Sum(p => (decimal?)p.Amount) ?? 0m,

            // BR-41 v1.4 — giảm NGHĨA VỤ: chỉ Discount/Correction đã Completed.
            i.Adjustments
                .Where(a => a.Status == PaymentAdjustmentStatus.Completed
                            && a.Type != PaymentAdjustmentType.Refund)
                .Sum(a => (decimal?)a.Amount) ?? 0m,

            // BR-41 v1.4 — giảm TIỀN THỰC THU: chỉ Refund đã Completed (đã có xác nhận thực trả).
            i.Adjustments
                .Where(a => a.Status == PaymentAdjustmentStatus.Completed
                            && a.Type == PaymentAdjustmentType.Refund)
                .Sum(a => (decimal?)a.Amount) ?? 0m,
            i.Status,
            i.IssuedAt,
            i.DueDateUtc,
            i.FirstDepositAtUtc,
            i.MemberPackageId);

    internal static System.Linq.Expressions.Expression<Func<PaymentAdjustment, PaymentAdjustmentResponse>>
        AdjustmentProjection()
        => a => new PaymentAdjustmentResponse(
            a.AdjustmentId,
            a.InvoiceId,
            a.Invoice!.InvoiceNumber,
            a.PaymentId,
            a.Type.ToString(),
            a.Amount,
            a.RequestedAmount,
            a.Reason,
            a.Status.ToString(),
            a.RequestedByUserId,
            a.RequestedByUser!.Profile != null ? a.RequestedByUser.Profile.FullName : a.RequestedByUser.Email,
            a.ApprovedByUserId,
            a.ApprovedByUser == null
                ? null
                : a.ApprovedByUser.Profile != null ? a.ApprovedByUser.Profile.FullName : a.ApprovedByUser.Email,
            a.CompletedByUserId,
            a.CompletedByUser == null
                ? null
                : a.CompletedByUser.Profile != null ? a.CompletedByUser.Profile.FullName : a.CompletedByUser.Email,
            a.RefundMethod == null ? null : a.RefundMethod.ToString(),
            a.RefundReferenceCode,
            a.CreatedAt,
            a.ApprovedAtUtc,
            a.CompletedAtUtc,

            // Cờ cho màn hình quầy: Refund đã duyệt nhưng tiền chưa ra khỏi quầy (BR-42 v1.4).
            a.Type == PaymentAdjustmentType.Refund && a.Status == PaymentAdjustmentStatus.Approved,
            a.ResolvedAt);

    private static InvoiceStatus ParseStatus(string status)
        => Enum.TryParse<InvoiceStatus>(status, ignoreCase: true, out var parsed)
            ? parsed
            : throw new BadRequestException("invalid_status", $"Trạng thái hóa đơn không hợp lệ: '{status}'.");
}
