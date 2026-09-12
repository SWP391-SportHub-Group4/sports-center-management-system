using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace SportHub.Scheduling.Infrastructure.Persistence.Configurations;

public class ClassConfiguration : IEntityTypeConfiguration<Class>
{
    public void Configure(EntityTypeBuilder<Class> builder)
    {
        builder.HasKey(e => e.ClassId);

        builder.HasOne(e => e.DefaultRoom)
            .WithMany(r => r.Classes)
            .HasForeignKey(e => e.DefaultRoomId)
            .OnDelete(DeleteBehavior.Restrict);

        builder.HasOne(e => e.DefaultCoach)
            .WithMany()
            .HasForeignKey(e => e.DefaultCoachId)
            .IsRequired(false)
            .OnDelete(DeleteBehavior.Restrict);
    }
}
