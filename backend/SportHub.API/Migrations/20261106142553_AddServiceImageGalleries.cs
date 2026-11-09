using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace SportHub.API.Migrations
{
    /// <inheritdoc />
    public partial class AddServiceImageGalleries : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "service_image_deletions",
                columns: table => new
                {
                    deletion_id = table.Column<Guid>(type: "uuid", nullable: false),
                    public_id = table.Column<string>(type: "character varying(300)", maxLength: 300, nullable: false),
                    url = table.Column<string>(type: "character varying(2048)", maxLength: 2048, nullable: false),
                    created_at_utc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    next_attempt_at_utc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    attempts = table.Column<int>(type: "integer", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_service_image_deletions", x => x.deletion_id);
                });

            migrationBuilder.CreateTable(
                name: "service_image_galleries",
                columns: table => new
                {
                    kind = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: false),
                    service_id = table.Column<int>(type: "integer", nullable: false),
                    version = table.Column<long>(type: "bigint", nullable: false),
                    cover_image_id = table.Column<Guid>(type: "uuid", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_service_image_galleries", x => new { x.kind, x.service_id });
                    table.CheckConstraint("ck_service_image_galleries_id", "service_id > 0");
                    table.CheckConstraint("ck_service_image_galleries_kind", "kind IN ('membership', 'class', 'room')");
                    table.CheckConstraint("ck_service_image_galleries_version", "version >= 0");
                });

            migrationBuilder.CreateTable(
                name: "service_image_assets",
                columns: table => new
                {
                    image_id = table.Column<Guid>(type: "uuid", nullable: false),
                    kind = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: false),
                    service_id = table.Column<int>(type: "integer", nullable: false),
                    uploaded_by_user_id = table.Column<Guid>(type: "uuid", nullable: false),
                    url = table.Column<string>(type: "character varying(2048)", maxLength: 2048, nullable: false),
                    public_id = table.Column<string>(type: "character varying(300)", maxLength: 300, nullable: false),
                    width = table.Column<int>(type: "integer", nullable: false),
                    height = table.Column<int>(type: "integer", nullable: false),
                    alt_text = table.Column<string>(type: "character varying(300)", maxLength: 300, nullable: false),
                    sort_order = table.Column<int>(type: "integer", nullable: false),
                    is_published = table.Column<bool>(type: "boolean", nullable: false),
                    created_at_utc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_service_image_assets", x => x.image_id);
                    table.CheckConstraint("ck_service_image_assets_dimensions", "width > 0 AND height > 0");
                    table.CheckConstraint("ck_service_image_assets_order", "sort_order BETWEEN 0 AND 5");
                    table.ForeignKey(
                        name: "fk_service_image_assets_service_image_galleries_kind_service_id",
                        columns: x => new { x.kind, x.service_id },
                        principalTable: "service_image_galleries",
                        principalColumns: new[] { "kind", "service_id" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_service_image_assets_user_accounts_uploaded_by_user_id",
                        column: x => x.uploaded_by_user_id,
                        principalTable: "user_accounts",
                        principalColumn: "user_id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "ix_service_image_assets_is_published_created_at_utc",
                table: "service_image_assets",
                columns: new[] { "is_published", "created_at_utc" });

            migrationBuilder.CreateIndex(
                name: "ix_service_image_assets_kind_service_id_is_published",
                table: "service_image_assets",
                columns: new[] { "kind", "service_id", "is_published" });

            migrationBuilder.CreateIndex(
                name: "ix_service_image_assets_public_id",
                table: "service_image_assets",
                column: "public_id",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_service_image_assets_uploaded_by_user_id",
                table: "service_image_assets",
                column: "uploaded_by_user_id");

            migrationBuilder.CreateIndex(
                name: "ix_service_image_deletions_next_attempt_at_utc",
                table: "service_image_deletions",
                column: "next_attempt_at_utc");

            migrationBuilder.CreateIndex(
                name: "ix_service_image_deletions_public_id",
                table: "service_image_deletions",
                column: "public_id",
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "service_image_assets");

            migrationBuilder.DropTable(
                name: "service_image_deletions");

            migrationBuilder.DropTable(
                name: "service_image_galleries");
        }
    }
}
