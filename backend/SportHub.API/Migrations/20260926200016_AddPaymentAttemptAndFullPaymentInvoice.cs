using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace SportHub.API.Migrations
{
    public partial class AddPaymentAttemptAndFullPaymentInvoice : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql(
                """
                DO $$
                BEGIN
                    IF EXISTS (SELECT 1 FROM invoices WHERE status = 1) THEN
                        RAISE EXCEPTION 'Migration blocked: invoices with legacy PartiallyPaid status (status=1) exist. This refactor removes partial-payment support; reset the dev database before migrating (see docs/RUNBOOK.md).';
                    END IF;
                END $$;
                """);

            migrationBuilder.DropIndex(
                name: "ix_invoices_due_date_utc",
                table: "invoices");

            migrationBuilder.DropColumn(
                name: "due_date_utc",
                table: "invoices");

            migrationBuilder.DropColumn(
                name: "first_deposit_at_utc",
                table: "invoices");

            migrationBuilder.RenameColumn(
                name: "amount",
                table: "invoice_items",
                newName: "unit_price");

            migrationBuilder.RenameColumn(
                name: "related_entity_type",
                table: "invoice_items",
                newName: "item_type");

            migrationBuilder.AlterColumn<string>(
                name: "description",
                table: "invoice_items",
                type: "character varying(500)",
                maxLength: 500,
                nullable: false,
                oldClrType: typeof(string),
                oldType: "text");

            migrationBuilder.AddColumn<int>(
                name: "quantity",
                table: "invoice_items",
                type: "integer",
                nullable: false,
                defaultValue: 1);

            migrationBuilder.AddColumn<decimal>(
                name: "line_amount",
                table: "invoice_items",
                type: "numeric(18,0)",
                precision: 18,
                scale: 0,
                nullable: true);

            migrationBuilder.Sql("UPDATE invoice_items SET line_amount = unit_price * quantity;");

            migrationBuilder.AlterColumn<decimal>(
                name: "line_amount",
                table: "invoice_items",
                type: "numeric(18,0)",
                precision: 18,
                scale: 0,
                nullable: false,
                oldClrType: typeof(decimal),
                oldType: "numeric(18,0)",
                oldNullable: true);

            migrationBuilder.CreateTable(
                name: "payment_attempts",
                columns: table => new
                {
                    payment_attempt_id = table.Column<Guid>(type: "uuid", nullable: false),
                    invoice_id = table.Column<Guid>(type: "uuid", nullable: false),
                    vnp_txn_ref = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    amount = table.Column<decimal>(type: "numeric(18,0)", precision: 18, scale: 0, nullable: false),
                    vnp_expire_date = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    status = table.Column<int>(type: "integer", nullable: false),
                    created_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_payment_attempts", x => x.payment_attempt_id);
                    table.ForeignKey(
                        name: "fk_payment_attempts_invoices_invoice_id",
                        column: x => x.invoice_id,
                        principalTable: "invoices",
                        principalColumn: "invoice_id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.AddCheckConstraint(
                name: "CK_invoice_items_line_amount_matches",
                table: "invoice_items",
                sql: "line_amount = unit_price * quantity");

            migrationBuilder.AddCheckConstraint(
                name: "CK_invoice_items_quantity_positive",
                table: "invoice_items",
                sql: "quantity > 0");

            migrationBuilder.AddCheckConstraint(
                name: "CK_invoice_items_unit_price_non_negative",
                table: "invoice_items",
                sql: "unit_price >= 0");

            migrationBuilder.CreateIndex(
                name: "ix_payment_attempts_invoice_id_status",
                table: "payment_attempts",
                columns: new[] { "invoice_id", "status" });

            migrationBuilder.CreateIndex(
                name: "ix_payment_attempts_vnp_txn_ref",
                table: "payment_attempts",
                column: "vnp_txn_ref",
                unique: true);
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "payment_attempts");

            migrationBuilder.DropCheckConstraint(
                name: "CK_invoice_items_line_amount_matches",
                table: "invoice_items");

            migrationBuilder.DropCheckConstraint(
                name: "CK_invoice_items_quantity_positive",
                table: "invoice_items");

            migrationBuilder.DropCheckConstraint(
                name: "CK_invoice_items_unit_price_non_negative",
                table: "invoice_items");

            migrationBuilder.DropColumn(
                name: "line_amount",
                table: "invoice_items");

            migrationBuilder.DropColumn(
                name: "quantity",
                table: "invoice_items");

            migrationBuilder.RenameColumn(
                name: "item_type",
                table: "invoice_items",
                newName: "related_entity_type");

            migrationBuilder.RenameColumn(
                name: "unit_price",
                table: "invoice_items",
                newName: "amount");

            migrationBuilder.AlterColumn<string>(
                name: "description",
                table: "invoice_items",
                type: "text",
                nullable: false,
                oldClrType: typeof(string),
                oldType: "character varying(500)",
                oldMaxLength: 500);

            migrationBuilder.AddColumn<DateTime>(
                name: "due_date_utc",
                table: "invoices",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "first_deposit_at_utc",
                table: "invoices",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "ix_invoices_due_date_utc",
                table: "invoices",
                column: "due_date_utc");
        }
    }
}
