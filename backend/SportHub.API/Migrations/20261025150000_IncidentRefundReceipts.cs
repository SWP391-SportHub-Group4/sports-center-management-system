using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using SportHub.API.Persistence;

namespace SportHub.API.Migrations;

[DbContext(typeof(SportHubDbContext))]
[Migration("20261025150000_IncidentRefundReceipts")]
public sealed class IncidentRefundReceipts : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.AddColumn<string>("refunds_json", "incident_notices", type: "jsonb", nullable: false, defaultValue: "[]");
        migrationBuilder.AddColumn<string>("request_fingerprint", "incident_notices", type: "character varying(64)", maxLength: 64, nullable: true);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropColumn("refunds_json", "incident_notices");
        migrationBuilder.DropColumn("request_fingerprint", "incident_notices");
    }
}
