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
            // The shared AddAvatars migration may run first on a fresh database.
            // Keep this branch migration safe for databases that applied it earlier.
            migrationBuilder.Sql("""
                ALTER TABLE user_profiles
                    ADD COLUMN IF NOT EXISTS avatar_public_id character varying(255) NULL;
                ALTER TABLE user_profiles
                    ADD COLUMN IF NOT EXISTS avatar_url character varying(2048) NULL;
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            // The shared AddAvatars migration owns these columns after the merge.
        }
    }
}
