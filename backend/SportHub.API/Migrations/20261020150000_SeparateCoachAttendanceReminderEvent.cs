using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using SportHub.API.Persistence;

#nullable disable

namespace SportHub.API.Migrations;

[DbContext(typeof(SportHubDbContext))]
[Migration("20261020150000_SeparateCoachAttendanceReminderEvent")]
public sealed class SeparateCoachAttendanceReminderEvent : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
        // Both branches used 27. Keep the incoming AvatarReported value and move only
        // the system-generated attendance reminders written by the local Coach job.
        => migrationBuilder.Sql("""
            UPDATE notifications
            SET source_event_type = 28
            WHERE source_event_type = 27
              AND channel = 0
              AND message LIKE 'Attendance reminder for % (Vietnam time)%';
            """);

    protected override void Down(MigrationBuilder migrationBuilder)
        => migrationBuilder.Sql("""
            UPDATE notifications
            SET source_event_type = 27
            WHERE source_event_type = 28
              AND channel = 0
              AND message LIKE 'Attendance reminder for % (Vietnam time)%';
            """);
}
