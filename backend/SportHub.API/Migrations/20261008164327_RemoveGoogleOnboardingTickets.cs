using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace SportHub.API.Migrations
{
    /// <inheritdoc />
    public partial class RemoveGoogleOnboardingTickets : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "google_onboarding_tickets");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "google_onboarding_tickets",
                columns: table => new
                {
                    ticket_id = table.Column<Guid>(type: "uuid", nullable: false),
                    consumed_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    created_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    email = table.Column<string>(type: "citext", nullable: false),
                    expires_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    provider_user_id = table.Column<string>(type: "text", nullable: false),
                    suggested_full_name = table.Column<string>(type: "text", nullable: true),
                    token_hash = table.Column<string>(type: "text", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_google_onboarding_tickets", x => x.ticket_id);
                });

            migrationBuilder.CreateIndex(
                name: "ix_google_onboarding_tickets_provider_user_id",
                table: "google_onboarding_tickets",
                column: "provider_user_id");

            migrationBuilder.CreateIndex(
                name: "ix_google_onboarding_tickets_token_hash",
                table: "google_onboarding_tickets",
                column: "token_hash",
                unique: true);
        }
    }
}
