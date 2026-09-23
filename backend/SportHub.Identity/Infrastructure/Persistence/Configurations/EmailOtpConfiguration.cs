using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace SportHub.Identity.Infrastructure.Persistence.Configurations;

public sealed class EmailOtpConfiguration : IEntityTypeConfiguration<EmailOtp>
{
    public void Configure(EntityTypeBuilder<EmailOtp> builder)
    {
        builder.HasKey(o => o.EmailOtpId);

        // citext như UserAccount.Email — OTP gửi tới "A@x.com" phải khớp khi Register "a@x.com".
        builder.Property(o => o.Email).HasColumnType("citext").IsRequired();
        builder.HasIndex(o => o.Email).IsUnique();

        builder.Property(o => o.CodeHash).IsRequired();
    }
}
