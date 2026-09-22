using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace SportHub.Payment.Infrastructure.Persistence.Configurations;

public class PaymentAdjustmentConfiguration : IEntityTypeConfiguration<PaymentAdjustment>
{
    public void Configure(EntityTypeBuilder<PaymentAdjustment> builder)
    {
        builder.HasKey(e => e.AdjustmentId);
        builder.Property(e => e.Amount).HasPrecision(18, 0);
        builder.Property(e => e.RequestedAmount).HasPrecision(18, 0);
        builder.Property(e => e.RefundReferenceCode).HasMaxLength(100);

        builder.HasOne(e => e.Invoice)
            .WithMany(i => i.Adjustments)
            .HasForeignKey(e => e.InvoiceId)
            .OnDelete(DeleteBehavior.Restrict);

        builder.HasOne(e => e.Payment)
            .WithMany(p => p.Adjustments)
            .HasForeignKey(e => e.PaymentId)
            .IsRequired(false)
            .OnDelete(DeleteBehavior.Restrict);

        builder.HasOne(e => e.RequestedByUser)
            .WithMany()
            .HasForeignKey(e => e.RequestedByUserId)
            .OnDelete(DeleteBehavior.Restrict);

        builder.HasOne(e => e.ApprovedByUser)
            .WithMany()
            .HasForeignKey(e => e.ApprovedByUserId)
            .IsRequired(false)
            .OnDelete(DeleteBehavior.Restrict);

        builder.HasOne(e => e.CompletedByUser)
            .WithMany()
            .HasForeignKey(e => e.CompletedByUserId)
            .IsRequired(false)
            .OnDelete(DeleteBehavior.Restrict);

        // BR-42 v1.4 — bằng chứng thực trả là ràng buộc DB, không chỉ là kiểm tra trong service:
        // một Refund Completed thiếu actor/thời điểm/phương thức thì báo cáo thu ròng (BR-43)
        // không có ngày để quy kỳ. Chỉ áp cho Refund; Discount/Correction Completed không chuyển tiền.
        builder.ToTable(t => t.HasCheckConstraint(
            "CK_payment_adjustments_refund_completed_evidence",
            """
            (type <> 0 OR status <> 3)
            OR legacy_payout_unverified
            OR (completed_at_utc IS NOT NULL
                AND completed_by_user_id IS NOT NULL
                AND refund_method IS NOT NULL)
            """));

        // Ngày hiệu lực tiền tệ phải có ở mọi bản ghi Completed, kể cả Discount/Correction —
        // BR-43 quy kỳ báo cáo theo ngày này.
        builder.ToTable(t => t.HasCheckConstraint(
            "CK_payment_adjustments_completed_has_date",
            "status <> 3 OR legacy_payout_unverified OR completed_at_utc IS NOT NULL"));
    }
}
