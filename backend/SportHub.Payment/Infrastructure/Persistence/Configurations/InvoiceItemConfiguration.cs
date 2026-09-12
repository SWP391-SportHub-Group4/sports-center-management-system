using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace SportHub.Payment.Infrastructure.Persistence.Configurations;

public class InvoiceItemConfiguration : IEntityTypeConfiguration<InvoiceItem>
{
    public void Configure(EntityTypeBuilder<InvoiceItem> builder)
    {
        builder.HasKey(e => e.ItemId);
        builder.Property(e => e.Amount).HasPrecision(18, 0);

        // Dòng chi tiết chỉ có ý nghĩa gắn với đúng 1 invoice — cascade khi xóa invoice
        // (Invoice về nguyên tắc không bao giờ bị xóa thật, BR-40).
        builder.HasOne(e => e.Invoice)
            .WithMany(i => i.Items)
            .HasForeignKey(e => e.InvoiceId)
            .OnDelete(DeleteBehavior.Cascade);
    }
}
