using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using SportHub.API.Persistence;

namespace SportHub.API.Migrations;

[DbContext(typeof(SportHubDbContext))]
[Migration("20261026170000_SupportRefundItems")]
public sealed class SupportRefundItems : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.AddColumn<Guid>("invoice_item_id", "member_support_requests", "uuid", nullable: true);
        migrationBuilder.AddColumn<Guid>("invoice_item_id", "member_support_payouts", "uuid", nullable: true);
        migrationBuilder.AddColumn<int>("points_refunded", "member_support_payouts", "integer", nullable: false, defaultValue: 0);
        // Infer a service only when the invoice has exactly one line. Preserve ambiguous historical records.
        migrationBuilder.Sql("""
            UPDATE member_support_requests r SET invoice_item_id = i.item_id
            FROM invoice_items i WHERE i.invoice_id = r.invoice_id
              AND (SELECT COUNT(*) FROM invoice_items x WHERE x.invoice_id = r.invoice_id) = 1;
            UPDATE member_support_payouts p SET invoice_item_id = r.invoice_item_id
            FROM member_support_requests r WHERE r.request_id = p.request_id;
            UPDATE member_support_payouts p SET points_refunded = COALESCE((
              SELECT SUM(l.points) FROM point_ledger_entries l
              WHERE l.reference_id = p.request_id AND l.reference_type = 'SystemEvent'
                AND l.note LIKE 'SupportRefund:%'), 0);
            """);
        migrationBuilder.DropIndex("ix_member_support_requests_invoice_id", "member_support_requests");
        migrationBuilder.CreateIndex("ix_member_support_requests_invoice_id", "member_support_requests", "invoice_id", unique: true,
            filter: "invoice_id IS NOT NULL AND invoice_item_id IS NULL AND status NOT IN ('CLOSED', 'DONE', 'REJECTED')");
        migrationBuilder.CreateIndex("ix_member_support_requests_invoice_item_id", "member_support_requests", "invoice_item_id", unique: true,
            filter: "invoice_item_id IS NOT NULL AND status NOT IN ('CLOSED', 'DONE', 'REJECTED')");
        migrationBuilder.CreateIndex("ix_member_support_payouts_invoice_item_id", "member_support_payouts", "invoice_item_id");
        foreach (var table in new[] { "member_support_requests", "member_support_payouts" })
            migrationBuilder.AddForeignKey($"fk_{table}_invoice_items_invoice_item_id", table, "invoice_item_id", "invoice_items", principalColumn: "item_id", onDelete: ReferentialAction.Restrict);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        // Multiple open service requests cannot safely be collapsed to the former invoice-wide unique index.
        migrationBuilder.Sql("""
            DO $$ BEGIN
              IF EXISTS (SELECT invoice_id FROM member_support_requests WHERE invoice_id IS NOT NULL
                AND status NOT IN ('CLOSED', 'DONE', 'REJECTED') GROUP BY invoice_id HAVING COUNT(*) > 1)
              THEN RAISE EXCEPTION 'Resolve multiple open service requests before reverting SupportRefundItems'; END IF;
            END $$;
            """);
        foreach (var table in new[] { "member_support_requests", "member_support_payouts" })
            migrationBuilder.DropForeignKey($"fk_{table}_invoice_items_invoice_item_id", table);
        migrationBuilder.DropIndex("ix_member_support_requests_invoice_id", "member_support_requests");
        migrationBuilder.DropIndex("ix_member_support_requests_invoice_item_id", "member_support_requests");
        migrationBuilder.DropIndex("ix_member_support_payouts_invoice_item_id", "member_support_payouts");
        migrationBuilder.DropColumn("invoice_item_id", "member_support_requests");
        migrationBuilder.DropColumn("invoice_item_id", "member_support_payouts");
        migrationBuilder.DropColumn("points_refunded", "member_support_payouts");
        migrationBuilder.CreateIndex("ix_member_support_requests_invoice_id", "member_support_requests", "invoice_id", unique: true,
            filter: "invoice_id IS NOT NULL AND status NOT IN ('CLOSED', 'DONE', 'REJECTED')");
    }
}
