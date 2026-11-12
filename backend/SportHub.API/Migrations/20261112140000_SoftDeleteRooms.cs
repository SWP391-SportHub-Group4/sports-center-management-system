using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using SportHub.API.Persistence;

namespace SportHub.API.Migrations;

[DbContext(typeof(SportHubDbContext))]
[Migration("20261112140000_SoftDeleteRooms")]
public sealed class SoftDeleteRooms : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.AddColumn<DateTime>(name: "deleted_at_utc", table: "rooms",
            type: "timestamp with time zone", nullable: true);
        migrationBuilder.DropIndex(name: "ix_rooms_name", table: "rooms");
        migrationBuilder.CreateIndex(name: "ix_rooms_name", table: "rooms", column: "name",
            unique: true, filter: "deleted_at_utc IS NULL");
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropIndex(name: "ix_rooms_name", table: "rooms");
        migrationBuilder.CreateIndex(name: "ix_rooms_name", table: "rooms", column: "name", unique: true);
        migrationBuilder.DropColumn(name: "deleted_at_utc", table: "rooms");
    }
}
