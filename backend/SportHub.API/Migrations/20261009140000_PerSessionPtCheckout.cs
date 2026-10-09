using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using SportHub.API.Persistence;

namespace SportHub.API.Migrations;

[DbContext(typeof(SportHubDbContext))]
[Migration("20261009140000_PerSessionPtCheckout")]
public class PerSessionPtCheckout : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.AddColumn<DateTime>("pt_start_at_utc", "checkout_sessions", type: "timestamp with time zone", nullable: true);
        migrationBuilder.AddColumn<int>("pt_room_id", "checkout_sessions", type: "integer", nullable: true);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("""
            DO $$ BEGIN
              IF EXISTS (SELECT 1 FROM checkout_sessions WHERE pt_start_at_utc IS NOT NULL) THEN
                RAISE EXCEPTION 'Cannot remove per-session PT checkout fields while bookings reference them';
              END IF;
            END $$;
            """);
        migrationBuilder.DropColumn("pt_start_at_utc", "checkout_sessions");
        migrationBuilder.DropColumn("pt_room_id", "checkout_sessions");
    }
}
