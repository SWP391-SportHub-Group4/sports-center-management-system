using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using SportHub.API.Persistence;

#nullable disable

namespace SportHub.API.Migrations;

[DbContext(typeof(SportHubDbContext))]
[Migration("20261011120000_SharedGymRoomsForPt")]
public class SharedGymRoomsForPt : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("""
            INSERT INTO service_room_types (offering_id, room_type_id)
            VALUES (2, 1)
            ON CONFLICT DO NOTHING;
            """);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("""
            DELETE FROM service_room_types
            WHERE offering_id = 2 AND room_type_id = 1;
            """);
    }
}
