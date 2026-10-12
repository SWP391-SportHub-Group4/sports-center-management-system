using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using SportHub.API.Persistence;

#nullable disable

namespace SportHub.API.Migrations;

[DbContext(typeof(SportHubDbContext))]
[Migration("20261013090000_GymDayPass")]
public sealed class GymDayPass : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("""
            INSERT INTO membership_packages (package_id, name, price, duration_days, session_limit, description, is_active)
            VALUES (50000, 'Gym day pass', 50000, 1, NULL,
                    'Gym access only on the local calendar day payment succeeds. Show your member code at reception or ask reception to check you in.', TRUE)
            ON CONFLICT (package_id) DO NOTHING;
            UPDATE sport_service_offerings SET is_enabled = FALSE WHERE service_type = 3;
            UPDATE membership_packages
               SET description = 'Unlimited gym check-ins for 30 days.'
             WHERE name = 'Gym 1 month' AND description = 'Unlimited gym check-ins for 30 days. An active Gym membership is required to purchase PT separately.';
            UPDATE membership_packages
               SET description = 'Gym access for 90 days.'
             WHERE name = 'Gym 3 months' AND description = 'Gym access for 90 days. An active Gym membership is required to purchase PT separately.';
            UPDATE membership_packages
               SET description = 'Gym access for 180 days.'
             WHERE name = 'Gym 6 months' AND description = 'Gym access for 180 days. An active Gym membership is required to purchase PT separately.';
            UPDATE membership_packages
               SET description = 'Gym access for 365 days.'
             WHERE name = 'Gym 12 months' AND description = 'Gym access for 365 days. An active Gym membership is required to purchase PT separately.';
            """);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        // Historical invoices may reference the day pass; keep its catalog row.
    }
}
