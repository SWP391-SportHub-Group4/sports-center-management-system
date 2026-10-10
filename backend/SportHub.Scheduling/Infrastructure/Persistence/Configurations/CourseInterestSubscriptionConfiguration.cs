using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using SportHub.Scheduling.Threshold.Domain;

namespace SportHub.Scheduling.Infrastructure.Persistence.Configurations;

public sealed class CourseInterestSubscriptionConfiguration : IEntityTypeConfiguration<CourseInterestSubscription>
{
    public void Configure(EntityTypeBuilder<CourseInterestSubscription> builder)
    {
        builder.ToTable("course_interest_subscriptions", table =>
            table.HasCheckConstraint("ck_course_interest_refunded_points", "refunded_points >= 0"));
        builder.HasKey(x => x.SubscriptionId);
        builder.HasIndex(x => x.ThresholdResponseId).IsUnique();
        builder.HasIndex(x => new { x.SportId, x.IsActive });
        builder.HasIndex(x => new { x.MemberId, x.CreatedAtUtc });
        builder.HasOne<ThresholdResponse>().WithMany().HasForeignKey(x => x.ThresholdResponseId).OnDelete(DeleteBehavior.Restrict);
        builder.HasOne<Domain.Entities.Class>().WithMany().HasForeignKey(x => x.SourceClassId).OnDelete(DeleteBehavior.Restrict);
        builder.HasOne<Catalog.Domain.Sport>().WithMany().HasForeignKey(x => x.SportId).OnDelete(DeleteBehavior.Restrict);
    }
}
