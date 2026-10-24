using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

#pragma warning disable CA1814 // Prefer jagged arrays over multidimensional

namespace SportHub.API.Migrations
{
    /// <inheritdoc />
    public partial class AddSupportPayoutFoundation : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "invoice_id",
                table: "member_support_requests",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "last_member_remind_at_utc",
                table: "member_support_requests",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "last_staff_remind_at_utc",
                table: "member_support_requests",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "remind_count",
                table: "member_support_requests",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<DateTime>(
                name: "sla_due_at_utc",
                table: "member_support_requests",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.Sql("UPDATE member_support_requests SET sla_due_at_utc = created_at + INTERVAL '48 hours';");
            migrationBuilder.AlterColumn<DateTime>(
                name: "sla_due_at_utc",
                table: "member_support_requests",
                type: "timestamp with time zone",
                nullable: false,
                oldClrType: typeof(DateTime),
                oldType: "timestamp with time zone",
                oldNullable: true);

            migrationBuilder.AddColumn<string>(
                name: "kind",
                table: "member_support_attachments",
                type: "character varying(20)",
                maxLength: 20,
                nullable: false,
                defaultValue: "MEMBER_PROOF");

            migrationBuilder.AddColumn<Guid>(
                name: "payout_id",
                table: "member_support_attachments",
                type: "uuid",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "member_support_payout_details",
                columns: table => new
                {
                    request_id = table.Column<Guid>(type: "uuid", nullable: false),
                    bank_name = table.Column<string>(type: "character varying(120)", maxLength: 120, nullable: true),
                    account_number_encrypted = table.Column<string>(type: "character varying(2048)", maxLength: 2048, nullable: true),
                    account_last4 = table.Column<string>(type: "character varying(4)", maxLength: 4, nullable: true),
                    account_holder = table.Column<string>(type: "character varying(160)", maxLength: 160, nullable: true),
                    purged_at_utc = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_member_support_payout_details", x => x.request_id);
                    table.ForeignKey(
                        name: "fk_member_support_payout_details_member_support_requests_reque",
                        column: x => x.request_id,
                        principalTable: "member_support_requests",
                        principalColumn: "request_id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "member_support_payouts",
                columns: table => new
                {
                    payout_id = table.Column<Guid>(type: "uuid", nullable: false),
                    request_id = table.Column<Guid>(type: "uuid", nullable: false),
                    invoice_id = table.Column<Guid>(type: "uuid", nullable: false),
                    amount = table.Column<decimal>(type: "numeric(18,2)", precision: 18, scale: 2, nullable: false),
                    note = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: true),
                    recorded_by_user_id = table.Column<Guid>(type: "uuid", nullable: false),
                    recorded_at_utc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    member_confirmed_at_utc = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    member_confirmed_by = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_member_support_payouts", x => x.payout_id);
                    table.CheckConstraint("ck_member_support_payout_amount_positive", "amount > 0");
                    table.ForeignKey(
                        name: "fk_member_support_payouts_invoices_invoice_id",
                        column: x => x.invoice_id,
                        principalTable: "invoices",
                        principalColumn: "invoice_id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_member_support_payouts_member_support_requests_request_id",
                        column: x => x.request_id,
                        principalTable: "member_support_requests",
                        principalColumn: "request_id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_member_support_payouts_user_accounts_recorded_by_user_id",
                        column: x => x.recorded_by_user_id,
                        principalTable: "user_accounts",
                        principalColumn: "user_id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.InsertData(
                table: "system_settings",
                columns: new[] { "key", "description", "updated_at", "updated_by_user_id", "value" },
                values: new object[,]
                {
                    { "support.bank_data_retention_days", "Days to retain bank details after a support request closes.", new DateTime(2026, 10, 24, 0, 0, 0, 0, DateTimeKind.Utc), null, "90" },
                    { "support.payout_confirm_days", "Days before an unconfirmed support payout is confirmed automatically.", new DateTime(2026, 10, 24, 0, 0, 0, 0, DateTimeKind.Utc), null, "3" },
                    { "support.remind_cooldown_hours", "Minimum hours between member support reminders.", new DateTime(2026, 10, 24, 0, 0, 0, 0, DateTimeKind.Utc), null, "48" },
                    { "support.sla_hours", "Hours allowed for a support request response.", new DateTime(2026, 10, 24, 0, 0, 0, 0, DateTimeKind.Utc), null, "48" }
                });

            migrationBuilder.CreateIndex(
                name: "ix_member_support_requests_invoice_id",
                table: "member_support_requests",
                column: "invoice_id",
                unique: true,
                filter: "invoice_id IS NOT NULL AND status NOT IN ('CLOSED', 'DONE', 'REJECTED')");

            migrationBuilder.CreateIndex(
                name: "ix_member_support_requests_status_sla_due_at_utc",
                table: "member_support_requests",
                columns: new[] { "status", "sla_due_at_utc" });

            migrationBuilder.CreateIndex(
                name: "ix_member_support_attachments_payout_id",
                table: "member_support_attachments",
                column: "payout_id");

            migrationBuilder.AddCheckConstraint(
                name: "ck_support_attachment_kind_payout",
                table: "member_support_attachments",
                sql: "(kind = 'MEMBER_PROOF' AND payout_id IS NULL) OR (kind = 'PAYOUT_PROOF' AND payout_id IS NOT NULL)");

            migrationBuilder.CreateIndex(
                name: "ix_member_support_payouts_invoice_id",
                table: "member_support_payouts",
                column: "invoice_id");

            migrationBuilder.CreateIndex(
                name: "ix_member_support_payouts_recorded_by_user_id",
                table: "member_support_payouts",
                column: "recorded_by_user_id");

            migrationBuilder.CreateIndex(
                name: "ix_member_support_payouts_request_id",
                table: "member_support_payouts",
                column: "request_id",
                unique: true);

            migrationBuilder.AddForeignKey(
                name: "fk_member_support_attachments_member_support_payouts_payout_id",
                table: "member_support_attachments",
                column: "payout_id",
                principalTable: "member_support_payouts",
                principalColumn: "payout_id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "fk_member_support_requests_invoices_invoice_id",
                table: "member_support_requests",
                column: "invoice_id",
                principalTable: "invoices",
                principalColumn: "invoice_id",
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "fk_member_support_attachments_member_support_payouts_payout_id",
                table: "member_support_attachments");

            migrationBuilder.DropForeignKey(
                name: "fk_member_support_requests_invoices_invoice_id",
                table: "member_support_requests");

            migrationBuilder.DropTable(
                name: "member_support_payout_details");

            migrationBuilder.DropTable(
                name: "member_support_payouts");

            migrationBuilder.DropIndex(
                name: "ix_member_support_requests_invoice_id",
                table: "member_support_requests");

            migrationBuilder.DropIndex(
                name: "ix_member_support_requests_status_sla_due_at_utc",
                table: "member_support_requests");

            migrationBuilder.DropIndex(
                name: "ix_member_support_attachments_payout_id",
                table: "member_support_attachments");

            migrationBuilder.DropCheckConstraint(
                name: "ck_support_attachment_kind_payout",
                table: "member_support_attachments");

            migrationBuilder.DeleteData(
                table: "system_settings",
                keyColumn: "key",
                keyValue: "support.bank_data_retention_days");

            migrationBuilder.DeleteData(
                table: "system_settings",
                keyColumn: "key",
                keyValue: "support.payout_confirm_days");

            migrationBuilder.DeleteData(
                table: "system_settings",
                keyColumn: "key",
                keyValue: "support.remind_cooldown_hours");

            migrationBuilder.DeleteData(
                table: "system_settings",
                keyColumn: "key",
                keyValue: "support.sla_hours");

            migrationBuilder.DropColumn(
                name: "invoice_id",
                table: "member_support_requests");

            migrationBuilder.DropColumn(
                name: "last_member_remind_at_utc",
                table: "member_support_requests");

            migrationBuilder.DropColumn(
                name: "last_staff_remind_at_utc",
                table: "member_support_requests");

            migrationBuilder.DropColumn(
                name: "remind_count",
                table: "member_support_requests");

            migrationBuilder.DropColumn(
                name: "sla_due_at_utc",
                table: "member_support_requests");

            migrationBuilder.DropColumn(
                name: "kind",
                table: "member_support_attachments");

            migrationBuilder.DropColumn(
                name: "payout_id",
                table: "member_support_attachments");
        }
    }
}
