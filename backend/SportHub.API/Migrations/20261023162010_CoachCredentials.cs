using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace SportHub.API.Migrations
{
    /// <inheritdoc />
    public partial class CoachCredentials : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "coach_credentials",
                columns: table => new
                {
                    credential_id = table.Column<Guid>(type: "uuid", nullable: false),
                    coach_user_id = table.Column<Guid>(type: "uuid", nullable: false),
                    kind = table.Column<int>(type: "integer", nullable: false),
                    title = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    issuer = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    issued_on = table.Column<DateOnly>(type: "date", nullable: true),
                    file_name = table.Column<string>(type: "character varying(180)", maxLength: 180, nullable: false),
                    file_url = table.Column<string>(type: "character varying(1500)", maxLength: 1500, nullable: false),
                    file_public_id = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: false),
                    content_type = table.Column<string>(type: "character varying(40)", maxLength: 40, nullable: false),
                    size_bytes = table.Column<long>(type: "bigint", nullable: false),
                    is_published = table.Column<bool>(type: "boolean", nullable: false),
                    created_at_utc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    updated_at_utc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    version = table.Column<int>(type: "integer", nullable: false),
                    deleted_at_utc = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    asset_deleted_at_utc = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_coach_credentials", x => x.credential_id);
                    table.ForeignKey(
                        name: "fk_coach_credentials_user_accounts_coach_user_id",
                        column: x => x.coach_user_id,
                        principalTable: "user_accounts",
                        principalColumn: "user_id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "ix_coach_credentials_coach_user_id_deleted_at_utc",
                table: "coach_credentials",
                columns: new[] { "coach_user_id", "deleted_at_utc" });

            migrationBuilder.CreateIndex(
                name: "ix_coach_credentials_file_public_id",
                table: "coach_credentials",
                column: "file_public_id",
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "coach_credentials");
        }
    }
}
