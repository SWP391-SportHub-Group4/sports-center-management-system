using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace SportHub.Identity.Infrastructure.Persistence.Configurations;

public sealed class CoachCredentialConfiguration : IEntityTypeConfiguration<CoachCredential>
{
    public void Configure(EntityTypeBuilder<CoachCredential> builder)
    {
        builder.ToTable("coach_credentials");
        builder.HasKey(x => x.CredentialId);
        builder.HasOne(x => x.Coach).WithMany().HasForeignKey(x => x.CoachUserId).OnDelete(DeleteBehavior.Cascade);
        builder.Property(x => x.Title).HasMaxLength(200);
        builder.Property(x => x.Issuer).HasMaxLength(200);
        builder.Property(x => x.FileName).HasMaxLength(180);
        builder.Property(x => x.FileUrl).HasMaxLength(1500);
        builder.Property(x => x.FilePublicId).HasMaxLength(255);
        builder.Property(x => x.ContentType).HasMaxLength(40);
        builder.Property(x => x.Version).IsConcurrencyToken();
        builder.HasIndex(x => new { x.CoachUserId, x.DeletedAtUtc });
        builder.HasIndex(x => x.FilePublicId).IsUnique();
    }
}
