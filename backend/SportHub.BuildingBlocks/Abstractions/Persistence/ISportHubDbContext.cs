using Microsoft.EntityFrameworkCore;

namespace SportHub.BuildingBlocks.Abstractions.Persistence;

public interface ISportHubDbContext
{
    DbSet<TEntity> Set<TEntity>() where TEntity : class;

    Task<int> SaveChangesAsync(CancellationToken cancellationToken = default);
}
