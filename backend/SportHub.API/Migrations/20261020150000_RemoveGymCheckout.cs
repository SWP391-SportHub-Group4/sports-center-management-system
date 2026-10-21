using System;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using SportHub.API.Persistence;

#nullable disable

namespace SportHub.API.Migrations;

[DbContext(typeof(SportHubDbContext))]
[Migration("20261020150000_RemoveGymCheckout")]
public sealed class RemoveGymCheckout : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("""
            UPDATE membership_packages
               SET is_active = FALSE
             WHERE name ~* '(^|[^[:alnum:]])(PT|personal[[:space:]_-]*training)([^[:alnum:]]|$)';
            """);

        migrationBuilder.DropForeignKey(
            name: "fk_gym_checkins_user_accounts_checked_out_by_user_id",
            table: "gym_checkins");
        migrationBuilder.DropIndex(
            name: "ix_gym_checkins_checked_out_by_user_id",
            table: "gym_checkins");
        migrationBuilder.DropColumn(name: "checked_out_by_user_id", table: "gym_checkins");
        migrationBuilder.DropColumn(name: "check_out_time", table: "gym_checkins");
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.AddColumn<Guid>(
            name: "checked_out_by_user_id", table: "gym_checkins",
            type: "uuid", nullable: true);
        migrationBuilder.AddColumn<DateTime>(
            name: "check_out_time", table: "gym_checkins",
            type: "timestamp with time zone", nullable: true);
        migrationBuilder.CreateIndex(
            name: "ix_gym_checkins_checked_out_by_user_id", table: "gym_checkins",
            column: "checked_out_by_user_id");
        migrationBuilder.AddForeignKey(
            name: "fk_gym_checkins_user_accounts_checked_out_by_user_id",
            table: "gym_checkins", column: "checked_out_by_user_id",
            principalTable: "user_accounts", principalColumn: "user_id",
            onDelete: ReferentialAction.Restrict);
    }
}
