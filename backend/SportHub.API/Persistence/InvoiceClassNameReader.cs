using Microsoft.EntityFrameworkCore;
using SportHub.Payment.Application.Interfaces;

namespace SportHub.API.Persistence;

// Resolve course names in the host without coupling Payment to Scheduling entities.
public sealed class InvoiceClassNameReader(SportHubDbContext db) : IInvoiceClassNameReader
{
    public async Task<IReadOnlyDictionary<int, string>> GetNamesAsync(
        IReadOnlyCollection<int> classIds, CancellationToken ct = default)
        => await db.Classes.AsNoTracking()
            .Where(course => classIds.Contains(course.ClassId))
            .ToDictionaryAsync(course => course.ClassId, course => course.Name, ct);
}
