using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace SportHub.API.Migrations
{
    /// <inheritdoc />
    public partial class RemoveHomeworkAssignments : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Giá trị enum 4, 5 (HomeworkAssigned, HomeworkStatusChanged) đã ngừng dùng cùng tính năng giao bài tập.
            migrationBuilder.Sql("DELETE FROM notifications WHERE source_event_type IN (4, 5);");

            migrationBuilder.DropTable(
                name: "homework_assignment_items");

            migrationBuilder.DropTable(
                name: "homework_assignments");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "homework_assignments",
                columns: table => new
                {
                    assignment_id = table.Column<Guid>(type: "uuid", nullable: false),
                    coach_id = table.Column<Guid>(type: "uuid", nullable: false),
                    member_id = table.Column<Guid>(type: "uuid", nullable: false),
                    relationship_id = table.Column<Guid>(type: "uuid", nullable: false),
                    source_workout_plan_id = table.Column<Guid>(type: "uuid", nullable: true),
                    assigned_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    coach_note = table.Column<string>(type: "text", nullable: true),
                    completed_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    due_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    member_feedback = table.Column<string>(type: "text", nullable: true),
                    reviewed_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    status = table.Column<int>(type: "integer", nullable: false),
                    title = table.Column<string>(type: "text", nullable: false),
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
                name: "homework_assignment_items",
                columns: table => new
                {
                    item_id = table.Column<Guid>(type: "uuid", nullable: false),
                    assignment_id = table.Column<Guid>(type: "uuid", nullable: false),
                    exercise = table.Column<string>(type: "text", nullable: false),
                    notes = table.Column<string>(type: "text", nullable: true),
                    reps = table.Column<int>(type: "integer", nullable: false),
                    sets = table.Column<int>(type: "integer", nullable: false)
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
        }
    }
}
