using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using SportHub.Scheduling.Threshold.Domain;

namespace SportHub.Scheduling.Infrastructure.Persistence.Configurations;

public sealed class CourseInterestConfiguration : IEntityTypeConfiguration<CourseInterest>
{
    public void Configure(EntityTypeBuilder<CourseInterest> b)
    {
        b.ToTable("course_interests");
        b.HasKey(x => x.InterestId);
        b.HasIndex(x => x.ThresholdResponseId).IsUnique();
        b.HasIndex(x => new { x.MemberId, x.Active });
        b.HasIndex(x => new { x.SportId, x.CancelledAtUtc });
        b.HasOne<SportHub.Scheduling.Catalog.Domain.Sport>().WithMany().HasForeignKey(x => x.SportId).OnDelete(DeleteBehavior.Restrict);
        b.HasOne<Class>().WithMany().HasForeignKey(x => x.SourceClassId).OnDelete(DeleteBehavior.Restrict);
        b.HasOne<ThresholdResponse>().WithMany().HasForeignKey(x => x.ThresholdResponseId).OnDelete(DeleteBehavior.Restrict);
    }
}

public sealed class CourseInterestDeliveryConfiguration : IEntityTypeConfiguration<CourseInterestDelivery>
{
    public void Configure(EntityTypeBuilder<CourseInterestDelivery> b)
    {
        b.ToTable("course_interest_deliveries");
        b.HasKey(x => x.DeliveryId);
        b.HasIndex(x => new { x.InterestId, x.ClassId }).IsUnique();
        b.HasOne<CourseInterest>().WithMany().HasForeignKey(x => x.InterestId).OnDelete(DeleteBehavior.Restrict);
        b.HasOne<Class>().WithMany().HasForeignKey(x => x.ClassId).OnDelete(DeleteBehavior.Restrict);
    }
}

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
