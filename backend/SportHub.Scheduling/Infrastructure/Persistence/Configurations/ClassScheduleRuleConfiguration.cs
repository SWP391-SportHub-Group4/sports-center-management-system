using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace SportHub.Scheduling.Infrastructure.Persistence.Configurations;

public class ClassScheduleRuleConfiguration : IEntityTypeConfiguration<ClassScheduleRule>
{
    public void Configure(EntityTypeBuilder<ClassScheduleRule> builder)
    {
        builder.ToTable("class_schedule_rules", t => t.HasCheckConstraint("ck_class_schedule_rules_day", "day_of_week BETWEEN 0 AND 6"));
        builder.HasKey(e => e.RuleId);

        builder.HasOne(e => e.Class)
            .WithMany(c => c.ScheduleRules)
            .HasForeignKey(e => e.ClassId)
            .OnDelete(DeleteBehavior.Cascade); // quy tắc chỉ là dữ liệu soạn của khóa

        builder.HasIndex(e => new { e.ClassId, e.DayOfWeek, e.StartTimeLocal }).IsUnique();
    }
}
