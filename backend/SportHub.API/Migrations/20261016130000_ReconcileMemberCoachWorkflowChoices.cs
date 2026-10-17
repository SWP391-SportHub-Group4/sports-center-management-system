using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using SportHub.API.Persistence;

namespace SportHub.API.Migrations;

[DbContext(typeof(SportHubDbContext))]
[Migration("20261016130000_ReconcileMemberCoachWorkflowChoices")]
public sealed class ReconcileMemberCoachWorkflowChoices : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropCheckConstraint(
            name: "ck_class_threshold_response_choice_target",
            table: "class_threshold_responses");

        // Both branches previously allocated value 2. A course-interest receipt proves
        // that the member chose a refund and next-cohort notification, not KeepPlace.
        migrationBuilder.Sql("""
            UPDATE class_threshold_responses AS r
            SET choice = 3
            WHERE r.choice = 2
              AND EXISTS (SELECT 1 FROM course_interests AS i
                          WHERE i.threshold_response_id = r.threshold_response_id);

            UPDATE notifications AS n
            SET source_event_type = 25
            WHERE n.source_event_type = 21
              AND EXISTS (SELECT 1 FROM class_session_reminders AS r
                          WHERE r.reminder_id = n.source_entity_id);

            UPDATE notifications AS n
            SET source_event_type = 26
            WHERE n.source_event_type = 22
              AND EXISTS (SELECT 1 FROM course_interest_deliveries AS d
                          WHERE d.delivery_id = n.source_entity_id);
            """);

        migrationBuilder.AddCheckConstraint(
            name: "ck_class_threshold_response_choice_target",
            table: "class_threshold_responses",
            sql: "(choice IS NULL AND target_class_id IS NULL) OR (choice IN (0, 2, 3) AND target_class_id IS NULL) OR (choice = 1 AND target_class_id IS NOT NULL)");
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        throw new NotSupportedException(
            "This migration separates persisted values that had different meanings on two branches. " +
            "Restore a database backup to roll back without reinterpreting member choices or notifications.");
    }
}
