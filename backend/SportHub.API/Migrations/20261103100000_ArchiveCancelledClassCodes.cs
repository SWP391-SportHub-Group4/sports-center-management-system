using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using SportHub.API.Persistence;

namespace SportHub.API.Migrations;

[DbContext(typeof(SportHubDbContext))]
[Migration("20261103100000_ArchiveCancelledClassCodes")]
public sealed class ArchiveCancelledClassCodes : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        // Keep the unique code index and every class ID/reference. The trigger also
        // covers bulk status updates and explicitly seeded cancelled classes.
        migrationBuilder.Sql("""
            CREATE FUNCTION archive_cancelled_class_code() RETURNS trigger
            LANGUAGE plpgsql AS $function$
            DECLARE suffix text := '_Cancel_' || NEW.class_id::text;
            BEGIN
                IF NEW.status = 4 THEN
                    IF right(NEW.code, length(suffix)) <> suffix THEN
                        NEW.code := NEW.code || suffix;
                    END IF;
                    NEW.enrollment_open := false;
                ELSIF NEW.code ~* '_Cancel_[0-9]+$' THEN
                    RAISE EXCEPTION 'The _Cancel_<class ID> suffix is reserved for cancelled classes.'
                        USING ERRCODE = '23514', CONSTRAINT = 'ck_classes_cancel_code_reserved';
                END IF;
                RETURN NEW;
            END;
            $function$;
            CREATE TRIGGER archive_cancelled_class_code
                BEFORE INSERT OR UPDATE OF code, status ON classes
                FOR EACH ROW EXECUTE FUNCTION archive_cancelled_class_code();

            UPDATE classes
            SET code = code || '_Cancel_' || class_id::text,
                enrollment_open = false,
                version = version + 1
            WHERE status = 4
              AND right(code, length('_Cancel_' || class_id::text)) <> '_Cancel_' || class_id::text;
            """);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("""
            DROP TRIGGER archive_cancelled_class_code ON classes;
            DROP FUNCTION archive_cancelled_class_code();
            """);
        // Do not restore the old codes: a new class may already have reused one.
    }
}
