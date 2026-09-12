using Microsoft.EntityFrameworkCore;

namespace SportHub.BuildingBlocks.Abstractions.Persistence;

// Interface trừu tượng cho SportHubDbContext (implement thật ở SportHub.API —
// composition root, mục 6/mục 9). Tồn tại để tránh vòng lặp API <-> Identity:
// module nghiệp vụ cần truy vấn DB nhưng không được phép reference ngược lại
// SportHub.API. Chưa có Repository nào dùng tới ở đợt refactor thuần
// structural này — interface được tạo cùng lúc với việc dời SportHubDbContext
// sang SportHub.API (mục 1, mục 6).
public interface ISportHubDbContext
{
    DbSet<TEntity> Set<TEntity>() where TEntity : class;

    Task<int> SaveChangesAsync(CancellationToken cancellationToken = default);
}
