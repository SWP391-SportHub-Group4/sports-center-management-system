using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace SportHub.API.Migrations;

public partial class MultiSportPointConfirmation : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.AddColumn<Guid>("checkout_cycle_id", "invoices", "uuid", nullable: true);
        migrationBuilder.AddColumn<int>("checkout_revision", "invoices", "integer", nullable: false, defaultValue: 0);
        migrationBuilder.AddColumn<DateTime>("hold_expires_at_utc", "invoices", "timestamp with time zone", nullable: true);
        migrationBuilder.AddColumn<int>("points_applied", "invoices", "integer", nullable: false, defaultValue: 0);
        migrationBuilder.AddColumn<decimal>("cash_amount", "invoices", "numeric(18,0)", nullable: false, defaultValue: 0m);
        migrationBuilder.Sql("UPDATE invoices SET cash_amount = total_amount");
        migrationBuilder.AddCheckConstraint("ck_invoice_point_split", "invoices",
            "points_applied >= 0 AND cash_amount >= 0 AND (checkout_cycle_id IS NULL OR cash_amount + points_applied::numeric * 1000 = total_amount)");

        migrationBuilder.CreateTable("point_confirmations", columns: table => new
        {
            point_confirmation_id = table.Column<Guid>("uuid", nullable: false),
            invoice_id = table.Column<Guid>("uuid", nullable: false),
            member_id = table.Column<Guid>("uuid", nullable: false),
            requested_by_user_id = table.Column<Guid>("uuid", nullable: false),
            checkout_cycle_id = table.Column<Guid>("uuid", nullable: false),
            checkout_revision = table.Column<int>("integer", nullable: false),
            points = table.Column<int>("integer", nullable: false),
            code_hash = table.Column<string>("character varying(64)", maxLength: 64, nullable: false),
            code_salt = table.Column<string>("character varying(32)", maxLength: 32, nullable: false),
            failed_attempts = table.Column<int>("integer", nullable: false),
            created_at_utc = table.Column<DateTime>("timestamp with time zone", nullable: false),
            expires_at_utc = table.Column<DateTime>("timestamp with time zone", nullable: false),
            consumed_at_utc = table.Column<DateTime>("timestamp with time zone", nullable: true),
            revoked_at_utc = table.Column<DateTime>("timestamp with time zone", nullable: true)
        }, constraints: table =>
        {
            table.PrimaryKey("pk_point_confirmations", x => x.point_confirmation_id);
            table.CheckConstraint("ck_point_confirmation_attempts", "failed_attempts >= 0 AND failed_attempts <= 5 AND points > 0");
            table.ForeignKey("fk_point_confirmations_invoices_invoice_id", x => x.invoice_id,
                "invoices", "invoice_id", onDelete: ReferentialAction.Restrict);
            table.ForeignKey("fk_point_confirmations_user_accounts_member_id", x => x.member_id,
                "user_accounts", "user_id", onDelete: ReferentialAction.Restrict);
            table.ForeignKey("fk_point_confirmations_user_accounts_requested_by_user_id", x => x.requested_by_user_id,
                "user_accounts", "user_id", onDelete: ReferentialAction.Restrict);
        });
        migrationBuilder.CreateIndex("ix_point_confirmations_invoice_id_created_at_utc", "point_confirmations",
            new[] { "invoice_id", "created_at_utc" });
        migrationBuilder.CreateIndex("ix_point_confirmations_member_id_created_at_utc", "point_confirmations",
            new[] { "member_id", "created_at_utc" });
        migrationBuilder.CreateIndex("ix_point_confirmations_requested_by_user_id", "point_confirmations",
            "requested_by_user_id");
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropTable("point_confirmations");
        migrationBuilder.DropCheckConstraint("ck_invoice_point_split", "invoices");
        migrationBuilder.DropColumn("checkout_cycle_id", "invoices");
        migrationBuilder.DropColumn("checkout_revision", "invoices");
        migrationBuilder.DropColumn("hold_expires_at_utc", "invoices");
        migrationBuilder.DropColumn("points_applied", "invoices");
        migrationBuilder.DropColumn("cash_amount", "invoices");
    }
}
