using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace SportHub.API.Migrations
{
    /// <inheritdoc />
    public partial class AddCoachAvatars : Migration
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
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "avatar_public_id",
                table: "user_profiles");

            migrationBuilder.DropColumn(
                name: "avatar_url",
                table: "user_profiles");
        }
    }
}
