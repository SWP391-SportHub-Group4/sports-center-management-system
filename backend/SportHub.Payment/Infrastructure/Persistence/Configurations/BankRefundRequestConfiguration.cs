using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using SportHub.Identity.Domain.Entities;
using SportHub.Payment.BankRefunds;

namespace SportHub.Payment.Infrastructure.Persistence.Configurations;

public sealed class BankRefundRequestConfiguration : IEntityTypeConfiguration<BankRefundRequest>
{
    public void Configure(EntityTypeBuilder<BankRefundRequest> builder)
    {
        builder.ToTable("bank_refund_requests");
        builder.HasKey(x => x.BankRefundId);
        builder.Property(x => x.ItemType).HasMaxLength(30).IsRequired();
        builder.Property(x => x.Status).HasMaxLength(30).IsRequired();
        builder.Property(x => x.BankName).HasMaxLength(100).IsRequired();
        // Encrypted with ASP.NET Data Protection; the plain 6-20 digit number is validated before it is protected.
        builder.Property(x => x.AccountNumber).HasMaxLength(512).IsRequired();
        builder.Property(x => x.AccountHolder).HasMaxLength(120).IsRequired();
        builder.Property(x => x.SuggestedAmount).HasPrecision(18, 0);
        builder.Property(x => x.PolicyPercent).HasPrecision(7, 4);
        builder.Property(x => x.ApprovedAmount).HasPrecision(18, 0);
        builder.Property(x => x.PayoutAmount).HasPrecision(18, 0);
        builder.Property(x => x.RequestSnapshotJson).HasColumnType("jsonb").IsRequired();
        builder.Property(x => x.ApprovalSnapshotJson).HasColumnType("jsonb");
        builder.Property(x => x.ApprovalReason).HasMaxLength(500);
        builder.Property(x => x.PayoutReference).HasMaxLength(100);
        builder.Property(x => x.PayoutNote).HasMaxLength(500);
        builder.Property(x => x.ReconciliationNote).HasMaxLength(500);
        builder.Property(x => x.RejectionReason).HasMaxLength(500);

        // Một ticket ↔ một yêu cầu hoàn tiền.
        builder.HasIndex(x => x.SupportRequestId).IsUnique();
        // Một item chỉ có tối đa một yêu cầu đang xử lý: chặn gửi trùng và hai ticket cùng giữ một giá trị.
        builder.HasIndex(x => x.InvoiceItemId).IsUnique()
            .HasFilter("status IN ('PENDING','APPROVED_AWAITING_PAYOUT')")
            .HasDatabaseName("ux_bank_refund_requests_active_item");
        // Cộng dồn trần theo item (chỉ các khoản đã cam kết) và báo cáo theo ngày thực chuyển.
        builder.HasIndex(x => new { x.InvoiceItemId, x.Status });
        builder.HasIndex(x => x.PayoutAt).HasFilter("status = 'PAID'");
        builder.HasIndex(x => new { x.MemberId, x.CreatedAt });

        builder.HasOne<MemberSupportRequest>().WithMany().HasForeignKey(x => x.SupportRequestId)
            .OnDelete(DeleteBehavior.Restrict);
        builder.HasOne<Domain.Entities.Invoice>().WithMany().HasForeignKey(x => x.InvoiceId)
            .OnDelete(DeleteBehavior.Restrict);
        builder.HasOne<Domain.Entities.InvoiceItem>().WithMany().HasForeignKey(x => x.InvoiceItemId)
            .OnDelete(DeleteBehavior.Restrict);
        builder.HasOne<UserAccount>().WithMany().HasForeignKey(x => x.MemberId).OnDelete(DeleteBehavior.Restrict);
        builder.HasOne<UserAccount>().WithMany().HasForeignKey(x => x.RequestedByUserId).OnDelete(DeleteBehavior.Restrict);
        builder.HasOne<UserAccount>().WithMany().HasForeignKey(x => x.ApprovedByUserId).OnDelete(DeleteBehavior.Restrict);
        builder.HasOne<UserAccount>().WithMany().HasForeignKey(x => x.PaidByUserId).OnDelete(DeleteBehavior.Restrict);
        builder.HasOne<UserAccount>().WithMany().HasForeignKey(x => x.RejectedByUserId).OnDelete(DeleteBehavior.Restrict);

        builder.ToTable(t =>
        {
            t.HasCheckConstraint("CK_bank_refund_requests_status",
                "status IN ('PENDING','APPROVED_AWAITING_PAYOUT','PAID','REJECTED')");
            t.HasCheckConstraint("CK_bank_refund_requests_amounts",
                "suggested_amount >= 0 AND (approved_amount IS NULL OR approved_amount > 0)"
                + " AND (payout_amount IS NULL OR payout_amount > 0)");
            // Đã duyệt/đã chuyển thì phải có người duyệt, số tiền và lý do; Paid phải có người ghi nhận, ngày chuyển và đúng số đã duyệt.
            t.HasCheckConstraint("CK_bank_refund_requests_approved_fields",
                "status NOT IN ('APPROVED_AWAITING_PAYOUT','PAID') OR (approved_amount IS NOT NULL"
                + " AND approved_by_user_id IS NOT NULL AND approved_at_utc IS NOT NULL AND approval_reason IS NOT NULL)");
            t.HasCheckConstraint("CK_bank_refund_requests_paid_fields",
                "status <> 'PAID' OR (payout_amount = approved_amount AND payout_at IS NOT NULL"
                + " AND paid_by_user_id IS NOT NULL AND paid_recorded_at_utc IS NOT NULL AND payout_note IS NOT NULL)");
            t.HasCheckConstraint("CK_bank_refund_requests_rejected_fields",
                "status <> 'REJECTED' OR (rejection_reason IS NOT NULL AND rejected_by_user_id IS NOT NULL)");
        });
    }
}
