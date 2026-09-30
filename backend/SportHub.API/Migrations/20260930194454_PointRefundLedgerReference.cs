using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace SportHub.API.Migrations
{
    /// <inheritdoc />
    public partial class PointRefundLedgerReference : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropCheckConstraint(
                name: "CK_payment_adjustments_refund_completed_evidence",
                table: "payment_adjustments");

            migrationBuilder.CreateIndex(
                name: "ix_payment_adjustments_point_ledger_entry_id",
                table: "payment_adjustments",
                column: "point_ledger_entry_id");

            migrationBuilder.AddCheckConstraint(
                name: "CK_payment_adjustments_refund_completed_evidence",
                table: "payment_adjustments",
                sql: "(type <> 0 OR status <> 3)\nOR legacy_payout_unverified\nOR (invoice_item_id IS NOT NULL AND point_ledger_entry_id IS NOT NULL\n    AND approved_points > 0 AND completed_at_utc IS NOT NULL)\nOR (completed_at_utc IS NOT NULL\n    AND completed_by_user_id IS NOT NULL\n    AND refund_method IS NOT NULL)");

            migrationBuilder.AddForeignKey(
                name: "fk_payment_adjustments_point_ledger_entries_point_ledger_entry",
                table: "payment_adjustments",
                column: "point_ledger_entry_id",
                principalTable: "point_ledger_entries",
                principalColumn: "ledger_entry_id",
                onDelete: ReferentialAction.Restrict);

        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "fk_payment_adjustments_point_ledger_entries_point_ledger_entry",
                table: "payment_adjustments");

            migrationBuilder.DropIndex(
                name: "ix_payment_adjustments_point_ledger_entry_id",
                table: "payment_adjustments");

            migrationBuilder.DropCheckConstraint(
                name: "CK_payment_adjustments_refund_completed_evidence",
                table: "payment_adjustments");

            migrationBuilder.AddCheckConstraint(
                name: "CK_payment_adjustments_refund_completed_evidence",
                table: "payment_adjustments",
                sql: "(type <> 0 OR status <> 3)\nOR legacy_payout_unverified\nOR (completed_at_utc IS NOT NULL\n    AND completed_by_user_id IS NOT NULL\n    AND refund_method IS NOT NULL)");
        }
    }
}
