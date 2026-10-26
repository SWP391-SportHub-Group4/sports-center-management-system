using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using SportHub.API.Persistence;

namespace SportHub.API.Migrations;

[DbContext(typeof(SportHubDbContext))]
[Migration("20261025150000_ClassSessionDuration")]
public sealed class ClassSessionDuration : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.AddColumn<int>(name: "session_minutes", table: "classes", type: "integer", nullable: true);
        migrationBuilder.AddCheckConstraint(name: "ck_classes_session_minutes", table: "classes",
            sql: "session_minutes IS NULL OR session_minutes BETWEEN 1 AND 720");
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropCheckConstraint(name: "ck_classes_session_minutes", table: "classes");
        migrationBuilder.DropColumn(name: "session_minutes", table: "classes");
    }
}
