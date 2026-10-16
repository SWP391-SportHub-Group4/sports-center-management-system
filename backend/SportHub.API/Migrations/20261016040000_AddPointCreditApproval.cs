using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using SportHub.API.Persistence;

#nullable disable

namespace SportHub.API.Migrations;

[DbContext(typeof(SportHubDbContext))]
[Migration("20261016040000_AddPointCreditApproval")]
public sealed class AddPointCreditApproval : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.CreateTable(
            name: "point_credit_requests",
            columns: table => new
            {
                request_id = table.Column<Guid>(type: "uuid", nullable: false),
                owner_user_id = table.Column<Guid>(type: "uuid", nullable: false),
                requested_by_user_id = table.Column<Guid>(type: "uuid", nullable: false),
                points = table.Column<int>(type: "integer", nullable: false),
                reason = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: false),
                status = table.Column<int>(type: "integer", nullable: false),
                requested_at_utc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                decided_by_user_id = table.Column<Guid>(type: "uuid", nullable: true),
                decided_at_utc = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                decision_reason = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                ledger_entry_id = table.Column<Guid>(type: "uuid", nullable: true)
            },
            constraints: table =>
            {
                table.PrimaryKey("pk_point_credit_requests", x => x.request_id);
                table.CheckConstraint("ck_point_credit_positive", "points > 0");
                table.CheckConstraint("ck_point_credit_status", "status IN (0, 1, 2)");
                table.CheckConstraint("ck_point_credit_separate_approver",
                    "decided_by_user_id IS NULL OR decided_by_user_id <> requested_by_user_id");
                table.CheckConstraint("ck_point_credit_resolution", """
                    (status = 0 AND decided_by_user_id IS NULL AND decided_at_utc IS NULL AND ledger_entry_id IS NULL AND decision_reason IS NULL) OR
                    (status = 1 AND decided_by_user_id IS NOT NULL AND decided_at_utc IS NOT NULL AND ledger_entry_id IS NOT NULL AND decision_reason IS NULL) OR
                    (status = 2 AND decided_by_user_id IS NOT NULL AND decided_at_utc IS NOT NULL AND ledger_entry_id IS NULL AND decision_reason IS NOT NULL)
                    """);
                table.ForeignKey("fk_point_credit_requests_user_accounts_owner_user_id", x => x.owner_user_id,
                    "user_accounts", "user_id", onDelete: ReferentialAction.Restrict);
                table.ForeignKey("fk_point_credit_requests_user_accounts_requested_by_user_id", x => x.requested_by_user_id,
                    "user_accounts", "user_id", onDelete: ReferentialAction.Restrict);
                table.ForeignKey("fk_point_credit_requests_user_accounts_decided_by_user_id", x => x.decided_by_user_id,
                    "user_accounts", "user_id", onDelete: ReferentialAction.Restrict);
                table.ForeignKey("fk_point_credit_requests_point_ledger_entries_ledger_entry_id", x => x.ledger_entry_id,
                    "point_ledger_entries", "ledger_entry_id", onDelete: ReferentialAction.Restrict);
            });
        migrationBuilder.CreateIndex("ix_point_credit_requests_status_requested_at_utc", "point_credit_requests",
            new[] { "status", "requested_at_utc" });
        migrationBuilder.CreateIndex("ix_point_credit_requests_owner_user_id_requested_at_utc", "point_credit_requests",
            new[] { "owner_user_id", "requested_at_utc" });
        migrationBuilder.CreateIndex("ix_point_credit_requests_requested_by_user_id", "point_credit_requests", "requested_by_user_id");
        migrationBuilder.CreateIndex("ix_point_credit_requests_decided_by_user_id", "point_credit_requests", "decided_by_user_id");
        migrationBuilder.CreateIndex("ix_point_credit_requests_ledger_entry_id", "point_credit_requests", "ledger_entry_id",
            unique: true, filter: "ledger_entry_id IS NOT NULL");
    }

    protected override void Down(MigrationBuilder migrationBuilder)
        => migrationBuilder.DropTable("point_credit_requests");
}
