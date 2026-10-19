using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using SportHub.API.Persistence;

#nullable disable

namespace SportHub.API.Migrations;

/// <summary>Combine identical price windows across weekdays without changing any quoted price.</summary>
[DbContext(typeof(SportHubDbContext))]
[Migration("20261019140000_ConsolidateCourtRateDays")]
public sealed class ConsolidateCourtRateDays : Migration
{
    public const string MergeSql = """
        WITH grouped AS (
            SELECT min(rate_id) AS keep_id, array_agg(rate_id) AS ids,
                   string_agg(days_of_week, ',') AS days
            FROM court_rates
            GROUP BY room_id, room_type_id, sport_id, start_time_local, end_time_local, price_per_hour, is_active
            HAVING count(*) > 1
        ), updated AS (
            UPDATE court_rates r
            SET days_of_week = (
                SELECT string_agg(day, ',' ORDER BY array_position(ARRAY['MON','TUE','WED','THU','FRI','SAT','SUN'], day))
                FROM (SELECT DISTINCT upper(btrim(value)) AS day
                      FROM unnest(string_to_array(g.days, ',')) AS value) days
            )
            FROM grouped g WHERE r.rate_id = g.keep_id
            RETURNING r.rate_id
        )
        DELETE FROM court_rates r USING grouped g
        WHERE r.rate_id = ANY(g.ids) AND r.rate_id <> g.keep_id;
        """;

    protected override void Up(MigrationBuilder migrationBuilder) => migrationBuilder.Sql(MergeSql);

    // The grouped representation preserves all prices and days. Rolling back does not split them again.
    protected override void Down(MigrationBuilder migrationBuilder) { }
}
