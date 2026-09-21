using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

#pragma warning disable CA1814 // Prefer jagged arrays over multidimensional

namespace SportHub.API.Migrations
{
    /// <inheritdoc />
    public partial class AddBusinessRuleSupportTables : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "ix_member_packages_member_id",
                table: "member_packages");

            migrationBuilder.DropIndex(
                name: "ix_invoices_member_id",
                table: "invoices");

            migrationBuilder.DropIndex(
                name: "ix_class_sessions_coach_id",
                table: "class_sessions");

            migrationBuilder.DropIndex(
                name: "ix_class_sessions_room_id",
                table: "class_sessions");

            migrationBuilder.CreateSequence(
                name: "invoice_number_seq");

            migrationBuilder.AddColumn<string>(
                name: "description",
                table: "membership_packages",
                type: "text",
                nullable: true);

            // defaultValue true (EF sinh ra false): gói đang có trong danh mục là gói ĐANG bán.
            // Để false thì nâng cấp DB hiện có sẽ âm thầm ngừng bán toàn bộ gói (BR-8).
            migrationBuilder.AddColumn<bool>(
                name: "is_active",
                table: "membership_packages",
                type: "boolean",
                nullable: false,
                defaultValue: true);

            migrationBuilder.AddColumn<string>(
                name: "stacking_approval_reason",
                table: "member_packages",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "stacking_approved_by_user_id",
                table: "member_packages",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "due_date_utc",
                table: "invoices",
                type: "timestamp with time zone",
                nullable: false,
                defaultValue: new DateTime(1, 1, 1, 0, 0, 0, 0, DateTimeKind.Unspecified));

            migrationBuilder.AddColumn<DateTime>(
                name: "first_deposit_at_utc",
                table: "invoices",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "cancellation_deadline_hours",
                table: "enrollments",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<int>(
                name: "baseline_capacity",
                table: "class_sessions",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AlterColumn<string>(
                name: "target_id",
                table: "audit_logs",
                type: "text",
                nullable: false,
                oldClrType: typeof(Guid),
                oldType: "uuid");

            migrationBuilder.CreateTable(
                name: "report_exports",
                columns: table => new
                {
                    report_export_id = table.Column<Guid>(type: "uuid", nullable: false),
                    report_type = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    requested_by_user_id = table.Column<Guid>(type: "uuid", nullable: false),
                    parameters_json = table.Column<string>(type: "jsonb", nullable: false),
                    status = table.Column<int>(type: "integer", nullable: false),
                    row_count = table.Column<int>(type: "integer", nullable: false),
                    size_bytes = table.Column<long>(type: "bigint", nullable: false),
                    failure_reason = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: true),
                    created_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    completed_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    expires_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    is_deleted = table.Column<bool>(type: "boolean", nullable: false),
                    deleted_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_report_exports", x => x.report_export_id);
                    table.ForeignKey(
                        name: "fk_report_exports_user_accounts_requested_by_user_id",
                        column: x => x.requested_by_user_id,
                        principalTable: "user_accounts",
                        principalColumn: "user_id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "system_settings",
                columns: table => new
                {
                    key = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    value = table.Column<string>(type: "character varying(256)", maxLength: 256, nullable: false),
                    description = table.Column<string>(type: "character varying(512)", maxLength: 512, nullable: false),
                    updated_by_user_id = table.Column<Guid>(type: "uuid", nullable: true),
                    updated_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_system_settings", x => x.key);
                    table.ForeignKey(
                        name: "fk_system_settings_user_accounts_updated_by_user_id",
                        column: x => x.updated_by_user_id,
                        principalTable: "user_accounts",
                        principalColumn: "user_id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.InsertData(
                table: "system_settings",
                columns: new[] { "key", "description", "updated_at", "updated_by_user_id", "value" },
                values: new object[,]
                {
                    { "cancellation_deadline_hours", "BR-50 — Số giờ tối thiểu trước giờ bắt đầu buổi học mà hội viên phải hủy để được hoàn lượt tập. Giá trị được chụp lại tại thời điểm đăng ký; thay đổi ở đây không ảnh hưởng các đăng ký đã xác nhận.", new DateTime(2026, 9, 21, 0, 0, 0, 0, DateTimeKind.Utc), null, "12" },
                    { "package_expiring_reminder_days", "BR-33 — Nhắc hội viên trước bao nhiêu ngày khi gói thành viên sắp hết hạn.", new DateTime(2026, 9, 21, 0, 0, 0, 0, DateTimeKind.Utc), null, "7" }
                });

            // ---- Backfill cho database đã có dữ liệu ----------------------------------------
            // EF chỉ đặt được hằng làm default cho cột mới; các giá trị đó (0, 0001-01-01) sai
            // nghiệp vụ với dòng đã tồn tại và một trong số đó còn làm CHECK constraint bên dưới
            // không tạo được. Phải chạy TRƯỚC AddCheckConstraint.

            // BR-51 — trần sức chứa của buổi đã tạo chính là sức chứa nó đang có. Không tính lại
            // MIN(phòng, lớp) ở đây: catalog có thể đã thay đổi kể từ khi buổi được tạo, và tính
            // lại sẽ nới trần của buổi cũ — đúng điều BR-51 cấm.
            migrationBuilder.Sql("UPDATE class_sessions SET baseline_capacity = capacity;");

            // BR-55 — hạn thanh toán ban đầu là 2 tháng kể từ ngày phát hành.
            migrationBuilder.Sql(
                "UPDATE invoices SET due_date_utc = issued_at + INTERVAL '2 months' "
                + "WHERE due_date_utc = '0001-01-01 00:00:00+00';");

            // BR-50 — đăng ký cũ chưa có snapshot; gán bằng giá trị cấu hình mặc định đang seed
            // (12 giờ). Đây là xấp xỉ cho dữ liệu lịch sử, không phải chính sách thật lúc chúng
            // được tạo — chính sách thật không tồn tại ở đâu để khôi phục.
            migrationBuilder.Sql(
                "UPDATE enrollments SET cancellation_deadline_hours = 12 WHERE cancellation_deadline_hours = 0;");
            // ---------------------------------------------------------------------------------

            migrationBuilder.CreateIndex(
                name: "ix_member_packages_member_id_status",
                table: "member_packages",
                columns: new[] { "member_id", "status" });

            migrationBuilder.CreateIndex(
                name: "ix_member_packages_stacking_approved_by_user_id",
                table: "member_packages",
                column: "stacking_approved_by_user_id");

            migrationBuilder.AddCheckConstraint(
                name: "CK_member_packages_stacking_approval_complete",
                table: "member_packages",
                sql: "(stacking_approved_by_user_id IS NULL AND stacking_approval_reason IS NULL) OR (stacking_approved_by_user_id IS NOT NULL AND stacking_approval_reason IS NOT NULL)");

            migrationBuilder.CreateIndex(
                name: "ix_invoices_due_date_utc",
                table: "invoices",
                column: "due_date_utc");

            migrationBuilder.CreateIndex(
                name: "ix_invoices_member_id_status",
                table: "invoices",
                columns: new[] { "member_id", "status" });

            migrationBuilder.CreateIndex(
                name: "ix_class_sessions_coach_id_start_at_utc",
                table: "class_sessions",
                columns: new[] { "coach_id", "start_at_utc" });

            migrationBuilder.CreateIndex(
                name: "ix_class_sessions_room_id_start_at_utc",
                table: "class_sessions",
                columns: new[] { "room_id", "start_at_utc" });

            migrationBuilder.CreateIndex(
                name: "ix_class_sessions_start_at_utc",
                table: "class_sessions",
                column: "start_at_utc");

            migrationBuilder.AddCheckConstraint(
                name: "CK_class_sessions_capacity_within_baseline",
                table: "class_sessions",
                sql: "capacity > 0 AND capacity <= baseline_capacity");

            migrationBuilder.CreateIndex(
                name: "ix_report_exports_requested_by_user_id_created_at",
                table: "report_exports",
                columns: new[] { "requested_by_user_id", "created_at" });

            migrationBuilder.CreateIndex(
                name: "ix_system_settings_updated_by_user_id",
                table: "system_settings",
                column: "updated_by_user_id");

            migrationBuilder.AddForeignKey(
                name: "fk_member_packages_user_accounts_stacking_approved_by_user_id",
                table: "member_packages",
                column: "stacking_approved_by_user_id",
                principalTable: "user_accounts",
                principalColumn: "user_id",
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "fk_member_packages_user_accounts_stacking_approved_by_user_id",
                table: "member_packages");

            migrationBuilder.DropTable(
                name: "report_exports");

            migrationBuilder.DropTable(
                name: "system_settings");

            migrationBuilder.DropIndex(
                name: "ix_member_packages_member_id_status",
                table: "member_packages");

            migrationBuilder.DropIndex(
                name: "ix_member_packages_stacking_approved_by_user_id",
                table: "member_packages");

            migrationBuilder.DropCheckConstraint(
                name: "CK_member_packages_stacking_approval_complete",
                table: "member_packages");

            migrationBuilder.DropIndex(
                name: "ix_invoices_due_date_utc",
                table: "invoices");

            migrationBuilder.DropIndex(
                name: "ix_invoices_member_id_status",
                table: "invoices");

            migrationBuilder.DropIndex(
                name: "ix_class_sessions_coach_id_start_at_utc",
                table: "class_sessions");

            migrationBuilder.DropIndex(
                name: "ix_class_sessions_room_id_start_at_utc",
                table: "class_sessions");

            migrationBuilder.DropIndex(
                name: "ix_class_sessions_start_at_utc",
                table: "class_sessions");

            migrationBuilder.DropCheckConstraint(
                name: "CK_class_sessions_capacity_within_baseline",
                table: "class_sessions");

            migrationBuilder.DropColumn(
                name: "description",
                table: "membership_packages");

            migrationBuilder.DropColumn(
                name: "is_active",
                table: "membership_packages");

            migrationBuilder.DropColumn(
                name: "stacking_approval_reason",
                table: "member_packages");

            migrationBuilder.DropColumn(
                name: "stacking_approved_by_user_id",
                table: "member_packages");

            migrationBuilder.DropColumn(
                name: "due_date_utc",
                table: "invoices");

            migrationBuilder.DropColumn(
                name: "first_deposit_at_utc",
                table: "invoices");

            migrationBuilder.DropColumn(
                name: "cancellation_deadline_hours",
                table: "enrollments");

            migrationBuilder.DropColumn(
                name: "baseline_capacity",
                table: "class_sessions");

            migrationBuilder.DropSequence(
                name: "invoice_number_seq");

            migrationBuilder.AlterColumn<Guid>(
                name: "target_id",
                table: "audit_logs",
                type: "uuid",
                nullable: false,
                oldClrType: typeof(string),
                oldType: "text");

            migrationBuilder.CreateIndex(
                name: "ix_member_packages_member_id",
                table: "member_packages",
                column: "member_id");

            migrationBuilder.CreateIndex(
                name: "ix_invoices_member_id",
                table: "invoices",
                column: "member_id");

            migrationBuilder.CreateIndex(
                name: "ix_class_sessions_coach_id",
                table: "class_sessions",
                column: "coach_id");

            migrationBuilder.CreateIndex(
                name: "ix_class_sessions_room_id",
                table: "class_sessions",
                column: "room_id");
        }
    }
}
