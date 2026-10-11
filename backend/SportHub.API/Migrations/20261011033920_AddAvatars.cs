using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace SportHub.API.Migrations
{
    /// <inheritdoc />
    public partial class AddAvatars : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "avatar_public_id",
                table: "user_profiles",
                type: "character varying(255)",
                maxLength: 255,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "avatar_url",
                table: "user_profiles",
                type: "character varying(2048)",
                maxLength: 2048,
                nullable: true);

            migrationBuilder.AddColumn<long>(
                name: "avatar_version",
                table: "user_profiles",
                type: "bigint",
                nullable: false,
                defaultValue: 0L);

            migrationBuilder.CreateTable(
                name: "avatar_deletions",
                columns: table => new
                {
                    deletion_id = table.Column<Guid>(type: "uuid", nullable: false),
                    public_id = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: false),
                    created_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    attempts = table.Column<int>(type: "integer", nullable: false),
                    last_attempt_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_avatar_deletions", x => x.deletion_id);
                });

            migrationBuilder.CreateTable(
                name: "avatar_reports",
                columns: table => new
                {
                    report_id = table.Column<Guid>(type: "uuid", nullable: false),
                    target_user_id = table.Column<Guid>(type: "uuid", nullable: false),
                    reporter_user_id = table.Column<Guid>(type: "uuid", nullable: false),
                    avatar_url = table.Column<string>(type: "character varying(2048)", maxLength: 2048, nullable: false),
                    avatar_public_id = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: true),
                    reason = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: false),
                    status = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    created_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    reviewed_by_id = table.Column<Guid>(type: "uuid", nullable: true),
                    reviewed_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_avatar_reports", x => x.report_id);
                    table.ForeignKey(
                        name: "fk_avatar_reports_user_accounts_reporter_user_id",
                        column: x => x.reporter_user_id,
                        principalTable: "user_accounts",
                        principalColumn: "user_id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_avatar_reports_user_accounts_reviewed_by_id",
                        column: x => x.reviewed_by_id,
                        principalTable: "user_accounts",
                        principalColumn: "user_id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_avatar_reports_user_accounts_target_user_id",
                        column: x => x.target_user_id,
                        principalTable: "user_accounts",
                        principalColumn: "user_id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "ix_avatar_deletions_public_id",
                table: "avatar_deletions",
                column: "public_id",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_avatar_reports_reporter_user_id_target_user_id_status",
                table: "avatar_reports",
                columns: new[] { "reporter_user_id", "target_user_id", "status" });

            migrationBuilder.CreateIndex(
                name: "ix_avatar_reports_reviewed_by_id",
                table: "avatar_reports",
                column: "reviewed_by_id");

            migrationBuilder.CreateIndex(
                name: "ix_avatar_reports_target_user_id_status",
                table: "avatar_reports",
                columns: new[] { "target_user_id", "status" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "avatar_deletions");

            migrationBuilder.DropTable(
                name: "avatar_reports");

            migrationBuilder.DropColumn(
                name: "avatar_public_id",
                table: "user_profiles");

            migrationBuilder.DropColumn(
                name: "avatar_url",
                table: "user_profiles");

            migrationBuilder.DropColumn(
                name: "avatar_version",
                table: "user_profiles");
        }
    }
}
