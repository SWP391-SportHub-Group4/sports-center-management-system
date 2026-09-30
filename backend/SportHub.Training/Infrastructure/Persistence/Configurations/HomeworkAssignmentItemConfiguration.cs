using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace SportHub.Training.Infrastructure.Persistence.Configurations;

public class HomeworkAssignmentItemConfiguration : IEntityTypeConfiguration<HomeworkAssignmentItem>
{
    public void Configure(EntityTypeBuilder<HomeworkAssignmentItem> builder)
    {
        builder.HasKey(e => e.ItemId);

        // Bài tập con chỉ có ý nghĩa gắn với đúng 1 assignment — cascade khi xóa assignment.
        builder.HasOne(e => e.Assignment)
            .WithMany(a => a.Items)
            .HasForeignKey(e => e.AssignmentId)
            .OnDelete(DeleteBehavior.Cascade);
    }
}
