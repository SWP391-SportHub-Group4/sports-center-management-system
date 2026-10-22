using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace SportHub.API.Migrations
{
    /// <inheritdoc />
    public partial class CourseInterestLifecycle : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<DateTime>(
                name: "published_at_utc",
                table: "classes",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.Sql("""
                UPDATE course_interests i SET active = FALSE, cancelled_at_utc = NOW()
                WHERE active AND EXISTS (SELECT 1 FROM enrollments e JOIN classes c ON c.class_id = e.class_id
                    WHERE e.member_id = i.member_id AND e.status = 0 AND e.ended_at IS NULL AND e.enrolled_at >= i.created_at_utc
                      AND c.sport_id = i.sport_id AND c.class_id <> i.source_class_id);
                WITH ranked AS (SELECT interest_id, ROW_NUMBER() OVER
                    (PARTITION BY member_id, sport_id ORDER BY created_at_utc DESC, interest_id) AS position
                    FROM course_interests WHERE active)
                UPDATE course_interests i SET active = FALSE, cancelled_at_utc = NOW()
                FROM ranked r WHERE r.interest_id = i.interest_id AND r.position > 1;
                """);

            migrationBuilder.CreateIndex(
                name: "ix_course_interests_member_id_sport_id",
                table: "course_interests",
                columns: new[] { "member_id", "sport_id" },
                unique: true,
                filter: "active = TRUE");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "ix_course_interests_member_id_sport_id",
                table: "course_interests");

            migrationBuilder.DropColumn(
                name: "published_at_utc",
                table: "classes");
        }
    }
}
