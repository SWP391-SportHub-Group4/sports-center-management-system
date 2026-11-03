using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace SportHub.Identity.Infrastructure.Persistence.Configurations;

public class UserCredentialConfiguration : IEntityTypeConfiguration<UserCredential>
{
    public void Configure(EntityTypeBuilder<UserCredential> builder)
    {
        // PK trùng FK (1–1, dùng chung giá trị user_id với UserAccount).
        builder.HasKey(e => e.UserId);

        builder.HasOne(e => e.UserAccount)
            .WithOne(u => u.Credential)
            .HasForeignKey<UserCredential>(e => e.UserId)
            .OnDelete(DeleteBehavior.Cascade);
    }
}
