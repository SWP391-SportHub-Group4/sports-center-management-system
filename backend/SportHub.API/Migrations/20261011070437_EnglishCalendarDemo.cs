using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace SportHub.API.Migrations
{
    /// <inheritdoc />
    public partial class EnglishCalendarDemo : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("""
                UPDATE rooms SET name = 'Demo Calendar · Badminton'
                  WHERE room_type_id = 3 AND name = 'Demo Calendar · Cầu lông';
                UPDATE rooms SET name = 'Demo Calendar · Basketball'
                  WHERE room_type_id = 4 AND name = 'Demo Calendar · Bóng rổ';
                UPDATE classes SET name = 'Badminton · Calendar demo course'
                  WHERE code LIKE 'DEMO-CALENDAR-%-3' AND name = 'Cầu lông · Lớp demo Calendar';
                UPDATE classes SET name = 'Basketball · Calendar demo course'
                  WHERE code LIKE 'DEMO-CALENDAR-%-4' AND name = 'Bóng rổ · Lớp demo Calendar';
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            // Do not overwrite catalog names that managers may have edited after upgrade.
        }
    }
}
