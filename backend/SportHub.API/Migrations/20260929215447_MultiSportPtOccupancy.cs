using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace SportHub.API.Migrations
{
    /// <inheritdoc />
    public partial class MultiSportPtOccupancy : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "room_id",
                table: "pt_sessions",
                type: "integer",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "ix_pt_sessions_room_id",
                table: "pt_sessions",
                column: "room_id");

            migrationBuilder.AddForeignKey(
                name: "fk_pt_sessions_rooms_room_id",
                table: "pt_sessions",
                column: "room_id",
                principalTable: "rooms",
                principalColumn: "room_id",
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "fk_pt_sessions_rooms_room_id",
                table: "pt_sessions");

            migrationBuilder.DropIndex(
                name: "ix_pt_sessions_room_id",
                table: "pt_sessions");

            migrationBuilder.DropColumn(
                name: "room_id",
                table: "pt_sessions");
        }
    }
}
