using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using SportHub.API.Persistence;

#nullable disable

namespace SportHub.API.Migrations;

/// <summary>Move the default membership expiry reminder from seven to ten days without changing manager overrides.</summary>
[DbContext(typeof(SportHubDbContext))]
[Migration("20261023000001_PackageExpiryReminderTenDays")]
public partial class PackageExpiryReminderTenDays : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("UPDATE system_settings SET value = '10' WHERE key = 'membership.expiry_notice_days' AND value = '7' AND updated_by_user_id IS NULL;");
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("UPDATE system_settings SET value = '7' WHERE key = 'membership.expiry_notice_days' AND value = '10' AND updated_by_user_id IS NULL;");
    }
}
