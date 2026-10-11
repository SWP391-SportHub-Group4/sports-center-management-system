using Microsoft.EntityFrameworkCore;
using SportHub.BuildingBlocks.Abstractions.Persistence;
using SportHub.BuildingBlocks.Abstractions.Training;
using SportHub.Training.Domain.Entities;

namespace SportHub.Training.Application.Services;

public sealed class PersonalTrainingScheduleReader(ISportHubDbContext db) : IPersonalTrainingScheduleReader
{
    public Task<bool> CoachHasFutureSessionsAsync(Guid coachId, DateTime fromUtc, CancellationToken cancellationToken = default)
        => db.Set<PtSession>().AsNoTracking()
            .AnyAsync(s => s.CoachId == coachId && s.Status == PtSessionStatus.Scheduled && s.StartAtUtc > fromUtc, cancellationToken);

    public Task<bool> AnyFutureSessionInRoomsAsync(IReadOnlyCollection<int> roomIds, DateTime fromUtc, CancellationToken cancellationToken = default)
        => roomIds.Count == 0
            ? Task.FromResult(false)
            : db.Set<PtSession>().AsNoTracking()
                .AnyAsync(s => s.RoomId != null && roomIds.Contains(s.RoomId.Value)
                               && s.Status == PtSessionStatus.Scheduled && s.StartAtUtc > fromUtc, cancellationToken);
}
