using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace SportHub.Payment.Infrastructure.Persistence.Configurations;

public class InvoiceItemConfiguration : IEntityTypeConfiguration<InvoiceItem>
{
    public void Configure(EntityTypeBuilder<InvoiceItem> builder)
    {
        builder.HasKey(e => e.ItemId);
        builder.Property(e => e.UnitPrice).HasPrecision(18, 0);
        builder.Property(e => e.LineAmount).HasPrecision(18, 0);
        builder.Property(e => e.Quantity).IsRequired();
        builder.Property(e => e.Description).IsRequired().HasMaxLength(500);

        builder.HasOne(e => e.Invoice)
            .WithMany(i => i.Items)
            .HasForeignKey(e => e.InvoiceId)
            .OnDelete(DeleteBehavior.Cascade);

        builder.ToTable(t => t.HasCheckConstraint(
            "CK_invoice_items_quantity_positive", "quantity > 0"));

        builder.ToTable(t => t.HasCheckConstraint(
            "CK_invoice_items_unit_price_non_negative", "unit_price >= 0"));

        builder.ToTable(t => t.HasCheckConstraint(
            "CK_invoice_items_line_amount_matches", "line_amount = unit_price * quantity"));
    }
}
