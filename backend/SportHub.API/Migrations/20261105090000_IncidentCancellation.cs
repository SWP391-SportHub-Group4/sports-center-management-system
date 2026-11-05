using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using SportHub.API.Persistence;

namespace SportHub.API.Migrations;

[DbContext(typeof(SportHubDbContext))]
[Migration("20261105090000_IncidentCancellation")]
public sealed class IncidentCancellation : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.AddColumn<DateTime>("cancelled_at_utc", "incident_notices", type: "timestamp with time zone", nullable: true);
        migrationBuilder.AddColumn<Guid>("cancelled_by_user_id", "incident_notices", type: "uuid", nullable: true);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropColumn("cancelled_at_utc", "incident_notices");
        migrationBuilder.DropColumn("cancelled_by_user_id", "incident_notices");
    }
}
