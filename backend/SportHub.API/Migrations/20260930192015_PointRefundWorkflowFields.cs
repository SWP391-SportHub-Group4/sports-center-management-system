using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace SportHub.API.Migrations
{
    /// <inheritdoc />
    public partial class PointRefundWorkflowFields : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "approved_points",
                table: "payment_adjustments",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<bool>(
                name: "center_fault",
                table: "payment_adjustments",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<Guid>(
                name: "invoice_item_id",
                table: "payment_adjustments",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "point_ledger_entry_id",
                table: "payment_adjustments",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "system_calculated_points",
                table: "payment_adjustments",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            // Keep item scope for legacy single-item invoices without guessing on multi-item invoices.
            migrationBuilder.Sql("""
                UPDATE payment_adjustments AS adjustment
                SET invoice_item_id = item.item_id
                FROM invoice_items AS item
                WHERE adjustment.type = 0
                  AND adjustment.invoice_id = item.invoice_id
                  AND (SELECT count(*) FROM invoice_items AS candidates
                       WHERE candidates.invoice_id = adjustment.invoice_id) = 1;
                """);

            migrationBuilder.CreateIndex(
                name: "ix_payment_adjustments_invoice_item_id",
                table: "payment_adjustments",
                column: "invoice_item_id");

            migrationBuilder.AddForeignKey(
                name: "fk_payment_adjustments_invoice_items_invoice_item_id",
                table: "payment_adjustments",
                column: "invoice_item_id",
                principalTable: "invoice_items",
                principalColumn: "item_id",
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "fk_payment_adjustments_invoice_items_invoice_item_id",
                table: "payment_adjustments");

            migrationBuilder.DropIndex(
                name: "ix_payment_adjustments_invoice_item_id",
                table: "payment_adjustments");

            migrationBuilder.DropColumn(
                name: "approved_points",
                table: "payment_adjustments");

            migrationBuilder.DropColumn(
                name: "center_fault",
                table: "payment_adjustments");

            migrationBuilder.DropColumn(
                name: "invoice_item_id",
                table: "payment_adjustments");

            migrationBuilder.DropColumn(
                name: "point_ledger_entry_id",
                table: "payment_adjustments");

            migrationBuilder.DropColumn(
                name: "system_calculated_points",
                table: "payment_adjustments");
        }
    }
}
