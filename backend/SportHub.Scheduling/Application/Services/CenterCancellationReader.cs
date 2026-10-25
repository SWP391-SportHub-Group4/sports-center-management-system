using Microsoft.EntityFrameworkCore;
using SportHub.BuildingBlocks.Abstractions.Persistence;
using SportHub.BuildingBlocks.Abstractions.Scheduling;
using SportHub.Scheduling.Domain.Entities;
using SportHub.Scheduling.Domain.Enums;
using SportHub.Scheduling.Rental.Domain;

namespace SportHub.Scheduling.Application.Services;

/// <summary>Đọc ghi danh lớp và lượt thuê sân do trung tâm hủy (không ghi dữ liệu).</summary>
public sealed class CenterCancellationReader(ISportHubDbContext db) : ICenterCancellationReader
{
    private const string CenterFaultPrefix = "CenterFault:";

    public async Task<IReadOnlyList<CenterCancelledEntitlement>> ListForMemberAsync(Guid memberId, DateTime sinceUtc,
        CancellationToken ct = default)
    {
        var classes = await ClassQuery(memberId: memberId, fromUtc: sinceUtc).ToListAsync(ct);
        var rentals = await RentalQuery(memberId: memberId, fromUtc: sinceUtc).ToListAsync(ct);
        return Merge(classes, rentals);
    }

    public async Task<IReadOnlyList<CenterCancelledEntitlement>> ListCancelledBetweenAsync(DateTime fromUtc,
        DateTime toUtc, int skip, int take, CancellationToken ct = default)
    {
        // Mỗi nguồn lấy tối đa skip+take dòng cũ nhất rồi gộp để phân trang ổn định.
        var limit = skip + take;
        var classes = await ClassQuery(fromUtc: fromUtc, toUtc: toUtc, limit: limit).ToListAsync(ct);
        var rentals = await RentalQuery(fromUtc: fromUtc, toUtc: toUtc, limit: limit).ToListAsync(ct);
        return Merge(classes, rentals).Skip(skip).Take(take).ToList();
    }

    public async Task<CenterCancelledEntitlement?> GetAsync(Guid invoiceItemId, CancellationToken ct = default)
    {
        var classes = await ClassQuery(itemId: invoiceItemId).ToListAsync(ct);
        var rentals = await RentalQuery(itemId: invoiceItemId).ToListAsync(ct);
        return Merge(classes, rentals).FirstOrDefault();
    }

    private IQueryable<Row> ClassQuery(Guid? memberId = null, DateTime? fromUtc = null,
        DateTime? toUtc = null, Guid? itemId = null, int? limit = null)
    {
        var query = db.Set<Enrollment>().AsNoTracking()
            .Where(e => e.Status == EnrollmentStatus.CancelledByCenter && e.InvoiceItemId != null && e.EndedAt != null);
        if (memberId.HasValue) query = query.Where(e => e.MemberId == memberId.Value);
        if (fromUtc.HasValue) query = query.Where(e => e.EndedAt >= fromUtc.Value);
        if (toUtc.HasValue) query = query.Where(e => e.EndedAt < toUtc.Value);
        if (itemId.HasValue) query = query.Where(e => e.InvoiceItemId == itemId.Value);
        query = query.OrderBy(e => e.EndedAt).ThenBy(e => e.InvoiceItemId);
        if (limit.HasValue) query = query.Take(limit.Value);
        return from e in query
               join c in db.Set<Class>().AsNoTracking() on e.ClassId equals c.ClassId
               select new Row("Class", e.InvoiceItemId!.Value, e.MemberId, c.Name, e.EndedAt!.Value, null);
    }

    private IQueryable<Row> RentalQuery(Guid? memberId = null, DateTime? fromUtc = null,
        DateTime? toUtc = null, Guid? itemId = null, int? limit = null)
    {
        var query = db.Set<CourtRental>().AsNoTracking()
            .Where(r => r.Status == CourtRentalStatus.Cancelled && r.InvoiceItemId != null && r.CancelledAtUtc != null
                && r.CancelReason != null && r.CancelReason.StartsWith(CenterFaultPrefix));
        if (memberId.HasValue) query = query.Where(r => r.MemberId == memberId.Value);
        if (fromUtc.HasValue) query = query.Where(r => r.CancelledAtUtc >= fromUtc.Value);
        if (toUtc.HasValue) query = query.Where(r => r.CancelledAtUtc < toUtc.Value);
        if (itemId.HasValue) query = query.Where(r => r.InvoiceItemId == itemId.Value);
        query = query.OrderBy(r => r.CancelledAtUtc).ThenBy(r => r.InvoiceItemId);
        if (limit.HasValue) query = query.Take(limit.Value);
        return query.Select(r => new Row("CourtRental", r.InvoiceItemId!.Value, r.MemberId, "Court rental",
            r.CancelledAtUtc!.Value, r.CancelReason!.Substring(CenterFaultPrefix.Length)));
    }

    private static List<CenterCancelledEntitlement> Merge(IEnumerable<Row> classes, IEnumerable<Row> rentals)
        => classes.Concat(rentals).OrderBy(x => x.At).ThenBy(x => x.ItemId)
            .Select(x => new CenterCancelledEntitlement(x.ItemId, x.MemberId, x.Kind, x.Name, x.At, x.Reason)).ToList();

    private sealed record Row(string Kind, Guid ItemId, Guid MemberId, string Name, DateTime At, string? Reason);
}
