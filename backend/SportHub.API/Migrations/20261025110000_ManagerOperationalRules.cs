using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using SportHub.API.Persistence;

namespace SportHub.API.Migrations;

[DbContext(typeof(SportHubDbContext))]
[Migration("20261025110000_ManagerOperationalRules")]
public sealed class ManagerOperationalRules : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.AddColumn<DateTime>(name: "rental_booking_opens_at_utc", table: "rooms",
            type: "timestamp with time zone", nullable: true);
        // Legacy courts remain bookable. Existing open requests use the last real progress reply,
        // never an assignment, reminder or read receipt, as their inactivity baseline.
        migrationBuilder.Sql("""
            UPDATE member_support_requests r
            SET sla_due_at_utc = GREATEST(r.created_at, COALESCE(
                (SELECT MAX(e.created_at) FROM member_support_events e
                 WHERE e.request_id = r.request_id AND e.type = 'PROGRESS'), r.created_at)) + INTERVAL '48 hours'
            WHERE r.status NOT IN ('DONE', 'REJECTED', 'CLOSED');
            """);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
        => migrationBuilder.DropColumn(name: "rental_booking_opens_at_utc", table: "rooms");
}
