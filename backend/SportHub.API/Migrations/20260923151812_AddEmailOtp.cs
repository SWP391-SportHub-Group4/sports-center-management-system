using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace SportHub.API.Migrations
{
    /// <inheritdoc />
    public partial class AddEmailOtp : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "email_otps",
                columns: table => new
                {
                    email_otp_id = table.Column<Guid>(type: "uuid", nullable: false),
                    email = table.Column<string>(type: "citext", nullable: false),
                    code_hash = table.Column<string>(type: "text", nullable: false),
                    expires_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    attempts = table.Column<int>(type: "integer", nullable: false),
                    consumed_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    created_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_email_otps", x => x.email_otp_id);
                });

            migrationBuilder.CreateIndex(
                name: "ix_email_otps_email",
                table: "email_otps",
                column: "email",
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "email_otps");
        }
    }
}
