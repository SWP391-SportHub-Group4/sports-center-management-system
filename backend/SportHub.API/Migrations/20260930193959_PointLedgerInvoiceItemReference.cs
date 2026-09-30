using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace SportHub.API.Migrations
{
    /// <inheritdoc />
    public partial class PointLedgerInvoiceItemReference : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "invoice_item_id",
                table: "point_ledger_entries",
                type: "uuid",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "ix_point_ledger_entries_invoice_item_id",
                table: "point_ledger_entries",
                column: "invoice_item_id");

            migrationBuilder.AddForeignKey(
                name: "fk_point_ledger_entries_invoice_items_invoice_item_id",
                table: "point_ledger_entries",
                column: "invoice_item_id",
                principalTable: "invoice_items",
                principalColumn: "item_id",
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "fk_point_ledger_entries_invoice_items_invoice_item_id",
                table: "point_ledger_entries");

            migrationBuilder.DropIndex(
                name: "ix_point_ledger_entries_invoice_item_id",
                table: "point_ledger_entries");

            migrationBuilder.DropColumn(
                name: "invoice_item_id",
                table: "point_ledger_entries");
        }
    }
}
