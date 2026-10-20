using System;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using SportHub.API.Persistence;

#nullable disable

namespace SportHub.API.Migrations;

[DbContext(typeof(SportHubDbContext))]
[Migration("20261020020000_RemoveAvatarReports")]
public sealed class RemoveAvatarReports : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
        => migrationBuilder.DropTable(name: "avatar_reports");

    protected override void Down(MigrationBuilder migrationBuilder)
    {
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
                table.ForeignKey("fk_avatar_reports_user_accounts_reporter_user_id", x => x.reporter_user_id,
                    "user_accounts", "user_id", onDelete: ReferentialAction.Restrict);
                table.ForeignKey("fk_avatar_reports_user_accounts_reviewed_by_id", x => x.reviewed_by_id,
                    "user_accounts", "user_id", onDelete: ReferentialAction.Restrict);
                table.ForeignKey("fk_avatar_reports_user_accounts_target_user_id", x => x.target_user_id,
                    "user_accounts", "user_id", onDelete: ReferentialAction.Restrict);
            });
        migrationBuilder.CreateIndex("ix_avatar_reports_reporter_user_id_target_user_id_status",
            "avatar_reports", new[] { "reporter_user_id", "target_user_id", "status" });
        migrationBuilder.CreateIndex("ix_avatar_reports_reviewed_by_id", "avatar_reports", "reviewed_by_id");
        migrationBuilder.CreateIndex("ix_avatar_reports_target_user_id_status",
            "avatar_reports", new[] { "target_user_id", "status" });
    }
}
