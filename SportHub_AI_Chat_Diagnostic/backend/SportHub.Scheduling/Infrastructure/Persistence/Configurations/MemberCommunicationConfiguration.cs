using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using SportHub.Scheduling.Threshold.Domain;

namespace SportHub.Scheduling.Infrastructure.Persistence.Configurations;

public sealed class ClassSessionReminderConfiguration : IEntityTypeConfiguration<ClassSessionReminder>
{
    public void Configure(EntityTypeBuilder<ClassSessionReminder> b)
    {
        b.ToTable("class_session_reminders");
        b.HasKey(x => x.ReminderId);
        b.HasIndex(x => new { x.SessionId, x.MemberId, x.StartAtUtc, x.HoursBefore }).IsUnique();
        b.HasOne<ClassSession>().WithMany().HasForeignKey(x => x.SessionId).OnDelete(DeleteBehavior.Restrict);
    }
}
