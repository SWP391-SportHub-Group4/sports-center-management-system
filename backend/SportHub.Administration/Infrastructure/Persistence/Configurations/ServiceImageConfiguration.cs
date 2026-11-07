using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using SportHub.Identity.Domain.Entities;

namespace SportHub.Administration.Infrastructure.Persistence.Configurations;

public sealed class ServiceImageGalleryConfiguration : IEntityTypeConfiguration<ServiceImageGallery>
{
    public void Configure(EntityTypeBuilder<ServiceImageGallery> builder)
    {
        builder.ToTable("service_image_galleries", t => {
            t.HasCheckConstraint("ck_service_image_galleries_kind", "kind IN ('membership', 'class', 'room')");
            t.HasCheckConstraint("ck_service_image_galleries_id", "service_id > 0");
            t.HasCheckConstraint("ck_service_image_galleries_version", "version >= 0");
        });
        builder.HasKey(x => new { x.Kind, x.ServiceId });
        builder.Property(x => x.Kind).HasMaxLength(16);
        builder.Property(x => x.Version).IsConcurrencyToken();
    }
}

public sealed class ServiceImageAssetConfiguration : IEntityTypeConfiguration<ServiceImageAsset>
{
    public void Configure(EntityTypeBuilder<ServiceImageAsset> builder)
    {
        builder.ToTable("service_image_assets", t => {
            t.HasCheckConstraint("ck_service_image_assets_dimensions", "width > 0 AND height > 0");
            t.HasCheckConstraint("ck_service_image_assets_order", "sort_order BETWEEN 0 AND 5");
        });
        builder.HasKey(x => x.ImageId);
        builder.Property(x => x.Kind).HasMaxLength(16);
        builder.Property(x => x.PublicId).HasMaxLength(300);
        builder.Property(x => x.Url).HasMaxLength(2048);
        builder.Property(x => x.AltText).HasMaxLength(300);
        builder.HasIndex(x => x.PublicId).IsUnique();
        builder.HasIndex(x => new { x.Kind, x.ServiceId, x.IsPublished });
        builder.HasIndex(x => new { x.IsPublished, x.CreatedAtUtc });
        builder.HasOne<ServiceImageGallery>().WithMany().HasForeignKey(x => new { x.Kind, x.ServiceId })
            .OnDelete(DeleteBehavior.Restrict);
        builder.HasOne<UserAccount>().WithMany().HasForeignKey(x => x.UploadedByUserId)
            .OnDelete(DeleteBehavior.Restrict);
    }
}

public sealed class ServiceImageDeletionConfiguration : IEntityTypeConfiguration<ServiceImageDeletion>
{
    public void Configure(EntityTypeBuilder<ServiceImageDeletion> builder)
    {
        builder.ToTable("service_image_deletions");
        builder.HasKey(x => x.DeletionId);
        builder.Property(x => x.PublicId).HasMaxLength(300);
        builder.Property(x => x.Url).HasMaxLength(2048);
        builder.HasIndex(x => x.PublicId).IsUnique();
        builder.HasIndex(x => x.NextAttemptAtUtc);
    }
}
