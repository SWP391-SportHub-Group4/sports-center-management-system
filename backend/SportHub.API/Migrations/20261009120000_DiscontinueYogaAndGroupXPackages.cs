using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using SportHub.API.Persistence;

#nullable disable

namespace SportHub.API.Migrations;

[DbContext(typeof(SportHubDbContext))]
[Migration("20261009120000_DiscontinueYogaAndGroupXPackages")]
public class DiscontinueYogaAndGroupXPackages : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        // These activities are no longer offered. Keep package identities and sold
        // entitlements intact so existing invoice/history references remain valid.
        migrationBuilder.Sql("""
            UPDATE membership_packages
            SET is_active = FALSE
            WHERE is_active
              AND (name ~* '\m(yoga|group[[:space:]_-]*x)\M'
                   OR COALESCE(description, '') ~* '\m(yoga|group[[:space:]_-]*x)\M');
            """);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        // Previous sale status cannot be reconstructed. Do not reactivate retired
        // activities or packages that had already been discontinued by a manager.
    }
}
