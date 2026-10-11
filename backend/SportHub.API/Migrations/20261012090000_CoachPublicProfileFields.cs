using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using SportHub.API.Persistence;

#nullable disable

namespace SportHub.API.Migrations;

[DbContext(typeof(SportHubDbContext))]
[Migration("20261012090000_CoachPublicProfileFields")]
public class CoachPublicProfileFields : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.AddColumn<string>(name: "title", table: "coach_profiles", type: "character varying(100)", maxLength: 100, nullable: true);
        migrationBuilder.AddColumn<int>(name: "years_experience", table: "coach_profiles", type: "integer", nullable: true);
        migrationBuilder.AddColumn<int>(name: "student_count", table: "coach_profiles", type: "integer", nullable: true);
        migrationBuilder.AddColumn<string>(name: "philosophy", table: "coach_profiles", type: "character varying(1000)", maxLength: 1000, nullable: true);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropColumn(name: "title", table: "coach_profiles");
        migrationBuilder.DropColumn(name: "years_experience", table: "coach_profiles");
        migrationBuilder.DropColumn(name: "student_count", table: "coach_profiles");
        migrationBuilder.DropColumn(name: "philosophy", table: "coach_profiles");
    }
}
