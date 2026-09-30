using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace SportHub.API.Migrations
{
    /// <inheritdoc />
    public partial class ClassTransferInvoiceChain : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "source_invoice_item_id",
                table: "invoice_items",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "transfer_difference_invoice_item_id",
                table: "enrollments",
                type: "uuid",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "ix_invoice_items_source_invoice_item_id",
                table: "invoice_items",
                column: "source_invoice_item_id");

            migrationBuilder.CreateIndex(
                name: "ix_enrollments_transfer_difference_invoice_item_id",
                table: "enrollments",
                column: "transfer_difference_invoice_item_id");

            migrationBuilder.AddForeignKey(
                name: "fk_enrollments_invoice_items_transfer_difference_invoice_item_",
                table: "enrollments",
                column: "transfer_difference_invoice_item_id",
                principalTable: "invoice_items",
                principalColumn: "item_id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "fk_invoice_items_invoice_items_source_invoice_item_id",
                table: "invoice_items",
                column: "source_invoice_item_id",
                principalTable: "invoice_items",
                principalColumn: "item_id",
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "fk_enrollments_invoice_items_transfer_difference_invoice_item_",
                table: "enrollments");

            migrationBuilder.DropForeignKey(
                name: "fk_invoice_items_invoice_items_source_invoice_item_id",
                table: "invoice_items");

            migrationBuilder.DropIndex(
                name: "ix_invoice_items_source_invoice_item_id",
                table: "invoice_items");

            migrationBuilder.DropIndex(
                name: "ix_enrollments_transfer_difference_invoice_item_id",
                table: "enrollments");

            migrationBuilder.DropColumn(
                name: "source_invoice_item_id",
                table: "invoice_items");

            migrationBuilder.DropColumn(
                name: "transfer_difference_invoice_item_id",
                table: "enrollments");
        }
    }
}
