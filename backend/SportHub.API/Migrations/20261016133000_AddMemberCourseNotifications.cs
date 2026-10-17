using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace SportHub.API.Migrations
{
    /// <inheritdoc />
    public partial class AddMemberCourseNotifications : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropCheckConstraint(
                name: "ck_class_threshold_response_choice_target",
                table: "class_threshold_responses");

            migrationBuilder.CreateTable(
                name: "course_interests",
                columns: table => new
                {
                    course_interest_id = table.Column<Guid>(type: "uuid", nullable: false),
                    member_id = table.Column<Guid>(type: "uuid", nullable: false),
                    sport_id = table.Column<int>(type: "integer", nullable: false),
                    source_class_id = table.Column<int>(type: "integer", nullable: false),
                    threshold_response_id = table.Column<Guid>(type: "uuid", nullable: false),
                    refunded_points = table.Column<int>(type: "integer", nullable: false),
                    created_at_utc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    cancelled_at_utc = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_course_interests", x => x.course_interest_id);
                    table.ForeignKey(
                        name: "fk_course_interests_classes_source_class_id",
                        column: x => x.source_class_id,
                        principalTable: "classes",
                        principalColumn: "class_id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_course_interests_sports_sport_id",
                        column: x => x.sport_id,
                        principalTable: "sports",
                        principalColumn: "sport_id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_course_interests_threshold_responses_threshold_response_id",
                        column: x => x.threshold_response_id,
                        principalTable: "class_threshold_responses",
                        principalColumn: "threshold_response_id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_course_interests_user_accounts_member_id",
                        column: x => x.member_id,
                        principalTable: "user_accounts",
                        principalColumn: "user_id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.AddCheckConstraint(
                name: "ck_class_threshold_response_choice_target",
                table: "class_threshold_responses",
                sql: "(choice IS NULL AND target_class_id IS NULL) OR (choice IN (0, 2, 3) AND target_class_id IS NULL) OR (choice = 1 AND target_class_id IS NOT NULL)");

            migrationBuilder.CreateIndex(
                name: "ix_course_interests_member_id",
                table: "course_interests",
                column: "member_id");

            migrationBuilder.CreateIndex(
                name: "ix_course_interests_source_class_id",
                table: "course_interests",
                column: "source_class_id");

            migrationBuilder.CreateIndex(
                name: "ix_course_interests_sport_id_cancelled_at_utc",
                table: "course_interests",
                columns: new[] { "sport_id", "cancelled_at_utc" });

            migrationBuilder.CreateIndex(
                name: "ix_course_interests_threshold_response_id",
                table: "course_interests",
                column: "threshold_response_id",
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("UPDATE class_threshold_responses SET choice = 0 WHERE choice = 3;");
            migrationBuilder.DropTable(
                name: "course_interests");

            migrationBuilder.DropCheckConstraint(
                name: "ck_class_threshold_response_choice_target",
                table: "class_threshold_responses");

            migrationBuilder.AddCheckConstraint(
                name: "ck_class_threshold_response_choice_target",
                table: "class_threshold_responses",
                sql: "(choice IS NULL AND target_class_id IS NULL) OR (choice IN (0, 2) AND target_class_id IS NULL) OR (choice = 1 AND target_class_id IS NOT NULL)");
        }
    }
}
