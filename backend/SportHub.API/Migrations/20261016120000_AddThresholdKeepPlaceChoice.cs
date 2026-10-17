using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using SportHub.API.Persistence;

namespace SportHub.API.Migrations;

[DbContext(typeof(SportHubDbContext))]
[Migration("20261016120000_AddThresholdKeepPlaceChoice")]
public sealed class AddThresholdKeepPlaceChoice : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("ALTER TABLE class_threshold_responses DROP CONSTRAINT ck_class_threshold_response_choice_target;");
        migrationBuilder.Sql("ALTER TABLE class_threshold_responses ADD CONSTRAINT ck_class_threshold_response_choice_target CHECK ((choice IS NULL AND target_class_id IS NULL) OR (choice IN (0, 2, 3) AND target_class_id IS NULL) OR (choice = 1 AND target_class_id IS NOT NULL));");
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("ALTER TABLE class_threshold_responses DROP CONSTRAINT ck_class_threshold_response_choice_target;");
        migrationBuilder.Sql("ALTER TABLE class_threshold_responses ADD CONSTRAINT ck_class_threshold_response_choice_target CHECK ((choice IS NULL AND target_class_id IS NULL) OR (choice = 0 AND target_class_id IS NULL) OR (choice = 1 AND target_class_id IS NOT NULL));");
    }
}
