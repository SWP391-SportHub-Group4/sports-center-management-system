using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace SportHub.API.Migrations
{
    /// <inheritdoc />
    public partial class AddPtTrainingDomain : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // BE-4 — dọn dữ liệu mô hình PT cũ trước khi đổi schema. Đây là dữ liệu demo/seed
            // (Class "PT 1 kèm 1", WorkoutResult ép từ Enrollment Yoga) theo đúng quyết định
            // gate ở docs/backend-be4-pt-training-implementation-plan.md §3.4: "nếu chỉ có demo
            // data thì sửa seeder và reset". Không tự động map dữ liệu PT cũ thành PtSession —
            // nếu môi trường nào có dữ liệu PT/WorkoutResult THẬT (không phải demo seed), DỪNG
            // migration này và xuất danh sách để xử lý thủ công trước khi áp dụng.
            //
            // 1) WorkoutResult đổi hẳn từ Enrollment sang PtSession — record cũ (nếu có) không
            //    còn ý nghĩa dưới model mới, xóa trước khi đổi cột (workout_results.enrollment_id
            //    → pt_session_id) để FK mới không vỡ trên dữ liệu cũ không khớp.
            migrationBuilder.Sql("DELETE FROM workout_results;");

            // 2) Class discipline='PersonalTraining' không còn hợp lệ (CK_classes_discipline_allowed
            //    sắp bị siết lại chỉ còn Yoga/GroupX) — xóa theo đúng thứ tự FK Restrict: attendance
            //    → enrollment → class_session → class_recurrence → class.
            migrationBuilder.Sql(
                """
                DELETE FROM attendances WHERE enrollment_id IN (
                    SELECT enrollment_id FROM enrollments WHERE session_id IN (
                        SELECT session_id FROM class_sessions WHERE class_id IN (
                            SELECT class_id FROM classes WHERE discipline = 'PersonalTraining'
                        )
                    )
                );
                """);

            migrationBuilder.Sql(
                """
                DELETE FROM enrollments WHERE session_id IN (
                    SELECT session_id FROM class_sessions WHERE class_id IN (
                        SELECT class_id FROM classes WHERE discipline = 'PersonalTraining'
                    )
                );
                """);

            migrationBuilder.Sql(
                """
                DELETE FROM class_sessions WHERE class_id IN (
                    SELECT class_id FROM classes WHERE discipline = 'PersonalTraining'
                );
                """);

            migrationBuilder.Sql(
                """
                DELETE FROM class_recurrences WHERE class_id IN (
                    SELECT class_id FROM classes WHERE discipline = 'PersonalTraining'
                );
                """);

            migrationBuilder.Sql("DELETE FROM classes WHERE discipline = 'PersonalTraining';");

            migrationBuilder.DropForeignKey(
                name: "fk_workout_results_enrollments_enrollment_id",
                table: "workout_results");

            migrationBuilder.DropIndex(
                name: "ix_workout_results_enrollment_id",
                table: "workout_results");

            migrationBuilder.DropCheckConstraint(
                name: "CK_classes_discipline_allowed",
                table: "classes");

            migrationBuilder.RenameColumn(
                name: "enrollment_id",
                table: "workout_results",
                newName: "pt_session_id");

            migrationBuilder.AddColumn<int>(
                name: "status",
                table: "workout_plans",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<DateTime>(
                name: "updated_at",
                table: "workout_plans",
                type: "timestamp with time zone",
                nullable: false,
                defaultValue: new DateTime(1, 1, 1, 0, 0, 0, 0, DateTimeKind.Unspecified));

            migrationBuilder.AddColumn<int>(
                name: "version",
                table: "workout_plans",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.CreateTable(
                name: "homework_assignments",
                columns: table => new
                {
                    assignment_id = table.Column<Guid>(type: "uuid", nullable: false),
                    member_id = table.Column<Guid>(type: "uuid", nullable: false),
                    coach_id = table.Column<Guid>(type: "uuid", nullable: false),
                    relationship_id = table.Column<Guid>(type: "uuid", nullable: false),
                    source_workout_plan_id = table.Column<Guid>(type: "uuid", nullable: true),
                    title = table.Column<string>(type: "text", nullable: false),
                    coach_note = table.Column<string>(type: "text", nullable: true),
                    assigned_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    due_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    completed_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    reviewed_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    status = table.Column<int>(type: "integer", nullable: false),
                    member_feedback = table.Column<string>(type: "text", nullable: true),
                    version = table.Column<int>(type: "integer", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_homework_assignments", x => x.assignment_id);
                    table.CheckConstraint("CK_homework_assignments_due_after_assigned", "due_at > assigned_at");
                    table.ForeignKey(
                        name: "fk_homework_assignments_coach_member_relationships_relationshi",
                        column: x => x.relationship_id,
                        principalTable: "coach_member_relationships",
                        principalColumn: "relationship_id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_homework_assignments_user_accounts_coach_id",
                        column: x => x.coach_id,
                        principalTable: "user_accounts",
                        principalColumn: "user_id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_homework_assignments_user_accounts_member_id",
                        column: x => x.member_id,
                        principalTable: "user_accounts",
                        principalColumn: "user_id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_homework_assignments_workout_plans_source_workout_plan_id",
                        column: x => x.source_workout_plan_id,
                        principalTable: "workout_plans",
                        principalColumn: "plan_id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "pt_entitlements",
                columns: table => new
                {
                    entitlement_id = table.Column<Guid>(type: "uuid", nullable: false),
                    activation_reference = table.Column<Guid>(type: "uuid", nullable: true),
                    member_id = table.Column<Guid>(type: "uuid", nullable: false),
                    origin_member_package_id = table.Column<Guid>(type: "uuid", nullable: false),
                    current_member_package_id = table.Column<Guid>(type: "uuid", nullable: false),
                    coach_id = table.Column<Guid>(type: "uuid", nullable: false),
                    frequency_per_week = table.Column<int>(type: "integer", nullable: false),
                    total_quota = table.Column<int>(type: "integer", nullable: false),
                    reserved_sessions = table.Column<int>(type: "integer", nullable: false),
                    consumed_sessions = table.Column<int>(type: "integer", nullable: false),
                    validity_start_date = table.Column<DateOnly>(type: "date", nullable: false),
                    validity_end_date = table.Column<DateOnly>(type: "date", nullable: false),
                    carry_over_until_date = table.Column<DateOnly>(type: "date", nullable: false),
                    status = table.Column<int>(type: "integer", nullable: false),
                    activated_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    cancelled_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
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
                name: "homework_assignment_items",
                columns: table => new
                {
                    item_id = table.Column<Guid>(type: "uuid", nullable: false),
                    assignment_id = table.Column<Guid>(type: "uuid", nullable: false),
                    exercise = table.Column<string>(type: "text", nullable: false),
                    sets = table.Column<int>(type: "integer", nullable: false),
                    reps = table.Column<int>(type: "integer", nullable: false),
                    notes = table.Column<string>(type: "text", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_homework_assignment_items", x => x.item_id);
                    table.ForeignKey(
                        name: "fk_homework_assignment_items_homework_assignments_assignment_id",
                        column: x => x.assignment_id,
                        principalTable: "homework_assignments",
                        principalColumn: "assignment_id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "pt_coach_change_requests",
                columns: table => new
                {
                    request_id = table.Column<Guid>(type: "uuid", nullable: false),
                    entitlement_id = table.Column<Guid>(type: "uuid", nullable: false),
                    member_id = table.Column<Guid>(type: "uuid", nullable: false),
                    current_coach_id = table.Column<Guid>(type: "uuid", nullable: false),
                    requested_coach_id = table.Column<Guid>(type: "uuid", nullable: false),
                    reason = table.Column<string>(type: "text", nullable: true),
                    requested_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    status = table.Column<int>(type: "integer", nullable: false),
                    reviewed_by_user_id = table.Column<Guid>(type: "uuid", nullable: true),
                    reviewed_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    review_note = table.Column<string>(type: "text", nullable: true)
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
                    entitlement_id = table.Column<Guid>(type: "uuid", nullable: false),
                    member_id = table.Column<Guid>(type: "uuid", nullable: false),
                    coach_id = table.Column<Guid>(type: "uuid", nullable: false),
                    start_at_utc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    end_at_utc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    status = table.Column<int>(type: "integer", nullable: false),
                    quota_state = table.Column<int>(type: "integer", nullable: false),
                    rescheduled_from_session_id = table.Column<Guid>(type: "uuid", nullable: true),
                    created_by_user_id = table.Column<Guid>(type: "uuid", nullable: false),
                    completed_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    cancelled_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    cancellation_reason = table.Column<string>(type: "text", nullable: true),
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
                    session_id = table.Column<Guid>(type: "uuid", nullable: false),
                    requested_by_user_id = table.Column<Guid>(type: "uuid", nullable: false),
                    request_type = table.Column<int>(type: "integer", nullable: false),
                    requested_start_at_utc = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    requested_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    reason = table.Column<string>(type: "text", nullable: true),
                    timing_classification = table.Column<int>(type: "integer", nullable: false),
                    requests_exception = table.Column<bool>(type: "boolean", nullable: false),
                    status = table.Column<int>(type: "integer", nullable: false),
                    reviewed_by_user_id = table.Column<Guid>(type: "uuid", nullable: true),
                    reviewed_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    review_note = table.Column<string>(type: "text", nullable: true)
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

            migrationBuilder.CreateIndex(
                name: "ix_workout_results_pt_session_id",
                table: "workout_results",
                column: "pt_session_id",
                unique: true);

            migrationBuilder.AddCheckConstraint(
                name: "CK_classes_discipline_allowed",
                table: "classes",
                sql: "discipline IN ('Yoga', 'GroupX')");

            migrationBuilder.CreateIndex(
                name: "ix_homework_assignment_items_assignment_id",
                table: "homework_assignment_items",
                column: "assignment_id");

            migrationBuilder.CreateIndex(
                name: "ix_homework_assignments_coach_id_status_due_at",
                table: "homework_assignments",
                columns: new[] { "coach_id", "status", "due_at" });

            migrationBuilder.CreateIndex(
                name: "ix_homework_assignments_member_id_status_due_at",
                table: "homework_assignments",
                columns: new[] { "member_id", "status", "due_at" });

            migrationBuilder.CreateIndex(
                name: "ix_homework_assignments_relationship_id",
                table: "homework_assignments",
                column: "relationship_id");

            migrationBuilder.CreateIndex(
                name: "ix_homework_assignments_source_workout_plan_id",
                table: "homework_assignments",
                column: "source_workout_plan_id");

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

            migrationBuilder.AddForeignKey(
                name: "fk_workout_results_pt_sessions_pt_session_id",
                table: "workout_results",
                column: "pt_session_id",
                principalTable: "pt_sessions",
                principalColumn: "session_id",
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "fk_workout_results_pt_sessions_pt_session_id",
                table: "workout_results");

            migrationBuilder.DropTable(
                name: "homework_assignment_items");

            migrationBuilder.DropTable(
                name: "pt_coach_change_requests");

            migrationBuilder.DropTable(
                name: "pt_session_change_requests");

            migrationBuilder.DropTable(
                name: "homework_assignments");

            migrationBuilder.DropTable(
                name: "pt_sessions");

            migrationBuilder.DropTable(
                name: "pt_entitlements");

            migrationBuilder.DropIndex(
                name: "ix_workout_results_pt_session_id",
                table: "workout_results");

            migrationBuilder.DropCheckConstraint(
                name: "CK_classes_discipline_allowed",
                table: "classes");

            migrationBuilder.DropColumn(
                name: "status",
                table: "workout_plans");

            migrationBuilder.DropColumn(
                name: "updated_at",
                table: "workout_plans");

            migrationBuilder.DropColumn(
                name: "version",
                table: "workout_plans");

            migrationBuilder.RenameColumn(
                name: "pt_session_id",
                table: "workout_results",
                newName: "enrollment_id");

            migrationBuilder.CreateIndex(
                name: "ix_workout_results_enrollment_id",
                table: "workout_results",
                column: "enrollment_id");

            migrationBuilder.AddCheckConstraint(
                name: "CK_classes_discipline_allowed",
                table: "classes",
                sql: "discipline IN ('PersonalTraining', 'Yoga', 'GroupX')");

            migrationBuilder.AddForeignKey(
                name: "fk_workout_results_enrollments_enrollment_id",
                table: "workout_results",
                column: "enrollment_id",
                principalTable: "enrollments",
                principalColumn: "enrollment_id",
                onDelete: ReferentialAction.Restrict);
        }
    }
}
