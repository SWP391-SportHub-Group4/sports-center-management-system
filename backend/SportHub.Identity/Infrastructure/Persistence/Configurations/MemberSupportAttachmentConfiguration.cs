using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using SportHub.Identity.Domain.Entities;

namespace SportHub.Identity.Infrastructure.Persistence.Configurations;

public sealed class MemberSupportAttachmentConfiguration
    : IEntityTypeConfiguration<MemberSupportAttachment>
{
    public void Configure(EntityTypeBuilder<MemberSupportAttachment> builder)
    {
        builder.ToTable("member_support_attachments");
        builder.HasKey(x => x.AttachmentId);
        builder.Property(x => x.FileName).HasMaxLength(200).IsRequired();
        builder.Property(x => x.ContentType).HasMaxLength(50).IsRequired();
        builder.Property(x => x.Content).IsRequired();
        builder.Property(x => x.Kind).HasMaxLength(20).HasDefaultValue("EVIDENCE").IsRequired();
        builder.HasIndex(x => new { x.RequestId, x.Kind });
        builder.HasOne<MemberSupportRequest>()
            .WithMany()
            .HasForeignKey(x => x.RequestId)
            .OnDelete(DeleteBehavior.Cascade);
    }
}
