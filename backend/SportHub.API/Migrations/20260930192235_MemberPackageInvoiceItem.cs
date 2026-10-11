using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace SportHub.API.Migrations
{
    /// <inheritdoc />
    public partial class MemberPackageInvoiceItem : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "invoice_item_id",
                table: "member_packages",
                type: "uuid",
                nullable: true);

            migrationBuilder.Sql("""
                UPDATE member_packages AS package
                SET invoice_item_id = item.item_id
                FROM invoice_items AS item
                WHERE item.item_type = 0
                  AND item.related_entity_id = package.member_package_id;
                """);

            migrationBuilder.CreateIndex(
                name: "ix_member_packages_invoice_item_id",
                table: "member_packages",
                column: "invoice_item_id",
                unique: true,
                filter: "invoice_item_id IS NOT NULL");

            migrationBuilder.AddForeignKey(
                name: "fk_member_packages_invoice_items_invoice_item_id",
                table: "member_packages",
                column: "invoice_item_id",
                principalTable: "invoice_items",
                principalColumn: "item_id",
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "fk_member_packages_invoice_items_invoice_item_id",
                table: "member_packages");

            migrationBuilder.DropIndex(
                name: "ix_member_packages_invoice_item_id",
                table: "member_packages");

            migrationBuilder.DropColumn(
                name: "invoice_item_id",
                table: "member_packages");
        }
    }
}
