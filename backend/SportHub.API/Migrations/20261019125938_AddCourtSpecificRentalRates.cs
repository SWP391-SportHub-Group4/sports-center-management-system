using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace SportHub.API.Migrations
{
    /// <inheritdoc />
    public partial class AddCourtSpecificRentalRates : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "room_id",
                table: "court_rates",
                type: "integer",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "ix_court_rates_room_id",
                table: "court_rates",
                column: "room_id");

            migrationBuilder.AddForeignKey(
                name: "fk_court_rates_rooms_room_id",
                table: "court_rates",
                column: "room_id",
                principalTable: "rooms",
                principalColumn: "room_id",
                onDelete: ReferentialAction.Cascade);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "fk_court_rates_rooms_room_id",
                table: "court_rates");

            migrationBuilder.DropIndex(
                name: "ix_court_rates_room_id",
                table: "court_rates");

            migrationBuilder.DropColumn(
                name: "room_id",
                table: "court_rates");
        }
    }
}
