using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace SportHub.Payment.Infrastructure.Persistence.Configurations;

public class InvoiceConfiguration : IEntityTypeConfiguration<Invoice>
{
    public void Configure(EntityTypeBuilder<Invoice> builder)
    {
        builder.HasKey(e => e.InvoiceId);
        builder.HasIndex(e => e.InvoiceNumber).IsUnique();
        builder.Property(e => e.TotalAmount).HasPrecision(18, 0);

        builder.HasOne(e => e.Member)
            .WithMany()
            .HasForeignKey(e => e.MemberId)
            .OnDelete(DeleteBehavior.Restrict);

        builder.HasOne(e => e.IssuedByUser)
            .WithMany()
            .HasForeignKey(e => e.IssuedByUserId)
            .OnDelete(DeleteBehavior.Restrict);

        builder.HasIndex(e => new { e.MemberId, e.Status });

        builder.HasOne(e => e.MemberPackage)
            .WithMany()
            .HasForeignKey(e => e.MemberPackageId)
            .IsRequired(false)
            .OnDelete(DeleteBehavior.Restrict);
    }
}
