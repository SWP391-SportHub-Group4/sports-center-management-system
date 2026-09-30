using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace SportHub.API.Migrations
{
    /// <inheritdoc />
    public partial class CourtRentalWorkflow : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "court_rentals",
                columns: table => new
                {
                    court_rental_id = table.Column<Guid>(type: "uuid", nullable: false),
                    external_coach_id = table.Column<Guid>(type: "uuid", nullable: false),
                    sport_id = table.Column<int>(type: "integer", nullable: false),
                    room_id = table.Column<int>(type: "integer", nullable: false),
                    start_at_utc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    end_at_utc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    expected_attendees = table.Column<int>(type: "integer", nullable: false),
                    total_price = table.Column<decimal>(type: "numeric(12,2)", precision: 12, scale: 2, nullable: false),
                    price_snapshot_json = table.Column<string>(type: "jsonb", nullable: false),
                    status = table.Column<int>(type: "integer", nullable: false),
                    invoice_item_id = table.Column<Guid>(type: "uuid", nullable: true),
                    created_at_utc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    cancelled_at_utc = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    cancel_reason = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_court_rentals", x => x.court_rental_id);
                    table.CheckConstraint("ck_court_rentals_range", "end_at_utc > start_at_utc");
                    table.ForeignKey(
                        name: "fk_court_rentals_invoice_items_invoice_item_id",
                        column: x => x.invoice_item_id,
                        principalTable: "invoice_items",
                        principalColumn: "item_id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_court_rentals_rooms_room_id",
                        column: x => x.room_id,
                        principalTable: "rooms",
                        principalColumn: "room_id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_court_rentals_sports_sport_id",
                        column: x => x.sport_id,
                        principalTable: "sports",
                        principalColumn: "sport_id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_court_rentals_user_accounts_external_coach_id",
                        column: x => x.external_coach_id,
                        principalTable: "user_accounts",
                        principalColumn: "user_id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "ix_court_rentals_external_coach_id_status_start_at_utc",
                table: "court_rentals",
                columns: new[] { "external_coach_id", "status", "start_at_utc" });

            migrationBuilder.CreateIndex(
                name: "ix_court_rentals_invoice_item_id",
                table: "court_rentals",
                column: "invoice_item_id",
                unique: true,
                filter: "invoice_item_id IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "ix_court_rentals_room_id",
                table: "court_rentals",
                column: "room_id");

            migrationBuilder.CreateIndex(
                name: "ix_court_rentals_sport_id",
                table: "court_rentals",
                column: "sport_id");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "court_rentals");
        }
    }
}
