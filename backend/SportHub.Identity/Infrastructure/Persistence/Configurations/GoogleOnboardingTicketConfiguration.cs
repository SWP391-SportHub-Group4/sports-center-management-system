using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace SportHub.Identity.Infrastructure.Persistence.Configurations;

public sealed class GoogleOnboardingTicketConfiguration : IEntityTypeConfiguration<GoogleOnboardingTicket>
{
    public void Configure(EntityTypeBuilder<GoogleOnboardingTicket> builder)
    {
        builder.HasKey(t => t.TicketId);

        builder.Property(t => t.TokenHash).IsRequired();
        builder.HasIndex(t => t.TokenHash).IsUnique();

        builder.Property(t => t.ProviderUserId).IsRequired();
        builder.HasIndex(t => t.ProviderUserId);

        builder.Property(t => t.Email).HasColumnType("citext").IsRequired();
    }
}
