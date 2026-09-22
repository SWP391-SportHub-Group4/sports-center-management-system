using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace SportHub.API.Migrations
{
    /// <inheritdoc />
    public partial class AddRefundPayoutEvidence : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<DateTime>(
                name: "approved_at_utc",
                table: "payment_adjustments",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "completed_at_utc",
                table: "payment_adjustments",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "completed_by_user_id",
                table: "payment_adjustments",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "legacy_payout_unverified",
                table: "payment_adjustments",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<int>(
                name: "refund_method",
                table: "payment_adjustments",
                type: "integer",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "refund_reference_code",
                table: "payment_adjustments",
                type: "character varying(100)",
                maxLength: 100,
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "requested_amount",
                table: "payment_adjustments",
                type: "numeric(18,0)",
                precision: 18,
                scale: 0,
                nullable: false,
                defaultValue: 0m);

            // ---- Dữ liệu cũ (SSOT §5.7: không backfill bằng chứng hoàn tiền bằng suy đoán) ----
            //
            // 1. requested_amount: bản ghi cũ không lưu số đề nghị ban đầu tách khỏi số đã duyệt.
            //    Gán bằng amount = "không ghi nhận có ghi đè". Đây là metadata hiển thị, không
            //    phải bằng chứng tiền tệ, nên gán được mà không tạo khẳng định sai về tiền.
            migrationBuilder.Sql("UPDATE payment_adjustments SET requested_amount = amount;");

            // 2. approved_at_utc: resolved_at của bản ghi cũ CHÍNH LÀ thời điểm duyệt — quy trình
            //    cũ đặt nó trong ApproveAsync/RejectAsync. Đây là dữ kiện thật, không phải suy đoán.
            migrationBuilder.Sql(
                "UPDATE payment_adjustments SET approved_at_utc = resolved_at "
                + "WHERE resolved_at IS NOT NULL AND approved_by_user_id IS NOT NULL;");

            // 3. Discount/Correction đã Completed: cả thiết kế cũ lẫn mới đều hoàn tất chúng NGAY
            //    trong transaction duyệt (không có tiền chuyển đi để chờ xác nhận), nên
            //    completed_at_utc = thời điểm duyệt là đúng sự thật.
            migrationBuilder.Sql(
                "UPDATE payment_adjustments SET completed_at_utc = COALESCE(resolved_at, created_at) "
                + "WHERE status = 3 AND type <> 0;");

            // 4. Refund đã Completed: quy trình cũ gộp approve vào completed, nên bản ghi này CHỈ
            //    chứng minh "Manager đã duyệt" — không ai biết tiền có thực sự ra khỏi quầy hay
            //    không, ai chi, chi bằng gì. Cố tình KHÔNG gán completed_at_utc/
            //    completed_by_user_id/refund_method: bịa ba dữ kiện đó sẽ biến một khoản chưa đối
            //    soát thành một khoản trông như đã đủ chứng từ.
            //
            //    Thay vào đó đánh dấu cách ly (xem docs/legacy-refund-reconciliation.md):
            //    - VẪN tính vào RefundedAmount => không ai hoàn lần hai cho cùng một khoản.
            //    - KHÔNG vào báo cáo thu ròng theo kỳ (BR-43) vì không có ngày thực trả đáng tin.
            migrationBuilder.Sql(
                "UPDATE payment_adjustments SET legacy_payout_unverified = TRUE "
                + "WHERE status = 3 AND type = 0;");

            migrationBuilder.CreateIndex(
                name: "ix_payment_adjustments_completed_by_user_id",
                table: "payment_adjustments",
                column: "completed_by_user_id");

            migrationBuilder.AddCheckConstraint(
                name: "CK_payment_adjustments_completed_has_date",
                table: "payment_adjustments",
                sql: "status <> 3 OR legacy_payout_unverified OR completed_at_utc IS NOT NULL");

            migrationBuilder.AddCheckConstraint(
                name: "CK_payment_adjustments_refund_completed_evidence",
                table: "payment_adjustments",
                sql: "(type <> 0 OR status <> 3)\nOR legacy_payout_unverified\nOR (completed_at_utc IS NOT NULL\n    AND completed_by_user_id IS NOT NULL\n    AND refund_method IS NOT NULL)");

            migrationBuilder.AddForeignKey(
                name: "fk_payment_adjustments_user_accounts_completed_by_user_id",
                table: "payment_adjustments",
                column: "completed_by_user_id",
                principalTable: "user_accounts",
                principalColumn: "user_id",
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "fk_payment_adjustments_user_accounts_completed_by_user_id",
                table: "payment_adjustments");

            migrationBuilder.DropIndex(
                name: "ix_payment_adjustments_completed_by_user_id",
                table: "payment_adjustments");

            migrationBuilder.DropCheckConstraint(
                name: "CK_payment_adjustments_completed_has_date",
                table: "payment_adjustments");

            migrationBuilder.DropCheckConstraint(
                name: "CK_payment_adjustments_refund_completed_evidence",
                table: "payment_adjustments");

            migrationBuilder.DropColumn(
                name: "approved_at_utc",
                table: "payment_adjustments");

            migrationBuilder.DropColumn(
                name: "completed_at_utc",
                table: "payment_adjustments");

            migrationBuilder.DropColumn(
                name: "completed_by_user_id",
                table: "payment_adjustments");

            migrationBuilder.DropColumn(
                name: "legacy_payout_unverified",
                table: "payment_adjustments");

            migrationBuilder.DropColumn(
                name: "refund_method",
                table: "payment_adjustments");

            migrationBuilder.DropColumn(
                name: "refund_reference_code",
                table: "payment_adjustments");

            migrationBuilder.DropColumn(
                name: "requested_amount",
                table: "payment_adjustments");
        }
    }
}
