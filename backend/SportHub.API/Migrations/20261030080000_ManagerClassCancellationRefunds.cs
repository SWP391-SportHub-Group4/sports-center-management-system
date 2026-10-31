using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using SportHub.API.Persistence;

namespace SportHub.API.Migrations;

[DbContext(typeof(SportHubDbContext))]
[Migration("20261030080000_ManagerClassCancellationRefunds")]
public sealed class ManagerClassCancellationRefunds : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.AddColumn<int>("center_cancellation_refund_points", "enrollments", "integer", nullable: true);
        migrationBuilder.AddColumn<decimal>("center_cancellation_paid_balance_vnd", "enrollments", "numeric(18,2)", nullable: true);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropColumn("center_cancellation_refund_points", "enrollments");
        migrationBuilder.DropColumn("center_cancellation_paid_balance_vnd", "enrollments");
    }
}
