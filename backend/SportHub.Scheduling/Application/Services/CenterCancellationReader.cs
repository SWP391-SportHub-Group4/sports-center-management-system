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
        var classes = await ClassQuery().Where(x => x.MemberId == memberId && x.At >= sinceUtc).ToListAsync(ct);
        var rentals = await RentalQuery().Where(x => x.MemberId == memberId && x.At >= sinceUtc).ToListAsync(ct);
        return Merge(classes, rentals);
    }

    public async Task<IReadOnlyList<CenterCancelledEntitlement>> ListCancelledBetweenAsync(DateTime fromUtc,
        DateTime toUtc, int skip, int take, CancellationToken ct = default)
    {
        // Mỗi nguồn lấy tối đa skip+take dòng cũ nhất rồi gộp để phân trang ổn định.
        var limit = skip + take;
        var classes = await ClassQuery().Where(x => x.At >= fromUtc && x.At < toUtc)
            .OrderBy(x => x.At).ThenBy(x => x.ItemId).Take(limit).ToListAsync(ct);
        var rentals = await RentalQuery().Where(x => x.At >= fromUtc && x.At < toUtc)
            .OrderBy(x => x.At).ThenBy(x => x.ItemId).Take(limit).ToListAsync(ct);
        return Merge(classes, rentals).Skip(skip).Take(take).ToList();
    }

    public async Task<CenterCancelledEntitlement?> GetAsync(Guid invoiceItemId, CancellationToken ct = default)
    {
        var classes = await ClassQuery().Where(x => x.ItemId == invoiceItemId).ToListAsync(ct);
        var rentals = await RentalQuery().Where(x => x.ItemId == invoiceItemId).ToListAsync(ct);
        return Merge(classes, rentals).FirstOrDefault();
    }

    private IQueryable<Row> ClassQuery()
        => from e in db.Set<Enrollment>().AsNoTracking()
           join c in db.Set<Class>().AsNoTracking() on e.ClassId equals c.ClassId
           where e.Status == EnrollmentStatus.CancelledByCenter && e.InvoiceItemId != null && e.EndedAt != null
           select new Row("Class", e.InvoiceItemId!.Value, e.MemberId, c.Name, e.EndedAt!.Value, null);

    private IQueryable<Row> RentalQuery()
        => from r in db.Set<CourtRental>().AsNoTracking()
           where r.Status == CourtRentalStatus.Cancelled && r.InvoiceItemId != null && r.CancelledAtUtc != null
               && r.CancelReason != null && r.CancelReason.StartsWith(CenterFaultPrefix)
           select new Row("CourtRental", r.InvoiceItemId!.Value, r.MemberId, "Court rental",
               r.CancelledAtUtc!.Value, r.CancelReason!.Substring(CenterFaultPrefix.Length));

    private static List<CenterCancelledEntitlement> Merge(IEnumerable<Row> classes, IEnumerable<Row> rentals)
        => classes.Concat(rentals).OrderBy(x => x.At).ThenBy(x => x.ItemId)
            .Select(x => new CenterCancelledEntitlement(x.ItemId, x.MemberId, x.Kind, x.Name, x.At, x.Reason)).ToList();

    private sealed record Row(string Kind, Guid ItemId, Guid MemberId, string Name, DateTime At, string? Reason);
}
