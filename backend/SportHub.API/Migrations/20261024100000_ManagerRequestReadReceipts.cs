using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using SportHub.API.Persistence;

namespace SportHub.API.Migrations;

[DbContext(typeof(SportHubDbContext))]
[Migration("20261024100000_ManagerRequestReadReceipts")]
public sealed class ManagerRequestReadReceipts : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.CreateTable(name: "manager_request_reads", columns: table => new {
            manager_id = table.Column<Guid>(type: "uuid", nullable: false),
            request_type = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: false),
            request_id = table.Column<Guid>(type: "uuid", nullable: false),
            read_at_utc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
        }, constraints: table => {
            table.PrimaryKey("pk_manager_request_reads", x => new { x.manager_id, x.request_type, x.request_id });
            table.ForeignKey("fk_manager_request_reads_user_accounts_manager_id", x => x.manager_id,
                "user_accounts", "user_id", onDelete: ReferentialAction.Cascade);
        });
    }
    protected override void Down(MigrationBuilder migrationBuilder) => migrationBuilder.DropTable("manager_request_reads");
}
