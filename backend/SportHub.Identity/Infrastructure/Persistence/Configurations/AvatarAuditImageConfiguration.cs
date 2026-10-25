using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using SportHub.Identity.Domain.Entities;

namespace SportHub.Identity.Infrastructure.Persistence.Configurations;
public sealed class AvatarAuditImageConfiguration : IEntityTypeConfiguration<AvatarAuditImage>
{
    public void Configure(EntityTypeBuilder<AvatarAuditImage> b)
    {
        b.ToTable("avatar_audit_images");
        b.HasKey(x => x.ImageId);
        b.Property(x => x.Content).IsRequired();
        b.Property(x => x.ContentType).HasMaxLength(30).IsRequired();
        b.Property(x => x.SourcePublicId).HasMaxLength(255);
        b.HasIndex(x => x.ExpiresAtUtc);
        b.HasIndex(x => new { x.OwnerUserId, x.SourcePublicId });
    }
}
