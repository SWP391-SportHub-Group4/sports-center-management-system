using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace SportHub.API.Migrations
{
    /// <inheritdoc />
    public partial class ManagerWorkspace : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "sport_id",
                table: "rooms",
                type: "integer",
                nullable: true);

            // Backfill only unambiguous sport mappings. Multi-sport legacy rooms stay unclassified.
            migrationBuilder.Sql("""
                UPDATE rooms r SET sport_id = mapping.sport_id
                FROM (SELECT room_type_id, MIN(sport_id) AS sport_id FROM sport_room_types
                      GROUP BY room_type_id HAVING COUNT(*) = 1) mapping
                WHERE r.room_type_id = mapping.room_type_id;
                UPDATE rooms r SET is_active = FALSE FROM room_types t
                WHERE r.room_type_id = t.room_type_id AND NOT t.is_active;
                """);

            migrationBuilder.CreateTable(
                name: "avatar_report",
                columns: table => new
                {
                    report_id = table.Column<Guid>(type: "uuid", nullable: false),
                    target_user_id = table.Column<Guid>(type: "uuid", nullable: false),
                    reporter_user_id = table.Column<Guid>(type: "uuid", nullable: false),
                    avatar_url = table.Column<string>(type: "character varying(2048)", maxLength: 2048, nullable: false),
                    reason = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: false),
                    status = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    created_at_utc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    reviewed_by_user_id = table.Column<Guid>(type: "uuid", nullable: true),
                    reviewed_at_utc = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_avatar_report", x => x.report_id);
                    table.ForeignKey(
                        name: "fk_avatar_report_user_accounts_reporter_user_id",
                        column: x => x.reporter_user_id,
                        principalTable: "user_accounts",
                        principalColumn: "user_id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_avatar_report_user_accounts_reviewed_by_user_id",
                        column: x => x.reviewed_by_user_id,
                        principalTable: "user_accounts",
                        principalColumn: "user_id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_avatar_report_user_accounts_target_user_id",
                        column: x => x.target_user_id,
                        principalTable: "user_accounts",
                        principalColumn: "user_id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "ix_rooms_sport_id",
                table: "rooms",
                column: "sport_id");

            migrationBuilder.CreateIndex(
                name: "ix_avatar_report_reporter_user_id",
                table: "avatar_report",
                column: "reporter_user_id");

            migrationBuilder.CreateIndex(
                name: "ix_avatar_report_reviewed_by_user_id",
                table: "avatar_report",
                column: "reviewed_by_user_id");

            migrationBuilder.CreateIndex(
                name: "ix_avatar_report_status_created_at_utc",
                table: "avatar_report",
                columns: new[] { "status", "created_at_utc" });

            migrationBuilder.CreateIndex(
                name: "ix_avatar_report_target_user_id",
                table: "avatar_report",
                column: "target_user_id");

            migrationBuilder.AddForeignKey(
                name: "fk_rooms_sports_sport_id",
                table: "rooms",
                column: "sport_id",
                principalTable: "sports",
                principalColumn: "sport_id",
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "fk_rooms_sports_sport_id",
                table: "rooms");

            migrationBuilder.DropTable(
                name: "avatar_report");

            migrationBuilder.DropIndex(
                name: "ix_rooms_sport_id",
                table: "rooms");

            migrationBuilder.DropColumn(
                name: "sport_id",
                table: "rooms");
        }
    }
}
