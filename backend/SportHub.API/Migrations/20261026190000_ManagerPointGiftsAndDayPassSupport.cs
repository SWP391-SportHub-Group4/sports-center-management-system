using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace SportHub.API.Migrations
{
    /// <inheritdoc />
    public partial class ManagerPointGiftsAndDayPassSupport : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(
                name: "closes_gym",
                table: "incident_notices",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<string>(
                name: "day_pass_members_json",
                table: "incident_notices",
                type: "jsonb",
                nullable: false,
                defaultValue: "[]");

            migrationBuilder.AddColumn<DateTime>(
                name: "day_pass_notice_sent_at_utc",
                table: "incident_notices",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "point_gifts",
                columns: table => new
                {
                    gift_id = table.Column<Guid>(type: "uuid", nullable: false),
                    batch_id = table.Column<Guid>(type: "uuid", nullable: false),
                    member_id = table.Column<Guid>(type: "uuid", nullable: false),
                    manager_id = table.Column<Guid>(type: "uuid", nullable: false),
                    incident_id = table.Column<Guid>(type: "uuid", nullable: true),
                    points = table.Column<int>(type: "integer", nullable: false),
                    reason = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: false),
                    member_agreed = table.Column<bool>(type: "boolean", nullable: false),
                    ledger_entry_id = table.Column<Guid>(type: "uuid", nullable: false),
                    created_at_utc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_point_gifts", x => x.gift_id);
                    table.CheckConstraint("ck_point_gift_positive", "points > 0");
                    table.ForeignKey(
                        name: "fk_point_gifts_incident_notices_incident_id",
                        column: x => x.incident_id,
                        principalTable: "incident_notices",
                        principalColumn: "incident_id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_point_gifts_point_ledger_entries_ledger_entry_id",
                        column: x => x.ledger_entry_id,
                        principalTable: "point_ledger_entries",
                        principalColumn: "ledger_entry_id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_point_gifts_user_accounts_manager_id",
                        column: x => x.manager_id,
                        principalTable: "user_accounts",
                        principalColumn: "user_id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_point_gifts_user_accounts_member_id",
                        column: x => x.member_id,
                        principalTable: "user_accounts",
                        principalColumn: "user_id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "ix_point_gifts_batch_id_member_id",
                table: "point_gifts",
                columns: new[] { "batch_id", "member_id" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_point_gifts_created_at_utc",
                table: "point_gifts",
                column: "created_at_utc");

            migrationBuilder.CreateIndex(
                name: "ix_point_gifts_incident_id_member_id",
                table: "point_gifts",
                columns: new[] { "incident_id", "member_id" },
                unique: true,
                filter: "incident_id IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "ix_point_gifts_ledger_entry_id",
                table: "point_gifts",
                column: "ledger_entry_id",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_point_gifts_manager_id",
                table: "point_gifts",
                column: "manager_id");

            migrationBuilder.CreateIndex(
                name: "ix_point_gifts_member_id",
                table: "point_gifts",
                column: "member_id");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "point_gifts");

            migrationBuilder.DropColumn(
                name: "closes_gym",
                table: "incident_notices");

            migrationBuilder.DropColumn(
                name: "day_pass_members_json",
                table: "incident_notices");

            migrationBuilder.DropColumn(
                name: "day_pass_notice_sent_at_utc",
                table: "incident_notices");
        }
    }
}
