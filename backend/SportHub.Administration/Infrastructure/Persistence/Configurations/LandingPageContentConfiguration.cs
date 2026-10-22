using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace SportHub.Administration.Infrastructure.Persistence.Configurations;

public sealed class LandingPageContentConfiguration : IEntityTypeConfiguration<LandingPageContent>
{
    public void Configure(EntityTypeBuilder<LandingPageContent> builder)
    {
        builder.ToTable("landing_page_content", table => table.HasCheckConstraint("ck_landing_page_singleton", "id = 1"));
        builder.HasKey(x => x.Id);
        builder.Property(x => x.Id).ValueGeneratedNever();
        builder.Property(x => x.ValuesJson).HasColumnType("text").IsRequired();
        builder.Property(x => x.Revision).IsConcurrencyToken();
    }
}
