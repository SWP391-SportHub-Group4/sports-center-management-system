using Microsoft.EntityFrameworkCore;
using SportHub.BuildingBlocks.Abstractions.Reporting;
using SportHub.Payment.Domain.Entities;
using SportHub.Scheduling.Domain.Entities;
using SportHub.Scheduling.Rental.Domain;

namespace SportHub.API.Persistence;

public sealed class RevenueDimensionReader(SportHubDbContext db) : IRevenueDimensionReader
{
    public async Task<IReadOnlyDictionary<Guid, RevenueDimension>> ReadAsync(
        IReadOnlyCollection<Guid> invoiceItemIds, CancellationToken ct = default)
    {
        var courses = await (from item in db.Set<InvoiceItem>().AsNoTracking()
                             join checkout in db.Set<CheckoutSession>() on item.InvoiceId equals checkout.InvoiceId
                             join course in db.Set<Class>() on checkout.ClassId equals course.ClassId
                             where invoiceItemIds.Contains(item.ItemId)
                             select new { item.ItemId, course.SportId, course.Sport!.Name })
            .Distinct().ToListAsync(ct);
        var result = courses.GroupBy(x => x.ItemId).ToDictionary(g => g.Key,
            g => new RevenueDimension(g.First().SportId, g.First().Name));
        var legacyCourses = await (from item in db.Set<InvoiceItem>().AsNoTracking()
                                   join hold in db.Set<SeatHold>() on item.RelatedEntityId equals hold.HoldId
                                   join course in db.Set<Class>() on hold.ClassId equals course.ClassId
                                   where invoiceItemIds.Contains(item.ItemId)
                                   select new { item.ItemId, course.SportId, course.Sport!.Name }).ToListAsync(ct);
        foreach (var course in legacyCourses)
            result.TryAdd(course.ItemId, new(course.SportId, course.Name));
        var rentals = await (from rental in db.Set<CourtRental>().AsNoTracking()
                             join sport in db.Set<SportHub.Scheduling.Catalog.Domain.Sport>() on rental.SportId equals sport.SportId
                             where rental.InvoiceItemId.HasValue && invoiceItemIds.Contains(rental.InvoiceItemId.Value)
                             select new { ItemId = rental.InvoiceItemId!.Value, rental.SportId, sport.Name, rental.ExternalCoachId })
            .ToListAsync(ct);
        foreach (var rental in rentals)
            result[rental.ItemId] = new(rental.SportId, rental.Name, rental.ExternalCoachId);
        var ptSports = await db.Set<SportHub.Scheduling.Catalog.Domain.Sport>().AsNoTracking()
            .Where(x => x.OperationType == SportHub.Scheduling.Catalog.Domain.SportOperationType.OneOnOne)
            .Select(x => new { x.SportId, x.Name }).Take(2).ToListAsync(ct);
        // Old PT entitlements carry no sport reference. Attribute only when the catalog is unambiguous.
        if (ptSports.Count == 1)
        {
            var ptItems = await db.Set<InvoiceItem>().AsNoTracking().Where(x => invoiceItemIds.Contains(x.ItemId)
                && x.ItemType == SportHub.Payment.Domain.Enums.InvoiceItemType.PT).Select(x => x.ItemId).ToListAsync(ct);
            foreach (var itemId in ptItems) result.TryAdd(itemId, new(ptSports[0].SportId, ptSports[0].Name));
        }
        return result;
    }
}
