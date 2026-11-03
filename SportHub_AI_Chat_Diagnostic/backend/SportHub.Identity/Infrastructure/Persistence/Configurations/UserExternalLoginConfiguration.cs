using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace SportHub.Identity.Infrastructure.Persistence.Configurations;

public class UserExternalLoginConfiguration : IEntityTypeConfiguration<UserExternalLogin>
{
    public void Configure(EntityTypeBuilder<UserExternalLogin> builder)
    {
        builder.HasKey(e => e.ExternalLoginId);

        // Ràng buộc #15: 1 tài khoản provider ngoài không link được vào 2 UserAccount.
        builder.HasIndex(e => new { e.Provider, e.ProviderUserId }).IsUnique();
        // Ràng buộc #16: 1 UserAccount không link trùng cùng 1 provider 2 lần.
        builder.HasIndex(e => new { e.UserId, e.Provider }).IsUnique();

        builder.HasOne(e => e.UserAccount)
            .WithMany(u => u.ExternalLogins)
            .HasForeignKey(e => e.UserId)
            .OnDelete(DeleteBehavior.Cascade);
    }
}
