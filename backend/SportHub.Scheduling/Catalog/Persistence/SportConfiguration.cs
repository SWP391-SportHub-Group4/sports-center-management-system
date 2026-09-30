using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using SportHub.Scheduling.Catalog.Domain;

namespace SportHub.Scheduling.Catalog.Persistence;

public class SportConfiguration : IEntityTypeConfiguration<Sport>
{
    public void Configure(EntityTypeBuilder<Sport> builder)
    {
        builder.ToTable("sports", t =>
        {
            t.HasCheckConstraint("ck_sports_default_minutes", "default_session_minutes IS NULL OR default_session_minutes > 0");
            t.HasCheckConstraint("ck_sports_default_capacity", "default_max_capacity IS NULL OR default_max_capacity > 0");
            // GroupCourse (=2) bắt buộc có thời lượng và sức chứa mặc định.
            t.HasCheckConstraint("ck_sports_group_course_defaults",
                "operation_type <> 2 OR (default_session_minutes IS NOT NULL AND default_max_capacity IS NOT NULL)");
        });
        builder.HasKey(e => e.SportId);
        builder.Property(e => e.Name).HasColumnType("citext").IsRequired();
        builder.HasIndex(e => e.Name).IsUnique();

        // Dữ liệu tham chiếu khởi tạo (Design v3 §1.1). Manager tự thêm/sửa sau đó.
        builder.HasData(
            new Sport { SportId = 1, Name = "Gym", OperationType = SportOperationType.WalkIn, SortOrder = 1, IsActive = true },
            new Sport { SportId = 2, Name = "Personal Training", OperationType = SportOperationType.OneOnOne, SortOrder = 2, IsActive = true },
            new Sport { SportId = 3, Name = "Cầu lông", OperationType = SportOperationType.GroupCourse, DefaultSessionMinutes = 90, DefaultMaxCapacity = 12, SortOrder = 3, IsActive = true },
            new Sport { SportId = 4, Name = "Bóng rổ", OperationType = SportOperationType.GroupCourse, DefaultSessionMinutes = 120, DefaultMaxCapacity = 20, SortOrder = 4, IsActive = true });
    }
}
