using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace SportHub.API.Migrations
{
    /// <inheritdoc />
    public partial class MemberClassCommunication : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // The other branch already deployed this table under course_interest_id.
            // Adopt it in place so both upgrade orders preserve subscriptions.
            migrationBuilder.Sql("""
                DO $$ BEGIN
                    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'course_interests' AND column_name = 'course_interest_id')
                       AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'course_interests' AND column_name = 'interest_id') THEN
                        ALTER TABLE course_interests RENAME COLUMN course_interest_id TO interest_id;
                    END IF;
                    IF to_regclass('course_interests') IS NOT NULL THEN
                        ALTER TABLE course_interests ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT true;
                        UPDATE course_interests SET active = false WHERE cancelled_at_utc IS NOT NULL;
                    END IF;
                END $$;
                """);
            migrationBuilder.DropCheckConstraint(
                name: "ck_class_threshold_response_choice_target",
                table: "class_threshold_responses");

            migrationBuilder.AddColumn<int>(
                name: "continuation_of_class_id",
                table: "classes",
                type: "integer",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "class_session_reminders",
                columns: table => new
                {
                    reminder_id = table.Column<Guid>(type: "uuid", nullable: false),
                    session_id = table.Column<Guid>(type: "uuid", nullable: false),
                    member_id = table.Column<Guid>(type: "uuid", nullable: false),
                    start_at_utc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    hours_before = table.Column<int>(type: "integer", nullable: false),
                    queued_at_utc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_class_session_reminders", x => x.reminder_id);
                    table.ForeignKey(
                        name: "fk_class_session_reminders_class_sessions_session_id",
                        column: x => x.session_id,
                        principalTable: "class_sessions",
                        principalColumn: "session_id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.Sql("""
                CREATE TABLE IF NOT EXISTS course_interests (
                    interest_id uuid CONSTRAINT pk_course_interests PRIMARY KEY,
                    member_id uuid NOT NULL,
                    source_class_id integer NOT NULL CONSTRAINT fk_course_interests_classes_source_class_id REFERENCES classes(class_id) ON DELETE RESTRICT,
                    threshold_response_id uuid NOT NULL CONSTRAINT fk_course_interests_threshold_responses_threshold_response_id REFERENCES class_threshold_responses(threshold_response_id) ON DELETE RESTRICT,
                    refunded_points integer NOT NULL,
                    active boolean NOT NULL,
                    created_at_utc timestamptz NOT NULL,
                    cancelled_at_utc timestamptz NULL
                );
                """);

            migrationBuilder.CreateTable(
                name: "course_interest_deliveries",
                columns: table => new
                {
                    delivery_id = table.Column<Guid>(type: "uuid", nullable: false),
                    interest_id = table.Column<Guid>(type: "uuid", nullable: false),
                    class_id = table.Column<int>(type: "integer", nullable: false),
                    queued_at_utc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_course_interest_deliveries", x => x.delivery_id);
                    table.ForeignKey(
                        name: "fk_course_interest_deliveries_classes_class_id",
                        column: x => x.class_id,
                        principalTable: "classes",
                        principalColumn: "class_id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_course_interest_deliveries_course_interests_interest_id",
                        column: x => x.interest_id,
                        principalTable: "course_interests",
                        principalColumn: "interest_id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "ix_classes_continuation_of_class_id",
                table: "classes",
                column: "continuation_of_class_id");

            migrationBuilder.AddCheckConstraint(
                name: "ck_class_threshold_response_choice_target",
                table: "class_threshold_responses",
                sql: "(choice IS NULL AND target_class_id IS NULL) OR (choice IN (0, 2, 3) AND target_class_id IS NULL) OR (choice = 1 AND target_class_id IS NOT NULL)");

            migrationBuilder.CreateIndex(
                name: "ix_class_session_reminders_session_id_member_id_start_at_utc_h",
                table: "class_session_reminders",
                columns: new[] { "session_id", "member_id", "start_at_utc", "hours_before" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_course_interest_deliveries_class_id",
                table: "course_interest_deliveries",
                column: "class_id");

            migrationBuilder.CreateIndex(
                name: "ix_course_interest_deliveries_interest_id_class_id",
                table: "course_interest_deliveries",
                columns: new[] { "interest_id", "class_id" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_course_interests_member_id_active",
                table: "course_interests",
                columns: new[] { "member_id", "active" });

            migrationBuilder.Sql("CREATE INDEX IF NOT EXISTS ix_course_interests_source_class_id ON course_interests (source_class_id);");

            migrationBuilder.Sql("CREATE UNIQUE INDEX IF NOT EXISTS ix_course_interests_threshold_response_id ON course_interests (threshold_response_id);");

            migrationBuilder.AddForeignKey(
                name: "fk_classes_classes_continuation_of_class_id",
                table: "classes",
                column: "continuation_of_class_id",
                principalTable: "classes",
                principalColumn: "class_id",
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "fk_classes_classes_continuation_of_class_id",
                table: "classes");

            migrationBuilder.DropTable(
                name: "class_session_reminders");

            migrationBuilder.DropTable(
                name: "course_interest_deliveries");

            migrationBuilder.DropTable(
                name: "course_interests");

            migrationBuilder.DropIndex(
                name: "ix_classes_continuation_of_class_id",
                table: "classes");

            migrationBuilder.DropCheckConstraint(
                name: "ck_class_threshold_response_choice_target",
                table: "class_threshold_responses");

            migrationBuilder.DropColumn(
                name: "continuation_of_class_id",
                table: "classes");

            migrationBuilder.AddCheckConstraint(
                name: "ck_class_threshold_response_choice_target",
                table: "class_threshold_responses",
                sql: "(choice IS NULL AND target_class_id IS NULL) OR (choice = 0 AND target_class_id IS NULL) OR (choice = 1 AND target_class_id IS NOT NULL)");
        }
    }
}
