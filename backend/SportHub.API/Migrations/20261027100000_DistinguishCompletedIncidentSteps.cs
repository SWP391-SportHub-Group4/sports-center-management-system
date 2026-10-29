using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using SportHub.API.Persistence;

namespace SportHub.API.Migrations;

[DbContext(typeof(SportHubDbContext))]
[Migration("20261027100000_DistinguishCompletedIncidentSteps")]
public sealed class DistinguishCompletedIncidentSteps : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
        // Both actions previously used 2. Session-only rows are completed-session reviews;
        // removed room blocks have room_block_id and no session_id. Preserve their identities and history.
        => migrationBuilder.Sql("""
            UPDATE incident_fence_steps
            SET kind = 3
            WHERE kind = 2 AND session_id IS NOT NULL AND room_block_id IS NULL;
            """);

    protected override void Down(MigrationBuilder migrationBuilder)
        => migrationBuilder.Sql("UPDATE incident_fence_steps SET kind = 2 WHERE kind = 3;");
}
