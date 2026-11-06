-- One-time production cleanup. Run with the DB owner after a backup.
-- The application deliberately does not read these tables, but upgrade tests
-- preserve historical rows in them. Keep this outside the EF migration chain.
BEGIN;

DO $cleanup$
DECLARE
    table_name text;
    row_count bigint;
BEGIN
    FOREACH table_name IN ARRAY ARRAY[
        'legacy_attendances', 'legacy_class_recurrences', 'legacy_class_sessions',
        'legacy_classes', 'legacy_enrollments', 'legacy_relationship_class_links'
    ] LOOP
        IF to_regclass(format('%I.%I', current_schema(), table_name)) IS NULL THEN
            RAISE EXCEPTION 'Expected legacy table % is missing', table_name;
        END IF;
        EXECUTE format('SELECT count(*) FROM %I', table_name) INTO row_count;
        IF row_count <> 0 THEN
            RAISE EXCEPTION 'Legacy table % contains % rows; cleanup aborted', table_name, row_count;
        END IF;
    END LOOP;
END
$cleanup$;

DROP TABLE legacy_attendances, legacy_class_recurrences, legacy_class_sessions,
    legacy_classes, legacy_enrollments, legacy_relationship_class_links RESTRICT;

COMMIT;
