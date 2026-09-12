using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace SportHub.Training.Infrastructure.Persistence.Configurations;

public class CoachMemberRelationshipConfiguration : IEntityTypeConfiguration<CoachMemberRelationship>
{
    public void Configure(EntityTypeBuilder<CoachMemberRelationship> builder)
    {
        builder.HasKey(e => e.RelationshipId);

        // Ràng buộc #7: không tạo trùng quan hệ Coach–Member đang ACTIVE
        // (partial unique index, RelationshipStatus.Active = 0).
        builder.HasIndex(e => new { e.CoachId, e.MemberId })
            .IsUnique()
            .HasFilter($"status = {(int)RelationshipStatus.Active}");

        builder.HasOne(e => e.Coach)
            .WithMany()
            .HasForeignKey(e => e.CoachId)
            .OnDelete(DeleteBehavior.Restrict);

        builder.HasOne(e => e.Member)
            .WithMany()
            .HasForeignKey(e => e.MemberId)
            .OnDelete(DeleteBehavior.Restrict);

        builder.HasOne(e => e.Class)
            .WithMany()
            .HasForeignKey(e => e.ClassId)
            .IsRequired(false)
            .OnDelete(DeleteBehavior.Restrict);
    }
}
