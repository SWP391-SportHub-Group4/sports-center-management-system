using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace SportHub.Identity.Infrastructure.Persistence.Configurations;

public sealed class AvatarDeletionConfiguration : IEntityTypeConfiguration<AvatarDeletion>
{
    public void Configure(EntityTypeBuilder<AvatarDeletion> builder)
    {
        builder.HasKey(x => x.DeletionId);
        builder.Property(x => x.PublicId).HasMaxLength(255);
        builder.HasIndex(x => x.PublicId).IsUnique();
    }
}
