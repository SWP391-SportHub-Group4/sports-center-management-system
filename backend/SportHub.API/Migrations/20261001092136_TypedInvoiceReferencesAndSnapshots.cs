using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace SportHub.API.Migrations
{
    /// <inheritdoc />
    public partial class TypedInvoiceReferencesAndSnapshots : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "fk_invoice_items_invoices_invoice_id",
                table: "invoice_items");

            migrationBuilder.AddColumn<Guid>(
                name: "payment_attempt_id",
                table: "payments",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "duration_days_snapshot",
                table: "member_packages",
                type: "integer",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "class_id",
                table: "invoice_items",
                type: "integer",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "court_rental_id",
                table: "invoice_items",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "member_package_id",
                table: "invoice_items",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "pt_entitlement_id",
                table: "invoice_items",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "pt_frequency_per_week",
                table: "invoice_items",
                type: "integer",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "sport_id",
                table: "invoice_items",
                type: "integer",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "sport_name_snapshot",
                table: "invoice_items",
                type: "character varying(200)",
                maxLength: 200,
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "ix_payments_payment_attempt_id",
                table: "payments",
                column: "payment_attempt_id");

            migrationBuilder.CreateIndex(
                name: "ix_invoice_items_class_id",
                table: "invoice_items",
                column: "class_id");

            migrationBuilder.CreateIndex(
                name: "ix_invoice_items_court_rental_id",
                table: "invoice_items",
                column: "court_rental_id");

            migrationBuilder.CreateIndex(
                name: "ix_invoice_items_member_package_id",
                table: "invoice_items",
                column: "member_package_id");

            migrationBuilder.CreateIndex(
                name: "ix_invoice_items_pt_entitlement_id",
                table: "invoice_items",
                column: "pt_entitlement_id");

            migrationBuilder.CreateIndex(
                name: "ix_invoice_items_sport_id",
                table: "invoice_items",
                column: "sport_id");

            migrationBuilder.AddForeignKey(
                name: "fk_invoice_items_classes_class_id",
                table: "invoice_items",
                column: "class_id",
                principalTable: "classes",
                principalColumn: "class_id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "fk_invoice_items_court_rentals_court_rental_id",
                table: "invoice_items",
                column: "court_rental_id",
                principalTable: "court_rentals",
                principalColumn: "court_rental_id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "fk_invoice_items_invoices_invoice_id",
                table: "invoice_items",
                column: "invoice_id",
                principalTable: "invoices",
                principalColumn: "invoice_id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "fk_invoice_items_member_packages_member_package_id",
                table: "invoice_items",
                column: "member_package_id",
                principalTable: "member_packages",
                principalColumn: "member_package_id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "fk_invoice_items_pt_entitlements_pt_entitlement_id",
                table: "invoice_items",
                column: "pt_entitlement_id",
                principalTable: "pt_entitlements",
                principalColumn: "entitlement_id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "fk_invoice_items_sports_sport_id",
                table: "invoice_items",
                column: "sport_id",
                principalTable: "sports",
                principalColumn: "sport_id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "fk_payments_payment_attempts_payment_attempt_id",
                table: "payments",
                column: "payment_attempt_id",
                principalTable: "payment_attempts",
                principalColumn: "payment_attempt_id",
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "fk_invoice_items_classes_class_id",
                table: "invoice_items");

            migrationBuilder.DropForeignKey(
                name: "fk_invoice_items_court_rentals_court_rental_id",
                table: "invoice_items");

            migrationBuilder.DropForeignKey(
                name: "fk_invoice_items_invoices_invoice_id",
                table: "invoice_items");

            migrationBuilder.DropForeignKey(
                name: "fk_invoice_items_member_packages_member_package_id",
                table: "invoice_items");

            migrationBuilder.DropForeignKey(
                name: "fk_invoice_items_pt_entitlements_pt_entitlement_id",
                table: "invoice_items");

            migrationBuilder.DropForeignKey(
                name: "fk_invoice_items_sports_sport_id",
                table: "invoice_items");

            migrationBuilder.DropForeignKey(
                name: "fk_payments_payment_attempts_payment_attempt_id",
                table: "payments");

            migrationBuilder.DropIndex(
                name: "ix_payments_payment_attempt_id",
                table: "payments");

            migrationBuilder.DropIndex(
                name: "ix_invoice_items_class_id",
                table: "invoice_items");

            migrationBuilder.DropIndex(
                name: "ix_invoice_items_court_rental_id",
                table: "invoice_items");

            migrationBuilder.DropIndex(
                name: "ix_invoice_items_member_package_id",
                table: "invoice_items");

            migrationBuilder.DropIndex(
                name: "ix_invoice_items_pt_entitlement_id",
                table: "invoice_items");

            migrationBuilder.DropIndex(
                name: "ix_invoice_items_sport_id",
                table: "invoice_items");

            migrationBuilder.DropColumn(
                name: "payment_attempt_id",
                table: "payments");

            migrationBuilder.DropColumn(
                name: "duration_days_snapshot",
                table: "member_packages");

            migrationBuilder.DropColumn(
                name: "class_id",
                table: "invoice_items");

            migrationBuilder.DropColumn(
                name: "court_rental_id",
                table: "invoice_items");

            migrationBuilder.DropColumn(
                name: "member_package_id",
                table: "invoice_items");

            migrationBuilder.DropColumn(
                name: "pt_entitlement_id",
                table: "invoice_items");

            migrationBuilder.DropColumn(
                name: "pt_frequency_per_week",
                table: "invoice_items");

            migrationBuilder.DropColumn(
                name: "sport_id",
                table: "invoice_items");

            migrationBuilder.DropColumn(
                name: "sport_name_snapshot",
                table: "invoice_items");

            migrationBuilder.AddForeignKey(
                name: "fk_invoice_items_invoices_invoice_id",
                table: "invoice_items",
                column: "invoice_id",
                principalTable: "invoices",
                principalColumn: "invoice_id",
                onDelete: ReferentialAction.Cascade);
        }
    }
}
