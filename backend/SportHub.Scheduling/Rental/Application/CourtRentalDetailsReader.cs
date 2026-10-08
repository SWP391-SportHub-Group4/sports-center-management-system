using Microsoft.EntityFrameworkCore;
using SportHub.BuildingBlocks.Abstractions.Persistence;
using SportHub.BuildingBlocks.Abstractions.Scheduling;
using SportHub.Scheduling.Catalog.Domain;
using SportHub.Scheduling.Domain.Entities;
using SportHub.Scheduling.Rental.Domain;

namespace SportHub.Scheduling.Rental.Application;

public sealed class CourtRentalDetailsReader(ISportHubDbContext db) : ICourtRentalDetailsReader
{
    public async Task<IReadOnlyList<CourtRentalDetails>> ReadAsync(IReadOnlyCollection<Guid> rentalIds, CancellationToken ct = default)
        => await (from rental in db.Set<CourtRental>().AsNoTracking()
                  join room in db.Set<Room>() on rental.RoomId equals room.RoomId
                  join sport in db.Set<Sport>() on rental.SportId equals sport.SportId
                  where rentalIds.Contains(rental.CourtRentalId)
                  select new CourtRentalDetails(rental.CourtRentalId, room.Name, sport.Name,
                      rental.StartAtUtc, rental.EndAtUtc)).ToListAsync(ct);
}
