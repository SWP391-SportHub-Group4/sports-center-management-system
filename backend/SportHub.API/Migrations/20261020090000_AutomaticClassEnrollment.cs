using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using SportHub.API.Persistence;

namespace SportHub.API.Migrations;

[DbContext(typeof(SportHubDbContext))]
[Migration("20261020090000_AutomaticClassEnrollment")]
public sealed class AutomaticClassEnrollment : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
        => migrationBuilder.Sql("""
            UPDATE classes c SET
                enrollment_open = (c.confirmed_count < c.capacity),
                enrollment_closed_reason = CASE WHEN c.confirmed_count >= c.capacity THEN 'Class is full.' ELSE NULL END,
                enrollment_closed_at_utc = CASE WHEN c.confirmed_count >= c.capacity THEN COALESCE(c.enrollment_closed_at_utc, NOW()) ELSE NULL END,
                version = version + 1
            WHERE c.status = 1
                AND EXISTS (SELECT 1 FROM class_sessions s WHERE s.class_id = c.class_id AND s.status != 2)
                AND NOT EXISTS (SELECT 1 FROM class_sessions s WHERE s.class_id = c.class_id AND s.status != 2 AND s.start_at_utc <= NOW());
            """);

    // This data transition cannot reconstruct historical manual closure settings.
    protected override void Down(MigrationBuilder migrationBuilder) { }
}
