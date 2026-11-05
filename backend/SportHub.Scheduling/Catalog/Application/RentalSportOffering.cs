using Microsoft.EntityFrameworkCore;
using SportHub.BuildingBlocks.Abstractions.Audit;
using SportHub.BuildingBlocks.Abstractions.Persistence;
using SportHub.BuildingBlocks.Abstractions.Scheduling;
using SportHub.Scheduling.Catalog.Domain;

namespace SportHub.Scheduling.Catalog.Application;

internal static class RentalSportOffering
{
    public static async Task EnableAsync(ISportHubDbContext db, IAuditWriter audit, int sportId,
        Guid actorUserId, CancellationToken ct)
    {
        var offering = await db.Set<SportServiceOffering>().SingleOrDefaultAsync(
            s => s.SportId == sportId && s.ServiceType == SportServiceType.CourtRental, ct);
        if (offering?.IsEnabled == true) return;
        if (offering is null)
            db.Set<SportServiceOffering>().Add(new() { SportId = sportId, ServiceType = SportServiceType.CourtRental, IsEnabled = true });
        else offering.IsEnabled = true;
        audit.Write(new AuditEntry(actorUserId, "ENABLE_COURT_RENTAL", nameof(Sport), sportId.ToString()));
    }
}
