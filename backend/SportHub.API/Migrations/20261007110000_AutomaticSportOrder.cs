using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using SportHub.API.Persistence;

#nullable disable

namespace SportHub.API.Migrations;

[DbContext(typeof(SportHubDbContext))]
[Migration("20261007110000_AutomaticSportOrder")]
public class AutomaticSportOrder : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        // Preserve the previous relative order within each activity group, including
        // negative, duplicate and sparse ranks. IDs and all foreign keys stay intact.
        migrationBuilder.Sql("""
            WITH ranked AS (
                SELECT sport_id,
                       ROW_NUMBER() OVER (ORDER BY is_active DESC, sort_order, name, sport_id)::integer AS new_order
                FROM sports
            )
            UPDATE sports AS sport
            SET sort_order = ranked.new_order
            FROM ranked
            WHERE sport.sport_id = ranked.sport_id;
            """);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        // Previous manually assigned ranks cannot be reconstructed; retain the valid order.
    }
}
