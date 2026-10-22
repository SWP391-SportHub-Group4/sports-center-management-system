using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using SportHub.API.Persistence;

#nullable disable

namespace SportHub.API.Migrations;

/// <summary>
/// Removes the course-interest ("wait for the next course") feature. A cancelled below-threshold
/// course refunds points and suggests similar courses once, in the cancellation notice.
/// </summary>
[DbContext(typeof(SportHubDbContext))]
[Migration("20261022120000_RemoveCourseInterest")]
public sealed class RemoveCourseInterest : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        // Members who chose "wait for the next course" were already refunded in full: record it as a plain refund.
        migrationBuilder.Sql("ALTER TABLE class_threshold_responses DROP CONSTRAINT IF EXISTS ck_class_threshold_response_choice_target;");
        migrationBuilder.Sql("UPDATE class_threshold_responses SET choice = 0 WHERE choice = 3;");
        migrationBuilder.Sql("ALTER TABLE class_threshold_responses ADD CONSTRAINT ck_class_threshold_response_choice_target CHECK ((choice IS NULL AND target_class_id IS NULL) OR (choice IN (0, 2) AND target_class_id IS NULL) OR (choice = 1 AND target_class_id IS NOT NULL));");

        // NextCourseAvailable / CourseInterestOpened notifications (source_event_type 26) no longer exist.
        migrationBuilder.Sql("DELETE FROM notifications WHERE source_event_type = 26;");

        migrationBuilder.DropTable(name: "course_interest_deliveries");
        migrationBuilder.DropTable(name: "course_interests");

        migrationBuilder.DropForeignKey(name: "fk_classes_classes_continuation_of_class_id", table: "classes");
        migrationBuilder.DropIndex(name: "ix_classes_continuation_of_class_id", table: "classes");
        migrationBuilder.DropColumn(name: "continuation_of_class_id", table: "classes");
        migrationBuilder.DropColumn(name: "published_at_utc", table: "classes");
    }

    protected override void Down(MigrationBuilder migrationBuilder)
        => throw new NotSupportedException("Course interest was removed permanently.");
}
