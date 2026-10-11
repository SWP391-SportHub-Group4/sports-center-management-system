using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using SportHub.Identity.Domain.Entities;

namespace SportHub.Identity.Infrastructure.Persistence.Configurations;

public class CoachServiceQualificationConfiguration : IEntityTypeConfiguration<CoachServiceQualification>
{
    public void Configure(EntityTypeBuilder<CoachServiceQualification> builder)
    {
        builder.ToTable("coach_service_qualifications");
        builder.HasKey(e => new { e.UserId, e.OfferingId });

        builder.HasOne(e => e.UserAccount)
            .WithMany()
            .HasForeignKey(e => e.UserId)
            .OnDelete(DeleteBehavior.Restrict);

        builder.HasIndex(e => e.OfferingId);
    }
}
