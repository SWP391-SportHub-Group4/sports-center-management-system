using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using SportHub.API.Persistence;

namespace SportHub.API.Migrations;

[DbContext(typeof(SportHubDbContext))]
[Migration("20261017100000_AddClassRequestOutcomeSnapshots")]
public sealed class AddClassRequestOutcomeSnapshots : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.AddColumn<string>(name: "outcome_snapshot_json",
            table: "class_session_change_requests", type: "text", nullable: true);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("""
            DO $$ BEGIN
                IF EXISTS (SELECT 1 FROM class_session_change_requests WHERE outcome_snapshot_json IS NOT NULL) THEN
                    RAISE EXCEPTION 'Cannot discard stored request outcomes. Preserve request history before rollback.';
                END IF;
            END $$;
            """);
        migrationBuilder.DropColumn(name: "outcome_snapshot_json", table: "class_session_change_requests");
    }
}
