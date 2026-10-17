using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using SportHub.API.Persistence;

#nullable disable

namespace SportHub.API.Migrations;

[DbContext(typeof(SportHubDbContext))]
[Migration("20261016050000_AddSupportRequestWorkflow")]
public sealed class AddSupportRequestWorkflow : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.AddColumn<Guid>("assigned_to_user_id", "member_support_requests", "uuid", nullable: true);
        migrationBuilder.AddColumn<string>("progress_note", "member_support_requests", "character varying(1000)",
            maxLength: 1000, nullable: true);
        migrationBuilder.AddColumn<DateTime>("updated_at", "member_support_requests", "timestamp with time zone", nullable: true);
        migrationBuilder.AddColumn<DateTime>("closed_at", "member_support_requests", "timestamp with time zone", nullable: true);
        migrationBuilder.CreateIndex("ix_member_support_requests_assigned_to_user_id", "member_support_requests", "assigned_to_user_id");
        migrationBuilder.CreateIndex("ix_member_support_requests_status_updated_at", "member_support_requests",
            new[] { "status", "updated_at" });
        migrationBuilder.AddForeignKey(
            name: "fk_member_support_requests_user_accounts_assigned_to_user_id",
            table: "member_support_requests", column: "assigned_to_user_id",
            principalTable: "user_accounts", principalColumn: "user_id",
            onDelete: ReferentialAction.Restrict);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropForeignKey("fk_member_support_requests_user_accounts_assigned_to_user_id", "member_support_requests");
        migrationBuilder.DropIndex("ix_member_support_requests_assigned_to_user_id", "member_support_requests");
        migrationBuilder.DropIndex("ix_member_support_requests_status_updated_at", "member_support_requests");
        migrationBuilder.DropColumn("assigned_to_user_id", "member_support_requests");
        migrationBuilder.DropColumn("progress_note", "member_support_requests");
        migrationBuilder.DropColumn("updated_at", "member_support_requests");
        migrationBuilder.DropColumn("closed_at", "member_support_requests");
    }
}
