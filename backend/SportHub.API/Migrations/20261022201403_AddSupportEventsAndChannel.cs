using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace SportHub.API.Migrations
{
    /// <inheritdoc />
    public partial class AddSupportEventsAndChannel : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "channel",
                table: "member_support_requests",
                type: "character varying(20)",
                maxLength: 20,
                nullable: false,
                defaultValue: "COUNTER");

            migrationBuilder.Sql("UPDATE member_support_requests SET channel = 'ONLINE' WHERE recorded_by_user_id = member_id;");

            migrationBuilder.CreateTable(
                name: "member_support_events",
                columns: table => new
                {
                    event_id = table.Column<Guid>(type: "uuid", nullable: false),
                    request_id = table.Column<Guid>(type: "uuid", nullable: false),
                    actor_user_id = table.Column<Guid>(type: "uuid", nullable: false),
                    type = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    note = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: true),
                    target_user_id = table.Column<Guid>(type: "uuid", nullable: true),
                    created_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_member_support_events", x => x.event_id);
                    table.ForeignKey(
                        name: "fk_member_support_events_member_support_requests_request_id",
                        column: x => x.request_id,
                        principalTable: "member_support_requests",
                        principalColumn: "request_id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "ix_member_support_events_request_id_created_at",
                table: "member_support_events",
                columns: new[] { "request_id", "created_at" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "member_support_events");

            migrationBuilder.DropColumn(
                name: "channel",
                table: "member_support_requests");
        }
    }
}
