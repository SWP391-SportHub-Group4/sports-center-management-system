using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using SportHub.API.Persistence;

namespace SportHub.API.Migrations;

[DbContext(typeof(SportHubDbContext))]
[Migration("20261017090000_AddCoachAbsenceRequests")]
public sealed class AddCoachAbsenceRequests : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropCheckConstraint(
            name: "ck_class_change_type",
            table: "class_session_change_requests");
        migrationBuilder.AddCheckConstraint(
            name: "ck_class_change_type",
            table: "class_session_change_requests",
            sql: "type IN ('ABSENCE','SUBSTITUTE','RESCHEDULE','CANCEL_WITH_MAKEUP')");
        migrationBuilder.AddCheckConstraint(
            name: "ck_class_absence_no_proposal",
            table: "class_session_change_requests",
            sql: "type <> 'ABSENCE' OR (proposed_start_at_utc IS NULL AND proposed_end_at_utc IS NULL)");
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        // An absence has no Coach-selected resolution. Do not rewrite it into a
        // legacy proposal or delete request history to make the older check pass.
        migrationBuilder.Sql("""
            DO $$ BEGIN
                IF EXISTS (SELECT 1 FROM class_session_change_requests WHERE type = 'ABSENCE') THEN
                    RAISE EXCEPTION 'Cannot roll back while absence requests exist. Preserve request history and restore a database backup if necessary.';
                END IF;
            END $$;
            """);
        migrationBuilder.DropCheckConstraint(
            name: "ck_class_absence_no_proposal",
            table: "class_session_change_requests");
        migrationBuilder.DropCheckConstraint(
            name: "ck_class_change_type",
            table: "class_session_change_requests");
        migrationBuilder.AddCheckConstraint(
            name: "ck_class_change_type",
            table: "class_session_change_requests",
            sql: "type IN ('SUBSTITUTE','RESCHEDULE','CANCEL_WITH_MAKEUP')");
    }
}
