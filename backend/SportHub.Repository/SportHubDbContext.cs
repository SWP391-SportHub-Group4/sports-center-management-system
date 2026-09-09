using Microsoft.EntityFrameworkCore;
using SportHub.Repository.Entities;

namespace SportHub.Repository;

// DbSet cho từng entity sẽ thêm dần theo thứ tự code ở docs/Center-Management-System-Design-v2.md, mục 7:
// 1) Identity/RBAC  2) Membership  3) Class/Schedule/Booking  4) Payment/Invoice/Report
public class SportHubDbContext : DbContext
{
    public SportHubDbContext(DbContextOptions<SportHubDbContext> options) : base(options)
    {
    }

    // 1) Identity/RBAC
    public DbSet<Role> Roles => Set<Role>();
    public DbSet<User> Users => Set<User>();

    // 2) Membership
    public DbSet<MembershipPackage> MembershipPackages => Set<MembershipPackage>();
    public DbSet<MemberPackage> MemberPackages => Set<MemberPackage>();
    public DbSet<MemberTrainingProfile> MemberTrainingProfiles => Set<MemberTrainingProfile>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);
        // modelBuilder.ApplyConfigurationsFromAssembly(typeof(SportHubDbContext).Assembly);
        // TODO: cấu hình enum->string (UPPER_SNAKE_CASE), unique index LOWER(Email) (BR-49),
        // IsConcurrencyToken cho MemberPackage.Version — chưa làm ở bước scaffold này,
        // xem docs/00-Source-of-Truth.md §7 Open Questions (convention serialize enum).
    }
}
