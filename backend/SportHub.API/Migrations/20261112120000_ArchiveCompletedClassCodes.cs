using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using SportHub.API.Persistence;

namespace SportHub.API.Migrations;

[DbContext(typeof(SportHubDbContext))]
[Migration("20261112120000_ArchiveCompletedClassCodes")]
public sealed class ArchiveCompletedClassCodes : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("""
            WITH completed_codes AS (
                SELECT c.class_id,
                    regexp_replace(c.code, ' Complete [0-9][0-9]/[0-9][0-9]/[0-9][0-9]$', '', 'i')
                    || ' Complete '
                    || to_char(max(s.end_at_utc) AT TIME ZONE 'Asia/Ho_Chi_Minh', 'DD/MM/YY') AS code
                FROM classes c
                JOIN class_sessions s ON s.class_id = c.class_id AND s.status = 1
                WHERE c.status = 3
                GROUP BY c.class_id, c.code
            )
            UPDATE classes c SET code = completed_codes.code, version = c.version + 1
            FROM completed_codes
            WHERE c.class_id = completed_codes.class_id AND c.code <> completed_codes.code;
            """);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        // A later cohort may have reused the original code; retain archived codes.
    }
}
