using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace SportHub.Training.Infrastructure.Persistence.Configurations;

public class HomeworkAssignmentConfiguration : IEntityTypeConfiguration<HomeworkAssignment>
{
    public void Configure(EntityTypeBuilder<HomeworkAssignment> builder)
    {
        builder.HasKey(e => e.AssignmentId);

        builder.Property(e => e.Version).IsConcurrencyToken();

        builder.ToTable(t => t.HasCheckConstraint(
            "CK_homework_assignments_due_after_assigned",
            "due_at > assigned_at"));

        // Danh sách bài tập của Member/PT là truy vấn chính của trang Homework.
        builder.HasIndex(e => new { e.MemberId, e.Status, e.DueAt });
        builder.HasIndex(e => new { e.CoachId, e.Status, e.DueAt });

        builder.HasOne(e => e.Member)
            .WithMany()
            .HasForeignKey(e => e.MemberId)
            .OnDelete(DeleteBehavior.Restrict);

        builder.HasOne(e => e.Coach)
            .WithMany()
            .HasForeignKey(e => e.CoachId)
            .OnDelete(DeleteBehavior.Restrict);

        builder.HasOne(e => e.Relationship)
            .WithMany(r => r.HomeworkAssignments)
            .HasForeignKey(e => e.RelationshipId)
            .OnDelete(DeleteBehavior.Restrict);

        // Snapshot nguồn — plan bị archive/xóa sau này không được kéo theo homework đã giao.
        builder.HasOne(e => e.SourceWorkoutPlan)
            .WithMany(p => p.HomeworkAssignments)
            .HasForeignKey(e => e.SourceWorkoutPlanId)
            .IsRequired(false)
            .OnDelete(DeleteBehavior.Restrict);
    }
}
