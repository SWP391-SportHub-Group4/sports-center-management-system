using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace SportHub.API.Migrations
{
    /// <inheritdoc />
    public partial class AvatarAuditImages : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "avatar_audit_images",
                columns: table => new
                {
                    image_id = table.Column<Guid>(type: "uuid", nullable: false),
                    owner_user_id = table.Column<Guid>(type: "uuid", nullable: false),
                    source_public_id = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: true),
                    content = table.Column<byte[]>(type: "bytea", nullable: false),
                    content_type = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: false),
                    created_at_utc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    expires_at_utc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_avatar_audit_images", x => x.image_id);
                });

            migrationBuilder.CreateIndex(
                name: "ix_avatar_audit_images_expires_at_utc",
                table: "avatar_audit_images",
                column: "expires_at_utc");

            migrationBuilder.CreateIndex(
                name: "ix_avatar_audit_images_owner_user_id_source_public_id",
                table: "avatar_audit_images",
                columns: new[] { "owner_user_id", "source_public_id" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "avatar_audit_images");
        }
    }
}
