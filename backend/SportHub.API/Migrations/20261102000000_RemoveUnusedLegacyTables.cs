using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using SportHub.API.Persistence;

#nullable disable

namespace SportHub.API.Migrations;

[DbContext(typeof(SportHubDbContext))]
[Migration("20261102000000_RemoveUnusedLegacyTables")]
public sealed class RemoveUnusedLegacyTables : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder) => migrationBuilder.Sql(
        """
        DO $$
        DECLARE table_name text;
        DECLARE has_rows boolean;
        DECLARE unused_tables text[] := ARRAY[
            'legacy_relationship_class_links', 'legacy_attendances', 'legacy_enrollments',
            'legacy_class_sessions', 'legacy_class_recurrences', 'legacy_classes',
            'course_interest_subscriptions'
        ];
        BEGIN
            -- Historical tables can contain data on an older deployment. Never discard it implicitly.
            FOREACH table_name IN ARRAY unused_tables LOOP
                IF to_regclass(format('%I.%I', current_schema(), table_name)) IS NOT NULL THEN
                    EXECUTE format('SELECT EXISTS (SELECT 1 FROM %I.%I)', current_schema(), table_name)
                        INTO has_rows;
                    IF has_rows THEN
                        RAISE EXCEPTION 'Table % still contains data; back it up and clear it before this migration', table_name;
                    END IF;
                END IF;
            END LOOP;
            FOREACH table_name IN ARRAY unused_tables LOOP
                EXECUTE format('DROP TABLE IF EXISTS %I.%I', current_schema(), table_name);
            END LOOP;
        END $$;
        """);

    protected override void Down(MigrationBuilder migrationBuilder)
        => throw new NotSupportedException("Removed legacy tables cannot be reconstructed from the current model.");
}
