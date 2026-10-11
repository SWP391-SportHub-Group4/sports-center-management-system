using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using SportHub.Identity.Domain.Entities;

namespace SportHub.Scheduling.Infrastructure.Persistence.Configurations;

public sealed class ClassTeachingRecordConfiguration : IEntityTypeConfiguration<ClassTeachingRecord>
{
    public void Configure(EntityTypeBuilder<ClassTeachingRecord> b)
    {
        b.ToTable("class_teaching_records", t => {
            t.HasCheckConstraint("ck_teaching_kind", "kind IN ('PLAN','RESULT','NOTICE','HOMEWORK')");
            t.HasCheckConstraint("ck_teaching_score", "score IS NULL OR score BETWEEN 1 AND 5");
            t.HasCheckConstraint("ck_teaching_result_scope", "kind <> 'RESULT' OR (session_id IS NOT NULL AND member_id IS NOT NULL)");
        });
        b.HasKey(x => x.RecordId);
        b.Property(x => x.RecordId).ValueGeneratedNever();
        b.Property(x => x.Kind).HasMaxLength(16);
        b.Property(x => x.Title).HasMaxLength(160);
        b.Property(x => x.Content).HasMaxLength(8000);
        b.Property(x => x.Version).IsConcurrencyToken();
        b.HasOne<Class>().WithMany().HasForeignKey(x => x.ClassId).OnDelete(DeleteBehavior.Restrict);
        b.HasOne<ClassSession>().WithMany().HasForeignKey(x => x.SessionId).OnDelete(DeleteBehavior.Restrict);
        b.HasOne<UserAccount>().WithMany().HasForeignKey(x => x.MemberId).OnDelete(DeleteBehavior.Restrict);
        b.HasOne<UserAccount>().WithMany().HasForeignKey(x => x.CoachId).OnDelete(DeleteBehavior.Restrict);
        b.HasIndex(x => new { x.ClassId, x.CreatedAtUtc });
        b.HasIndex(x => new { x.SessionId, x.MemberId }).IsUnique().HasFilter("kind = 'RESULT'");
    }
}
