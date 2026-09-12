using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace SportHub.Scheduling.Infrastructure.Persistence.Configurations;

public class ClassRecurrenceConfiguration : IEntityTypeConfiguration<ClassRecurrence>
{
    public void Configure(EntityTypeBuilder<ClassRecurrence> builder)
    {
        builder.HasKey(e => e.RecurrenceId);

        builder.HasOne(e => e.Class)
            .WithMany(c => c.Recurrences)
            .HasForeignKey(e => e.ClassId)
            .OnDelete(DeleteBehavior.Restrict);
    }
}
