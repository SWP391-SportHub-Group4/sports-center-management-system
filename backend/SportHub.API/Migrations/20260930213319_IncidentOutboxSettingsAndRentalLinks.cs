using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

#pragma warning disable CA1814 // Prefer jagged arrays over multidimensional

namespace SportHub.API.Migrations
{
    /// <inheritdoc />
    public partial class IncidentOutboxSettingsAndRentalLinks : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Rename in place so a Manager's current value survives the key change.
            migrationBuilder.Sql("UPDATE system_settings SET key = 'membership.expiry_notice_days' WHERE key = 'package_expiring_reminder_days'");

            migrationBuilder.AlterColumn<Guid>(
                name: "user_id",
                table: "notifications",
                type: "uuid",
                nullable: true,
                oldClrType: typeof(Guid),
                oldType: "uuid");

            migrationBuilder.AddColumn<DateTime>(
                name: "dispatch_lease_until_utc",
                table: "notifications",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "last_error",
                table: "notifications",
                type: "character varying(120)",
                maxLength: 120,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "protected_email_payload",
                table: "notifications",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "recipient_address",
                table: "notifications",
                type: "character varying(320)",
                maxLength: 320,
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "cancellation_incident_id",
                table: "court_rentals",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "invoice_id",
                table: "court_rentals",
                type: "uuid",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "incident_notices",
                columns: table => new
                {
                    incident_id = table.Column<Guid>(type: "uuid", nullable: false),
                    scope = table.Column<int>(type: "integer", nullable: false),
                    room_id = table.Column<int>(type: "integer", nullable: true),
                    start_at_utc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    end_at_utc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    reason = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: false),
                    resolution_summary = table.Column<string>(type: "character varying(2000)", maxLength: 2000, nullable: false),
                    created_by_user_id = table.Column<Guid>(type: "uuid", nullable: false),
                    created_at_utc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_incident_notices", x => x.incident_id);
                    table.CheckConstraint("ck_incident_notice_range", "end_at_utc > start_at_utc");
                    table.ForeignKey(
                        name: "fk_incident_notices_rooms_room_id",
                        column: x => x.room_id,
                        principalTable: "rooms",
                        principalColumn: "room_id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_incident_notices_user_accounts_created_by_user_id",
                        column: x => x.created_by_user_id,
                        principalTable: "user_accounts",
                        principalColumn: "user_id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.InsertData(
                table: "system_settings",
                columns: new[] { "key", "description", "updated_at", "updated_by_user_id", "value" },
                values: new object[,]
                {
                    { "points.confirm_otp_minutes", "BR-139 — Số phút OTP tại quầy xác nhận dùng điểm còn hiệu lực.", new DateTime(2026, 9, 30, 0, 0, 0, 0, DateTimeKind.Utc), null, "5" },
                    { "rental.advance_days", "BR-128 — Số ngày tối đa được đặt sân trước.", new DateTime(2026, 10, 1, 0, 0, 0, 0, DateTimeKind.Utc), null, "30" },
                    { "rental.cancel_free_hours", "BR-129 — Hủy miễn phí nếu còn ít nhất số giờ này trước lượt thuê.", new DateTime(2026, 10, 1, 0, 0, 0, 0, DateTimeKind.Utc), null, "24" },
                    { "rental.max_hours", "BR-128 — Thời lượng thuê sân tối đa theo giờ.", new DateTime(2026, 10, 1, 0, 0, 0, 0, DateTimeKind.Utc), null, "4" },
                    { "rental.slot_minutes", "BR-126 — Độ dài mỗi khối thuê sân (30 hoặc 60 phút).", new DateTime(2026, 10, 1, 0, 0, 0, 0, DateTimeKind.Utc), null, "60" }
                });

            migrationBuilder.CreateIndex(
                name: "ix_room_blocks_incident_id",
                table: "room_blocks",
                column: "incident_id");

            migrationBuilder.CreateIndex(
                name: "ux_notifications_email_event_recipient",
                table: "notifications",
                columns: new[] { "source_event_type", "recipient_address", "channel", "source_entity_id" },
                unique: true,
                filter: "recipient_address IS NOT NULL AND source_entity_id IS NOT NULL AND channel = 1");

            migrationBuilder.CreateIndex(
                name: "ux_notifications_inapp_event_recipient",
                table: "notifications",
                columns: new[] { "source_event_type", "user_id", "channel", "source_entity_id" },
                unique: true,
                filter: "user_id IS NOT NULL AND source_entity_id IS NOT NULL AND channel = 0");

            migrationBuilder.CreateIndex(
                name: "ix_court_rentals_cancellation_incident_id",
                table: "court_rentals",
                column: "cancellation_incident_id");

            migrationBuilder.CreateIndex(
                name: "ix_court_rentals_invoice_id",
                table: "court_rentals",
                column: "invoice_id");

            migrationBuilder.CreateIndex(
                name: "ix_incident_notices_created_by_user_id",
                table: "incident_notices",
                column: "created_by_user_id");

            migrationBuilder.CreateIndex(
                name: "ix_incident_notices_room_id",
                table: "incident_notices",
                column: "room_id");

            migrationBuilder.CreateIndex(
                name: "ix_incident_notices_scope_room_id_start_at_utc",
                table: "incident_notices",
                columns: new[] { "scope", "room_id", "start_at_utc" });

            migrationBuilder.AddForeignKey(
                name: "fk_court_rentals_incident_notices_cancellation_incident_id",
                table: "court_rentals",
                column: "cancellation_incident_id",
                principalTable: "incident_notices",
                principalColumn: "incident_id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "fk_court_rentals_invoices_invoice_id",
                table: "court_rentals",
                column: "invoice_id",
                principalTable: "invoices",
                principalColumn: "invoice_id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "fk_room_blocks_incident_notices_incident_id",
                table: "room_blocks",
                column: "incident_id",
                principalTable: "incident_notices",
                principalColumn: "incident_id",
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "fk_court_rentals_incident_notices_cancellation_incident_id",
                table: "court_rentals");

            migrationBuilder.DropForeignKey(
                name: "fk_court_rentals_invoices_invoice_id",
                table: "court_rentals");

            migrationBuilder.DropForeignKey(
                name: "fk_room_blocks_incident_notices_incident_id",
                table: "room_blocks");

            migrationBuilder.DropTable(
                name: "incident_notices");

            migrationBuilder.DropIndex(
                name: "ix_room_blocks_incident_id",
                table: "room_blocks");

            migrationBuilder.DropIndex(
                name: "ux_notifications_email_event_recipient",
                table: "notifications");

            migrationBuilder.DropIndex(
                name: "ux_notifications_inapp_event_recipient",
                table: "notifications");

            migrationBuilder.DropIndex(
                name: "ix_court_rentals_cancellation_incident_id",
                table: "court_rentals");

            migrationBuilder.DropIndex(
                name: "ix_court_rentals_invoice_id",
                table: "court_rentals");

            migrationBuilder.Sql("UPDATE system_settings SET key = 'package_expiring_reminder_days' WHERE key = 'membership.expiry_notice_days'");

            migrationBuilder.DeleteData(
                table: "system_settings",
                keyColumn: "key",
                keyValue: "points.confirm_otp_minutes");

            migrationBuilder.DeleteData(
                table: "system_settings",
                keyColumn: "key",
                keyValue: "rental.advance_days");

            migrationBuilder.DeleteData(
                table: "system_settings",
                keyColumn: "key",
                keyValue: "rental.cancel_free_hours");

            migrationBuilder.DeleteData(
                table: "system_settings",
                keyColumn: "key",
                keyValue: "rental.max_hours");

            migrationBuilder.DeleteData(
                table: "system_settings",
                keyColumn: "key",
                keyValue: "rental.slot_minutes");

            migrationBuilder.DropColumn(
                name: "dispatch_lease_until_utc",
                table: "notifications");

            migrationBuilder.DropColumn(
                name: "last_error",
                table: "notifications");

            migrationBuilder.DropColumn(
                name: "protected_email_payload",
                table: "notifications");

            migrationBuilder.DropColumn(
                name: "recipient_address",
                table: "notifications");

            migrationBuilder.DropColumn(
                name: "cancellation_incident_id",
                table: "court_rentals");

            migrationBuilder.DropColumn(
                name: "invoice_id",
                table: "court_rentals");

            migrationBuilder.AlterColumn<Guid>(
                name: "user_id",
                table: "notifications",
                type: "uuid",
                nullable: false,
                defaultValue: new Guid("00000000-0000-0000-0000-000000000000"),
                oldClrType: typeof(Guid),
                oldType: "uuid",
                oldNullable: true);

        }
    }
}
