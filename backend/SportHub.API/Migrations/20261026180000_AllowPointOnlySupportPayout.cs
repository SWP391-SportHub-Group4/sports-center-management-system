using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using SportHub.API.Persistence;

namespace SportHub.API.Migrations;

[DbContext(typeof(SportHubDbContext))]
[Migration("20261026180000_AllowPointOnlySupportPayout")]
public sealed class AllowPointOnlySupportPayout : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropCheckConstraint("ck_member_support_payout_amount_positive", "member_support_payouts");
        migrationBuilder.AddCheckConstraint("ck_member_support_payout_amount_positive", "member_support_payouts",
            "amount >= 0 AND points_refunded >= 0 AND (amount > 0 OR points_refunded > 0)");
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("""
            DO $$ BEGIN
              IF EXISTS (SELECT 1 FROM member_support_payouts WHERE amount = 0)
              THEN RAISE EXCEPTION 'Resolve point-only payouts before reverting AllowPointOnlySupportPayout'; END IF;
            END $$;
            """);
        migrationBuilder.DropCheckConstraint("ck_member_support_payout_amount_positive", "member_support_payouts");
        migrationBuilder.AddCheckConstraint("ck_member_support_payout_amount_positive", "member_support_payouts", "amount > 0");
    }
}
