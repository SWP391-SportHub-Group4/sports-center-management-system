using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using SportHub.API.Persistence;

#nullable disable

namespace SportHub.API.Migrations;

/// <summary>Đặt sân chỉ mở hôm nay + 3 ngày tiếp theo (4 ngày lịch).</summary>
[DbContext(typeof(SportHubDbContext))]
[Migration("20261023000000_RentalAdvanceThreeDays")]
public partial class RentalAdvanceThreeDays : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("UPDATE system_settings SET value = '3' WHERE key = 'rental.advance_days' AND value = '30';");
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("UPDATE system_settings SET value = '30' WHERE key = 'rental.advance_days' AND value = '3';");
    }
}
