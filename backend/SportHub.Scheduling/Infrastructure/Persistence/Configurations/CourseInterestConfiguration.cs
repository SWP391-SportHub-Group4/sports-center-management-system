using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using SportHub.Scheduling.Threshold.Domain;

namespace SportHub.Scheduling.Infrastructure.Persistence.Configurations;

public sealed class CourseInterestConfiguration : IEntityTypeConfiguration<CourseInterest>
{
    public void Configure(EntityTypeBuilder<CourseInterest> builder)
    {
        builder.ToTable("course_interests");
        builder.HasKey(x => x.CourseInterestId);
        builder.HasIndex(x => x.ThresholdResponseId).IsUnique();
        builder.HasIndex(x => new { x.SportId, x.CancelledAtUtc });
        builder.HasOne<ThresholdResponse>().WithMany().HasForeignKey(x => x.ThresholdResponseId).OnDelete(DeleteBehavior.Restrict);
        builder.HasOne<Domain.Entities.Class>().WithMany().HasForeignKey(x => x.SourceClassId).OnDelete(DeleteBehavior.Restrict);
        builder.HasOne<Catalog.Domain.Sport>().WithMany().HasForeignKey(x => x.SportId).OnDelete(DeleteBehavior.Restrict);
    }
}
