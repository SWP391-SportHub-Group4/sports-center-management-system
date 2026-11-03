using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using SportHub.Identity.Domain.Entities;

namespace SportHub.Identity.Infrastructure.Persistence.Configurations;

public sealed class MemberSupportAttachmentConfiguration
    : IEntityTypeConfiguration<MemberSupportAttachment>
{
    public void Configure(EntityTypeBuilder<MemberSupportAttachment> builder)
    {
        builder.ToTable("member_support_attachments", table =>
            table.HasCheckConstraint("ck_support_attachment_kind_payout",
                "(kind = 'MEMBER_PROOF' AND payout_id IS NULL) OR (kind = 'PAYOUT_PROOF' AND payout_id IS NOT NULL)"));
        builder.HasKey(x => x.AttachmentId);
        builder.Property(x => x.FileName).HasMaxLength(200).IsRequired();
        builder.Property(x => x.ContentType).HasMaxLength(50).IsRequired();
        builder.Property(x => x.Content).IsRequired();
        builder.Property(x => x.Kind).HasMaxLength(20)
            .HasDefaultValue(SupportAttachmentKinds.MemberProof).IsRequired();
        builder.HasIndex(x => x.PayoutId);
        builder.HasIndex(x => x.RequestId);
        builder.HasOne<MemberSupportRequest>()
            .WithMany()
            .HasForeignKey(x => x.RequestId)
            .OnDelete(DeleteBehavior.Cascade);
    }
}
