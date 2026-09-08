using Microsoft.EntityFrameworkCore;

namespace SportHub.Repository;

// DbSet cho từng entity sẽ thêm dần theo thứ tự code ở docs/Center-Management-System-Design-v2.md, mục 7:
// 1) Identity/RBAC  2) Membership  3) Class/Schedule/Booking  4) Payment/Invoice/Report
public class SportHubDbContext : DbContext
{
    public SportHubDbContext(DbContextOptions<SportHubDbContext> options) : base(options)
    {
    }

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);
        // modelBuilder.ApplyConfigurationsFromAssembly(typeof(SportHubDbContext).Assembly);
    }
}
