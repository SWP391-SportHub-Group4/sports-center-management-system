using System.Security.Cryptography;
using System.Text;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using SportHub.BuildingBlocks.Abstractions.Payment;
using SportHub.BuildingBlocks.Abstractions.Persistence;
using SportHub.BuildingBlocks.Abstractions.Scheduling;
using SportHub.BuildingBlocks.SharedKernel.Errors;
using SportHub.BuildingBlocks.SharedKernel.Time;
using SportHub.Identity.Domain.Entities;
using SportHub.Payment.Domain.Entities;
using SportHub.Payment.Domain.Enums;
using SportHub.Payment.Domain.Rules;
using SportHub.Payment.Wallet.Domain;

namespace SportHub.Payment.Application.Services;

/// <summary>
/// Hoàn tiền cho quyền lợi bị TRUNG TÂM hủy (lớp, lượt thuê sân, sự cố). Lúc hủy chỉ gửi thông báo;
/// Member tự chọn một trong hai cách, mỗi mục chỉ một lần:
/// (1) nhận 100% giá trị còn lại bằng điểm — hoàn tự động ngay; hoặc
/// (2) gửi yêu cầu hoàn tiền (Support Request loại PAYMENT) để Manager xử lý.
/// Quá <see cref="ChoiceWindow"/> kể từ lúc hủy mà Member không chọn thì hệ thống tự hoàn điểm.
/// Trạng thái được suy ra từ dữ liệu sẵn có (ledger điểm + yêu cầu hỗ trợ) nên không cần bảng riêng.
/// </summary>
public interface ICenterCancellationRefundService
{
    Task<IReadOnlyList<CenterCancellationOffer>> ListMineAsync(Guid memberId, CancellationToken ct = default);
    Task<CenterCancellationChoiceResult> ChoosePointsAsync(Guid memberId, Guid invoiceItemId, CancellationToken ct = default);
    Task<int> AutoRefundDueAsync(CancellationToken ct = default);
}

public sealed class CenterCancellationRefundService(ISportHubDbContext db, ICenterCancellationReader cancellations,
    IRefundCreditService refunds, IClock clock, ILogger<CenterCancellationRefundService> logger)
    : ICenterCancellationRefundService
{
    public static readonly TimeSpan ChoiceWindow = TimeSpan.FromDays(2);
    public const string NotePrefix = "CenterCancel:";
    private const int PageSize = 100;
    private const int MaxPages = 50;

    public const string StatusOffer = "Offer";
    public const string StatusPointsCredited = "PointsCredited";
    public const string StatusRefundRequested = "RefundRequested";

    public async Task<IReadOnlyList<CenterCancellationOffer>> ListMineAsync(Guid memberId, CancellationToken ct = default)
    {
        var rows = await cancellations.ListForMemberAsync(memberId, clock.UtcNow.AddDays(-90), ct);
        var offers = new List<CenterCancellationOffer>();
        foreach (var row in rows)
            if (await BuildAsync(row, ct) is { } offer) offers.Add(offer);
        return offers.OrderByDescending(x => x.CancelledAtUtc).ToList();
    }

    public async Task<CenterCancellationChoiceResult> ChoosePointsAsync(Guid memberId, Guid invoiceItemId,
        CancellationToken ct = default)
    {
        var row = await cancellations.GetAsync(invoiceItemId, ct)
            ?? throw new NotFoundException("center_cancellation_not_found", "No center cancellation found for this item.");
        if (row.MemberId != memberId)
            throw new ForbiddenException("center_cancellation_not_owned", "This cancellation does not belong to you.");
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        await refunds.LockPaidItemAsync(invoiceItemId, ct);
        var credited = await CreditedPointsAsync(invoiceItemId, ct);
        if (credited > 0)
        {
            await tx.RollbackAsync(ct);
            return new CenterCancellationChoiceResult(credited, true);
        }
        var item = await db.Set<InvoiceItem>().AsNoTracking().SingleAsync(x => x.ItemId == invoiceItemId, ct);
        if (await HasRefundRequestAsync(item.InvoiceId, ct))
            throw new ConflictException("center_cancellation_refund_requested",
                "A refund request was already sent for this invoice, so points can no longer be chosen.");
        var result = await refunds.CreditAsync(new RefundCreditRequest(invoiceItemId, 100, ReasonFor(row.Kind),
            EventIdFor(invoiceItemId)), ct);
        if (result.PointsCredited <= 0)
            throw new ConflictException("center_cancellation_nothing_to_refund", "Nothing is left to refund for this item.");
        await tx.CommitAsync(ct);
        return new CenterCancellationChoiceResult(result.PointsCredited, result.AlreadyApplied);
    }

    /// <summary>Tự hoàn điểm cho các mục quá hạn chọn mà Member chưa chọn gì. Trả về số mục đã hoàn.</summary>
    public async Task<int> AutoRefundDueAsync(CancellationToken ct = default)
    {
        var now = clock.UtcNow;
        var cutoff = now - ChoiceWindow;
        var from = now.AddDays(-60);
        var done = 0;
        for (var page = 0; page < MaxPages; page++)
        {
            var rows = await cancellations.ListCancelledBetweenAsync(from, cutoff, page * PageSize, PageSize, ct);
            if (rows.Count == 0) break;
            foreach (var row in rows)
            {
                ct.ThrowIfCancellationRequested();
                try
                {
                    if (await BuildAsync(row, ct) is not { Status: StatusOffer }) continue;
                    await using var tx = await db.Database.BeginTransactionAsync(ct);
                    await refunds.LockPaidItemAsync(row.InvoiceItemId, ct);
                    var item = await db.Set<InvoiceItem>().AsNoTracking().SingleAsync(x => x.ItemId == row.InvoiceItemId, ct);
                    if (await CreditedPointsAsync(row.InvoiceItemId, ct) > 0 || await HasRefundRequestAsync(item.InvoiceId, ct))
                    {
                        await tx.RollbackAsync(ct);
                        continue;
                    }
                    var result = await refunds.CreditAsync(new RefundCreditRequest(row.InvoiceItemId, 100,
                        ReasonFor(row.Kind), EventIdFor(row.InvoiceItemId)), ct);
                    await tx.CommitAsync(ct);
                    if (result.PointsCredited > 0 && !result.AlreadyApplied) done++;
                }
                catch (OperationCanceledException) { throw; }
                catch (Exception ex)
                {
                    db.ChangeTracker.Clear();
                    logger.LogWarning(ex, "Auto refund for center-cancelled item {ItemId} failed; it will retry.", row.InvoiceItemId);
                }
            }
            if (rows.Count < PageSize) break;
        }
        return done;
    }

    private async Task<CenterCancellationOffer?> BuildAsync(CenterCancelledEntitlement row, CancellationToken ct)
    {
        var item = await db.Set<InvoiceItem>().AsNoTracking().SingleOrDefaultAsync(x => x.ItemId == row.InvoiceItemId, ct);
        if (item is null) return null;
        var credited = await CreditedPointsAsync(row.InvoiceItemId, ct);
        var requested = await HasRefundRequestAsync(item.InvoiceId, ct);
        decimal remaining;
        try { remaining = await refunds.GetRemainingItemValueVndAsync(row.InvoiceItemId, ct); }
        catch (ConflictException) { remaining = 0m; }
        var points = RefundCalculator.PointsForRatio(remaining, 100);
        var status = credited > 0 ? StatusPointsCredited
            : requested ? StatusRefundRequested
            : points > 0 ? StatusOffer : null;
        return status is null ? null : new CenterCancellationOffer(row.InvoiceItemId, item.InvoiceId, row.Kind, row.Name,
            row.CancelledAtUtc, row.Reason, points, remaining, row.CancelledAtUtc + ChoiceWindow, status, credited);
    }

    private async Task<int> CreditedPointsAsync(Guid invoiceItemId, CancellationToken ct)
        => await db.Set<PointLedgerEntry>().AsNoTracking().Where(x => x.InvoiceItemId == invoiceItemId
                && x.ReferenceType == "SystemEvent" && x.EntryType == PointEntryType.Earn
                && x.Note != null && x.Note.StartsWith(NotePrefix))
            .SumAsync(x => (int?)x.Points, ct) ?? 0;

    private Task<bool> HasRefundRequestAsync(Guid invoiceId, CancellationToken ct)
        => db.Set<MemberSupportRequest>().AnyAsync(r => r.InvoiceId == invoiceId && r.Category == "PAYMENT"
            && r.Status != "REJECTED", ct);

    private static string ReasonFor(string kind)
        => kind == "CourtRental"
            ? $"{NotePrefix} points refund after the center cancelled your court rental"
            : $"{NotePrefix} points refund after the center cancelled your class";

    /// <summary>Event id ổn định theo từng mục để chọn điểm thủ công và tự hoàn không bao giờ cộng hai lần.</summary>
    private static Guid EventIdFor(Guid invoiceItemId)
        => new(MD5.HashData(Encoding.UTF8.GetBytes($"center-cancel:{invoiceItemId:N}")));
}

public sealed record CenterCancellationOffer(Guid InvoiceItemId, Guid InvoiceId, string Kind, string Name,
    DateTime CancelledAtUtc, string? Reason, int RefundPoints, decimal RemainingValueVnd, DateTime AutoRefundAtUtc,
    string Status, int CreditedPoints);

public sealed record CenterCancellationChoiceResult(int PointsCredited, bool AlreadyApplied);
