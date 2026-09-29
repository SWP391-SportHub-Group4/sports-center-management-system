using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.ChangeTracking;

namespace SportHub.BuildingBlocks.Abstractions.Persistence;

public interface ISportHubDbContext
{
    DbSet<TEntity> Set<TEntity>() where TEntity : class;

    Task<int> SaveChangesAsync(CancellationToken cancellationToken = default);

    // Generic như Set<T>: cần để dịch vụ chạm lịch khôi phục trạng thái tracker sau khi một lần lưu bị DB từ chối
    // (xung đột chiếm chỗ) mà không phải bỏ cả DbContext của caller.
    EntityEntry<TEntity> Entry<TEntity>(TEntity entity) where TEntity : class;

    // Cần cho các đường ghi phải tự mở transaction và tự khóa dòng (vd BR-64 ở
    // GymCheckInRepository: check-then-insert không được hở khe race). Vẫn generic —
    // DatabaseFacade là type của EF Core, không phải entity nghiệp vụ, nên
    // BuildingBlocks không vì thế mà biết gì về module nghiệp vụ (mục 3).
    // DbContext đã có sẵn property này nên SportHubDbContext thỏa interface, không cần sửa.
    DatabaseFacade Database { get; }
}
