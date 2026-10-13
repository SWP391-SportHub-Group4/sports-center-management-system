using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

#pragma warning disable CA1814 // Prefer jagged arrays over multidimensional

namespace SportHub.API.Migrations
{
    /// <inheritdoc />
    public partial class RemovePersonalTraining : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Personal Training đã ngừng cung cấp: dọn dữ liệu còn tham chiếu trước khi bỏ bảng PT.
            migrationBuilder.Sql("""
                DELETE FROM coach_occupancies WHERE source_type = 1;
                DELETE FROM room_occupancies WHERE source_type = 1;
                UPDATE rooms SET room_type_id = 1 WHERE room_type_id = 2;
                DELETE FROM system_settings WHERE key IN ('pt.self_book_min_lead_hours', 'pt.self_book_max_advance_days');
                UPDATE membership_packages
                   SET description = btrim(regexp_replace(description,
                       '\s*(Cần Membership Gym còn hiệu lực để mua PT riêng\.|An active Gym membership is required to purchase PT separately\.)', '', 'g'))
                 WHERE description LIKE '%PT%';
                """);

            migrationBuilder.DropForeignKey(
                name: "fk_invoice_items_pt_entitlements_pt_entitlement_id",
                table: "invoice_items");

            migrationBuilder.DropTable(
                name: "coach_service_qualifications");

            migrationBuilder.DropTable(
                name: "pt_coach_change_requests");

            migrationBuilder.DropTable(
                name: "pt_session_change_requests");

            migrationBuilder.DropTable(
                name: "service_room_types");

            migrationBuilder.DropTable(
                name: "workout_results");

            migrationBuilder.DropTable(
                name: "pt_sessions");

            migrationBuilder.DropTable(
                name: "pt_entitlements");

            migrationBuilder.DropIndex(
                name: "ix_invoice_items_pt_entitlement_id",
                table: "invoice_items");

            migrationBuilder.DeleteData(
                table: "sport_room_types",
                keyColumns: new[] { "room_type_id", "sport_id" },
                keyValues: new object[] { 2, 1 });

            migrationBuilder.DeleteData(
                table: "sport_service_offerings",
                keyColumn: "offering_id",
                keyValue: 2);

            migrationBuilder.DeleteData(
                table: "system_settings",
                keyColumn: "key",
                keyValue: "pt.price_per_session_vnd");

            migrationBuilder.DeleteData(
                table: "room_types",
                keyColumn: "room_type_id",
                keyValue: 2);

            migrationBuilder.DropColumn(
                name: "pt_entitlement_id",
                table: "invoice_items");

            migrationBuilder.DropColumn(
                name: "pt_frequency_per_week",
                table: "invoice_items");

            migrationBuilder.DropColumn(
                name: "pt_coach_id",
                table: "checkout_sessions");

            migrationBuilder.DropColumn(
                name: "pt_frequency",
                table: "checkout_sessions");

            migrationBuilder.DropColumn(
                name: "pt_member_package_id",
                table: "checkout_sessions");

            migrationBuilder.DropColumn(
                name: "pt_room_id",
                table: "checkout_sessions");

            migrationBuilder.DropColumn(
                name: "pt_start_at_utc",
                table: "checkout_sessions");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
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

            migrationBuilder.AddColumn<Guid>(
                name: "pt_coach_id",
                table: "checkout_sessions",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "pt_frequency",
                table: "checkout_sessions",
                type: "integer",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "pt_member_package_id",
                table: "checkout_sessions",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "pt_room_id",
                table: "checkout_sessions",
                type: "integer",
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "pt_start_at_utc",
                table: "checkout_sessions",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "coach_service_qualifications",
                columns: table => new
                {
                    user_id = table.Column<Guid>(type: "uuid", nullable: false),
                    offering_id = table.Column<int>(type: "integer", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_coach_service_qualifications", x => new { x.user_id, x.offering_id });
                    table.ForeignKey(
                        name: "fk_coach_service_qualifications_sport_service_offerings_offeri",
                        column: x => x.offering_id,
                        principalTable: "sport_service_offerings",
                        principalColumn: "offering_id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_coach_service_qualifications_user_accounts_user_id",
                        column: x => x.user_id,
                        principalTable: "user_accounts",
                        principalColumn: "user_id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "pt_entitlements",
                columns: table => new
                {
                    entitlement_id = table.Column<Guid>(type: "uuid", nullable: false),
                    coach_id = table.Column<Guid>(type: "uuid", nullable: false),
                    current_member_package_id = table.Column<Guid>(type: "uuid", nullable: false),
                    member_id = table.Column<Guid>(type: "uuid", nullable: false),
                    origin_member_package_id = table.Column<Guid>(type: "uuid", nullable: false),
                    activated_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    activation_reference = table.Column<Guid>(type: "uuid", nullable: true),
                    cancelled_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    carry_over_until_date = table.Column<DateOnly>(type: "date", nullable: false),
                    consumed_sessions = table.Column<int>(type: "integer", nullable: false),
                    frequency_per_week = table.Column<int>(type: "integer", nullable: false),
                    reserved_sessions = table.Column<int>(type: "integer", nullable: false),
                    status = table.Column<int>(type: "integer", nullable: false),
                    total_quota = table.Column<int>(type: "integer", nullable: false),
                    validity_end_date = table.Column<DateOnly>(type: "date", nullable: false),
                    validity_start_date = table.Column<DateOnly>(type: "date", nullable: false),
                    version = table.Column<int>(type: "integer", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_pt_entitlements", x => x.entitlement_id);
                    table.CheckConstraint("CK_pt_entitlements_frequency_per_week", "frequency_per_week IN (1, 2, 3)");
                    table.CheckConstraint("CK_pt_entitlements_quota_counters_non_negative", "reserved_sessions >= 0 AND consumed_sessions >= 0");
                    table.CheckConstraint("CK_pt_entitlements_quota_within_total", "reserved_sessions + consumed_sessions <= total_quota");
                    table.ForeignKey(
                        name: "fk_pt_entitlements_member_packages_current_member_package_id",
                        column: x => x.current_member_package_id,
                        principalTable: "member_packages",
                        principalColumn: "member_package_id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_pt_entitlements_member_packages_origin_member_package_id",
                        column: x => x.origin_member_package_id,
                        principalTable: "member_packages",
                        principalColumn: "member_package_id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_pt_entitlements_user_accounts_coach_id",
                        column: x => x.coach_id,
                        principalTable: "user_accounts",
                        principalColumn: "user_id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_pt_entitlements_user_accounts_member_id",
                        column: x => x.member_id,
                        principalTable: "user_accounts",
                        principalColumn: "user_id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "service_room_types",
                columns: table => new
                {
                    offering_id = table.Column<int>(type: "integer", nullable: false),
                    room_type_id = table.Column<int>(type: "integer", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_service_room_types", x => new { x.offering_id, x.room_type_id });
                    table.ForeignKey(
                        name: "fk_service_room_types_room_types_room_type_id",
                        column: x => x.room_type_id,
                        principalTable: "room_types",
                        principalColumn: "room_type_id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_service_room_types_sport_service_offerings_offering_id",
                        column: x => x.offering_id,
                        principalTable: "sport_service_offerings",
                        principalColumn: "offering_id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "pt_coach_change_requests",
                columns: table => new
                {
                    request_id = table.Column<Guid>(type: "uuid", nullable: false),
                    current_coach_id = table.Column<Guid>(type: "uuid", nullable: false),
                    entitlement_id = table.Column<Guid>(type: "uuid", nullable: false),
                    member_id = table.Column<Guid>(type: "uuid", nullable: false),
                    requested_coach_id = table.Column<Guid>(type: "uuid", nullable: false),
                    reviewed_by_user_id = table.Column<Guid>(type: "uuid", nullable: true),
                    reason = table.Column<string>(type: "text", nullable: true),
                    requested_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    review_note = table.Column<string>(type: "text", nullable: true),
                    reviewed_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    status = table.Column<int>(type: "integer", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_pt_coach_change_requests", x => x.request_id);
                    table.ForeignKey(
                        name: "fk_pt_coach_change_requests_pt_entitlements_entitlement_id",
                        column: x => x.entitlement_id,
                        principalTable: "pt_entitlements",
                        principalColumn: "entitlement_id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_pt_coach_change_requests_user_accounts_current_coach_id",
                        column: x => x.current_coach_id,
                        principalTable: "user_accounts",
                        principalColumn: "user_id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_pt_coach_change_requests_user_accounts_member_id",
                        column: x => x.member_id,
                        principalTable: "user_accounts",
                        principalColumn: "user_id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_pt_coach_change_requests_user_accounts_requested_coach_id",
                        column: x => x.requested_coach_id,
                        principalTable: "user_accounts",
                        principalColumn: "user_id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_pt_coach_change_requests_user_accounts_reviewed_by_user_id",
                        column: x => x.reviewed_by_user_id,
                        principalTable: "user_accounts",
                        principalColumn: "user_id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "pt_sessions",
                columns: table => new
                {
                    session_id = table.Column<Guid>(type: "uuid", nullable: false),
                    coach_id = table.Column<Guid>(type: "uuid", nullable: false),
                    entitlement_id = table.Column<Guid>(type: "uuid", nullable: false),
                    member_id = table.Column<Guid>(type: "uuid", nullable: false),
                    rescheduled_from_session_id = table.Column<Guid>(type: "uuid", nullable: true),
                    cancellation_reason = table.Column<string>(type: "text", nullable: true),
                    cancelled_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    completed_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    created_by_user_id = table.Column<Guid>(type: "uuid", nullable: false),
                    end_at_utc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    quota_state = table.Column<int>(type: "integer", nullable: false),
                    room_id = table.Column<int>(type: "integer", nullable: true),
                    start_at_utc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    status = table.Column<int>(type: "integer", nullable: false),
                    version = table.Column<int>(type: "integer", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_pt_sessions", x => x.session_id);
                    table.CheckConstraint("CK_pt_sessions_duration_is_ninety_minutes", "end_at_utc = start_at_utc + interval '90 minutes'");
                    table.ForeignKey(
                        name: "fk_pt_sessions_pt_entitlements_entitlement_id",
                        column: x => x.entitlement_id,
                        principalTable: "pt_entitlements",
                        principalColumn: "entitlement_id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_pt_sessions_pt_sessions_rescheduled_from_session_id",
                        column: x => x.rescheduled_from_session_id,
                        principalTable: "pt_sessions",
                        principalColumn: "session_id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_pt_sessions_rooms_room_id",
                        column: x => x.room_id,
                        principalTable: "rooms",
                        principalColumn: "room_id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_pt_sessions_user_accounts_coach_id",
                        column: x => x.coach_id,
                        principalTable: "user_accounts",
                        principalColumn: "user_id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_pt_sessions_user_accounts_member_id",
                        column: x => x.member_id,
                        principalTable: "user_accounts",
                        principalColumn: "user_id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "pt_session_change_requests",
                columns: table => new
                {
                    request_id = table.Column<Guid>(type: "uuid", nullable: false),
                    requested_by_user_id = table.Column<Guid>(type: "uuid", nullable: false),
                    reviewed_by_user_id = table.Column<Guid>(type: "uuid", nullable: true),
                    session_id = table.Column<Guid>(type: "uuid", nullable: false),
                    reason = table.Column<string>(type: "text", nullable: true),
                    request_type = table.Column<int>(type: "integer", nullable: false),
                    requested_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    requested_start_at_utc = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    requests_exception = table.Column<bool>(type: "boolean", nullable: false),
                    review_note = table.Column<string>(type: "text", nullable: true),
                    reviewed_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    status = table.Column<int>(type: "integer", nullable: false),
                    timing_classification = table.Column<int>(type: "integer", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_pt_session_change_requests", x => x.request_id);
                    table.ForeignKey(
                        name: "fk_pt_session_change_requests_pt_sessions_session_id",
                        column: x => x.session_id,
                        principalTable: "pt_sessions",
                        principalColumn: "session_id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_pt_session_change_requests_user_accounts_requested_by_user_",
                        column: x => x.requested_by_user_id,
                        principalTable: "user_accounts",
                        principalColumn: "user_id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_pt_session_change_requests_user_accounts_reviewed_by_user_id",
                        column: x => x.reviewed_by_user_id,
                        principalTable: "user_accounts",
                        principalColumn: "user_id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "workout_results",
                columns: table => new
                {
                    result_id = table.Column<Guid>(type: "uuid", nullable: false),
                    coach_id = table.Column<Guid>(type: "uuid", nullable: false),
                    pt_session_id = table.Column<Guid>(type: "uuid", nullable: false),
                    coach_comment = table.Column<string>(type: "text", nullable: true),
                    progress_note = table.Column<string>(type: "text", nullable: true),
                    recorded_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_workout_results", x => x.result_id);
                    table.ForeignKey(
                        name: "fk_workout_results_pt_sessions_pt_session_id",
                        column: x => x.pt_session_id,
                        principalTable: "pt_sessions",
                        principalColumn: "session_id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_workout_results_user_accounts_coach_id",
                        column: x => x.coach_id,
                        principalTable: "user_accounts",
                        principalColumn: "user_id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.InsertData(
                table: "room_types",
                columns: new[] { "room_type_id", "name" },
                values: new object[] { 2, "PT room" });

            migrationBuilder.InsertData(
                table: "sport_service_offerings",
                columns: new[] { "offering_id", "default_max_capacity", "default_session_minutes", "is_enabled", "service_type", "sport_id" },
                values: new object[] { 2, null, null, false, 3, 1 });

            migrationBuilder.InsertData(
                table: "system_settings",
                columns: new[] { "key", "description", "updated_at", "updated_by_user_id", "value" },
                values: new object[] { "pt.price_per_session_vnd", "Demo PT price per session; the center manager must confirm the business price.", new DateTime(2026, 9, 30, 0, 0, 0, 0, DateTimeKind.Utc), null, "200000" });

            migrationBuilder.InsertData(
                table: "service_room_types",
                columns: new[] { "offering_id", "room_type_id" },
                values: new object[,]
                {
                    { 2, 1 },
                    { 2, 2 }
                });

            migrationBuilder.InsertData(
                table: "sport_room_types",
                columns: new[] { "room_type_id", "sport_id" },
                values: new object[] { 2, 1 });

            migrationBuilder.CreateIndex(
                name: "ix_invoice_items_pt_entitlement_id",
                table: "invoice_items",
                column: "pt_entitlement_id");

            migrationBuilder.CreateIndex(
                name: "ix_coach_service_qualifications_offering_id",
                table: "coach_service_qualifications",
                column: "offering_id");

            migrationBuilder.CreateIndex(
                name: "ix_pt_coach_change_requests_current_coach_id",
                table: "pt_coach_change_requests",
                column: "current_coach_id");

            migrationBuilder.CreateIndex(
                name: "ix_pt_coach_change_requests_entitlement_id",
                table: "pt_coach_change_requests",
                column: "entitlement_id",
                unique: true,
                filter: "status = 0");

            migrationBuilder.CreateIndex(
                name: "ix_pt_coach_change_requests_member_id",
                table: "pt_coach_change_requests",
                column: "member_id");

            migrationBuilder.CreateIndex(
                name: "ix_pt_coach_change_requests_requested_coach_id",
                table: "pt_coach_change_requests",
                column: "requested_coach_id");

            migrationBuilder.CreateIndex(
                name: "ix_pt_coach_change_requests_reviewed_by_user_id",
                table: "pt_coach_change_requests",
                column: "reviewed_by_user_id");

            migrationBuilder.CreateIndex(
                name: "ix_pt_entitlements_activation_reference",
                table: "pt_entitlements",
                column: "activation_reference",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_pt_entitlements_coach_id",
                table: "pt_entitlements",
                column: "coach_id");

            migrationBuilder.CreateIndex(
                name: "ix_pt_entitlements_current_member_package_id",
                table: "pt_entitlements",
                column: "current_member_package_id");

            migrationBuilder.CreateIndex(
                name: "ix_pt_entitlements_member_id_status",
                table: "pt_entitlements",
                columns: new[] { "member_id", "status" });

            migrationBuilder.CreateIndex(
                name: "ix_pt_entitlements_origin_member_package_id",
                table: "pt_entitlements",
                column: "origin_member_package_id");

            migrationBuilder.CreateIndex(
                name: "ix_pt_session_change_requests_requested_by_user_id",
                table: "pt_session_change_requests",
                column: "requested_by_user_id");

            migrationBuilder.CreateIndex(
                name: "ix_pt_session_change_requests_reviewed_by_user_id",
                table: "pt_session_change_requests",
                column: "reviewed_by_user_id");

            migrationBuilder.CreateIndex(
                name: "ix_pt_session_change_requests_session_id",
                table: "pt_session_change_requests",
                column: "session_id",
                unique: true,
                filter: "status = 0");

            migrationBuilder.CreateIndex(
                name: "ix_pt_sessions_coach_id_start_at_utc",
                table: "pt_sessions",
                columns: new[] { "coach_id", "start_at_utc" });

            migrationBuilder.CreateIndex(
                name: "ix_pt_sessions_entitlement_id",
                table: "pt_sessions",
                column: "entitlement_id");

            migrationBuilder.CreateIndex(
                name: "ix_pt_sessions_member_id_start_at_utc",
                table: "pt_sessions",
                columns: new[] { "member_id", "start_at_utc" });

            migrationBuilder.CreateIndex(
                name: "ix_pt_sessions_rescheduled_from_session_id",
                table: "pt_sessions",
                column: "rescheduled_from_session_id");

            migrationBuilder.CreateIndex(
                name: "ix_pt_sessions_room_id",
                table: "pt_sessions",
                column: "room_id");

            migrationBuilder.CreateIndex(
                name: "ix_service_room_types_room_type_id",
                table: "service_room_types",
                column: "room_type_id");

            migrationBuilder.CreateIndex(
                name: "ix_workout_results_coach_id",
                table: "workout_results",
                column: "coach_id");

            migrationBuilder.CreateIndex(
                name: "ix_workout_results_pt_session_id",
                table: "workout_results",
                column: "pt_session_id",
                unique: true);

            migrationBuilder.AddForeignKey(
                name: "fk_invoice_items_pt_entitlements_pt_entitlement_id",
                table: "invoice_items",
                column: "pt_entitlement_id",
                principalTable: "pt_entitlements",
                principalColumn: "entitlement_id",
                onDelete: ReferentialAction.Restrict);
        }
    }
}
