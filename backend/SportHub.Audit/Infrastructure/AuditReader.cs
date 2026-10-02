using Microsoft.EntityFrameworkCore;
using SportHub.BuildingBlocks.Abstractions.Audit;
using SportHub.BuildingBlocks.Abstractions.Persistence;

namespace SportHub.Audit.Infrastructure;

public sealed class AuditReader(ISportHubDbContext db) : IAuditReader
{
    public Task<string?> FindNewValueAsync(Guid actorId, string action, string targetEntity, string targetId,
        CancellationToken cancellationToken = default)
        => db.Set<AuditLog>().AsNoTracking().Where(x => x.UserId == actorId && x.Action == action
            && x.TargetEntity == targetEntity && x.TargetId == targetId)
            .OrderByDescending(x => x.Timestamp).Select(x => x.NewValue).FirstOrDefaultAsync(cancellationToken);
}
