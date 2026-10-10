using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace SportHub.API.Migrations
{
    /// <inheritdoc />
    public partial class CourseInterestSubscriptions : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropCheckConstraint(
                name: "ck_class_threshold_response_choice_target",
                table: "class_threshold_responses");

            migrationBuilder.CreateTable(
                name: "course_interest_subscriptions",
                columns: table => new
                {
                    subscription_id = table.Column<Guid>(type: "uuid", nullable: false),
                    threshold_response_id = table.Column<Guid>(type: "uuid", nullable: false),
                    member_id = table.Column<Guid>(type: "uuid", nullable: false),
                    source_class_id = table.Column<int>(type: "integer", nullable: false),
                    sport_id = table.Column<int>(type: "integer", nullable: false),
                    refunded_points = table.Column<int>(type: "integer", nullable: false),
                    is_active = table.Column<bool>(type: "boolean", nullable: false),
                    created_at_utc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    unsubscribed_at_utc = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_course_interest_subscriptions", x => x.subscription_id);
                    table.CheckConstraint("ck_course_interest_refunded_points", "refunded_points >= 0");
                    table.ForeignKey(
                        name: "fk_course_interest_subscriptions_classes_source_class_id",
                        column: x => x.source_class_id,
                        principalTable: "classes",
                        principalColumn: "class_id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_course_interest_subscriptions_sports_sport_id",
                        column: x => x.sport_id,
                        principalTable: "sports",
                        principalColumn: "sport_id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_course_interest_subscriptions_threshold_responses_threshold",
                        column: x => x.threshold_response_id,
                        principalTable: "class_threshold_responses",
                        principalColumn: "threshold_response_id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.AddCheckConstraint(
                name: "ck_class_threshold_response_choice_target",
                table: "class_threshold_responses",
                sql: "(choice IS NULL AND target_class_id IS NULL) OR (choice IN (0, 2) AND target_class_id IS NULL) OR (choice = 1 AND target_class_id IS NOT NULL)");

            migrationBuilder.CreateIndex(
                name: "ix_course_interest_subscriptions_member_id_created_at_utc",
                table: "course_interest_subscriptions",
                columns: new[] { "member_id", "created_at_utc" });

            migrationBuilder.CreateIndex(
                name: "ix_course_interest_subscriptions_source_class_id",
                table: "course_interest_subscriptions",
                column: "source_class_id");

            migrationBuilder.CreateIndex(
                name: "ix_course_interest_subscriptions_sport_id_is_active",
                table: "course_interest_subscriptions",
                columns: new[] { "sport_id", "is_active" });

            migrationBuilder.CreateIndex(
                name: "ix_course_interest_subscriptions_threshold_response_id",
                table: "course_interest_subscriptions",
                column: "threshold_response_id",
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "course_interest_subscriptions");

            migrationBuilder.DropCheckConstraint(
                name: "ck_class_threshold_response_choice_target",
                table: "class_threshold_responses");

            migrationBuilder.AddCheckConstraint(
                name: "ck_class_threshold_response_choice_target",
                table: "class_threshold_responses",
                sql: "(choice IS NULL AND target_class_id IS NULL) OR (choice = 0 AND target_class_id IS NULL) OR (choice = 1 AND target_class_id IS NOT NULL)");
        }
    }
}
