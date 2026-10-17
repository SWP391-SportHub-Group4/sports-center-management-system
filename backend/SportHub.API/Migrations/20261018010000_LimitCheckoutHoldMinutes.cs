using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using SportHub.API.Persistence;

namespace SportHub.API.Migrations;

[DbContext(typeof(SportHubDbContext))]
[Migration("20261018010000_LimitCheckoutHoldMinutes")]
public sealed class LimitCheckoutHoldMinutes : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        // Existing checkout/attempt expiry timestamps are snapshots and remain unchanged.
        migrationBuilder.Sql("""
            UPDATE system_settings
            SET value = '15', updated_at = NOW(), updated_by_user_id = NULL
            WHERE key = 'hold.minutes'
              AND NOT (CASE WHEN value ~ '^[0-9]{1,9}$'
                            THEN value::integer BETWEEN 10 AND 30
                            ELSE FALSE END);
            """);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        // The previous value cannot be recovered after normalization.
    }
}
