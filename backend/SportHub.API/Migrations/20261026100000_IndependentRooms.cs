using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using SportHub.API.Persistence;

namespace SportHub.API.Migrations;

[DbContext(typeof(SportHubDbContext))]
[Migration("20261026100000_IndependentRooms")]
public sealed class IndependentRooms : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.AddColumn<bool>(name: "allow_rental", table: "rooms", type: "boolean", nullable: false, defaultValue: false);
        // Preserve existing rental operations, including bookings with retired prices.
        migrationBuilder.Sql("""
            UPDATE rooms r SET allow_rental = TRUE
            WHERE EXISTS (SELECT 1 FROM court_rates p WHERE p.is_active AND p.room_type_id = r.room_type_id
                AND (p.room_id IS NULL OR p.room_id = r.room_id)
                AND (p.sport_id IS NULL OR r.sport_id IS NULL OR p.sport_id = r.sport_id))
               OR EXISTS (SELECT 1 FROM court_rentals b WHERE b.room_id = r.room_id);
            """);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
        => migrationBuilder.DropColumn(name: "allow_rental", table: "rooms");
}
