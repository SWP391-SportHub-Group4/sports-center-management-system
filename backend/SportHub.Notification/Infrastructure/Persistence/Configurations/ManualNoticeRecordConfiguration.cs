using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using SportHub.Identity.Domain.Entities;
using SportHub.Notification.Domain.Entities;

namespace SportHub.Notification.Infrastructure.Persistence.Configurations;

public sealed class ManualNoticeRecordConfiguration : IEntityTypeConfiguration<ManualNoticeRecord>
{
    public void Configure(EntityTypeBuilder<ManualNoticeRecord> builder)
    {
        builder.ToTable("manual_notice_records");
        builder.HasKey(x => x.NoticeId);
        builder.Property(x => x.Subject).HasMaxLength(150).IsRequired();
        builder.Property(x => x.Message).HasMaxLength(3000);
        builder.Property(x => x.SenderName).HasMaxLength(320).IsRequired();
        builder.Property(x => x.RecipientsJson).HasColumnType("jsonb").IsRequired();
        builder.HasIndex(x => new { x.ManagerId, x.CreatedAtUtc, x.NoticeId });
        builder.HasOne<UserAccount>().WithMany().HasForeignKey(x => x.ManagerId).OnDelete(DeleteBehavior.Restrict);
    }
}
