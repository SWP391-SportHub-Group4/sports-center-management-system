using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace SportHub.API.Migrations;

public partial class MultiSportCheckout : Migration
{
    protected override void Up(MigrationBuilder m)
    {
        m.Sql("""
            INSERT INTO system_settings (key, value, description, updated_at)
            VALUES ('pt.price_per_session_vnd', '200000',
                    'Đơn giá demo PT mỗi buổi; Center Manager cần xác nhận giá kinh doanh.',
                    '2026-09-30T00:00:00Z')
            ON CONFLICT (key) DO NOTHING
            """);
        m.AddColumn<string>("paid_via", "invoices", "text", nullable: true);
        m.AddColumn<DateTime>("paid_at_utc", "invoices", "timestamp with time zone", nullable: true);
        m.AddColumn<bool>("reconciliation_required", "invoices", "boolean", nullable: false, defaultValue: false);
        m.CreateTable("checkout_sessions", columns: t => new
        {
            checkout_session_id = t.Column<Guid>("uuid", nullable: false),
            invoice_id = t.Column<Guid>("uuid", nullable: false),
            revision = t.Column<int>("integer", nullable: false),
            idempotency_key = t.Column<string>("character varying(120)", maxLength: 120, nullable: false),
            kind = t.Column<string>("character varying(30)", maxLength: 30, nullable: false),
            state = t.Column<string>("character varying(30)", maxLength: 30, nullable: false),
            created_at_utc = t.Column<DateTime>("timestamp with time zone", nullable: false),
            expires_at_utc = t.Column<DateTime>("timestamp with time zone", nullable: false),
            resource_hold_id = t.Column<Guid>("uuid", nullable: true),
            class_id = t.Column<int>("integer", nullable: true),
            pt_member_package_id = t.Column<Guid>("uuid", nullable: true),
            pt_coach_id = t.Column<Guid>("uuid", nullable: true),
            pt_frequency = t.Column<int>("integer", nullable: true)
        }, constraints: t =>
        {
            t.PrimaryKey("pk_checkout_sessions", x => x.checkout_session_id);
            t.ForeignKey("fk_checkout_sessions_invoices_invoice_id", x => x.invoice_id,
                "invoices", "invoice_id", onDelete: ReferentialAction.Restrict);
        });
        m.CreateIndex("ix_checkout_sessions_invoice_id_revision", "checkout_sessions",
            new[] { "invoice_id", "revision" }, unique: true);
        m.CreateIndex("ix_checkout_sessions_invoice_id_state", "checkout_sessions",
            new[] { "invoice_id", "state" });
        m.CreateIndex("ix_checkout_sessions_invoice_id_idempotency_key", "checkout_sessions",
            new[] { "invoice_id", "idempotency_key" }, unique: true);
        m.Sql("""
            INSERT INTO checkout_sessions
              (checkout_session_id, invoice_id, revision, idempotency_key, kind, state,
               created_at_utc, expires_at_utc)
            SELECT checkout_cycle_id, invoice_id, checkout_revision,
                   'legacy-' || invoice_id::text || '-' || checkout_revision::text, 'Membership',
                   CASE WHEN status = 0 AND hold_expires_at_utc > now() THEN 'Active'
                        WHEN status = 2 THEN 'Paid' ELSE 'Expired' END,
                   issued_at, COALESCE(hold_expires_at_utc, issued_at)
            FROM invoices WHERE checkout_cycle_id IS NOT NULL
            """);
        m.AddColumn<Guid>("checkout_session_id", "payment_attempts", "uuid", nullable: true);
        m.AddColumn<decimal>("cash_snapshot", "payment_attempts", "numeric(18,0)", nullable: false, defaultValue: 0m);
        m.AddColumn<int>("points_snapshot", "payment_attempts", "integer", nullable: false, defaultValue: 0);
        m.AddColumn<string>("provider_transaction_id", "payment_attempts", "character varying(100)",
            maxLength: 100, nullable: true);
        m.AddColumn<string>("verified_result", "payment_attempts", "character varying(40)",
            maxLength: 40, nullable: true);
        m.AddColumn<DateTime>("verified_at_utc", "payment_attempts", "timestamp with time zone", nullable: true);
        m.CreateIndex("ix_payment_attempts_checkout_session_id", "payment_attempts", "checkout_session_id");
        m.CreateIndex("ux_payment_attempts_open_checkout", "payment_attempts", "invoice_id",
            unique: true, filter: "status = 0 AND checkout_session_id IS NOT NULL");
        m.AddForeignKey("fk_payment_attempts_checkout_sessions_checkout_session_id", "payment_attempts",
            "checkout_session_id", "checkout_sessions", principalColumn: "checkout_session_id",
            onDelete: ReferentialAction.Restrict);
        m.CreateTable("verified_gateway_events", columns: t => new
        {
            verified_gateway_event_id = t.Column<Guid>("uuid", nullable: false),
            payment_attempt_id = t.Column<Guid>("uuid", nullable: false),
            provider = t.Column<string>("character varying(30)", maxLength: 30, nullable: false),
            provider_transaction_id = t.Column<string>("character varying(100)", maxLength: 100, nullable: false),
            transaction_reference = t.Column<string>("character varying(100)", maxLength: 100, nullable: false),
            amount = t.Column<decimal>("numeric(18,0)", nullable: false),
            response_code = t.Column<string>("character varying(10)", maxLength: 10, nullable: false),
            transaction_status = t.Column<string>("character varying(10)", maxLength: 10, nullable: false),
            provider_paid_at_utc = t.Column<DateTime>("timestamp with time zone", nullable: false),
            verified_at_utc = t.Column<DateTime>("timestamp with time zone", nullable: false),
            processing_status = t.Column<string>("character varying(40)", maxLength: 40, nullable: false),
            retry_count = t.Column<int>("integer", nullable: false),
            last_error = t.Column<string>("character varying(1000)", maxLength: 1000, nullable: true),
            processed_at_utc = t.Column<DateTime>("timestamp with time zone", nullable: true)
        }, constraints: t =>
        {
            t.PrimaryKey("pk_verified_gateway_events", x => x.verified_gateway_event_id);
            t.ForeignKey("fk_verified_gateway_events_payment_attempts_payment_attempt_id",
                x => x.payment_attempt_id, "payment_attempts", "payment_attempt_id",
                onDelete: ReferentialAction.Restrict);
        });
        m.CreateIndex("ix_verified_gateway_events_payment_attempt_id", "verified_gateway_events",
            "payment_attempt_id");
        m.CreateIndex("ix_verified_gateway_events_provider_provider_transaction_id", "verified_gateway_events",
            new[] { "provider", "provider_transaction_id" }, unique: true);
        m.CreateIndex("ix_verified_gateway_events_processing_status_verified_at_utc", "verified_gateway_events",
            new[] { "processing_status", "verified_at_utc" });
    }

    protected override void Down(MigrationBuilder m)
    {
        m.Sql("DELETE FROM system_settings WHERE key = 'pt.price_per_session_vnd'");
        m.DropTable("verified_gateway_events");
        m.DropIndex("ux_payment_attempts_open_checkout", "payment_attempts");
        m.DropForeignKey("fk_payment_attempts_checkout_sessions_checkout_session_id", "payment_attempts");
        m.DropIndex("ix_payment_attempts_checkout_session_id", "payment_attempts");
        m.DropColumn("checkout_session_id", "payment_attempts");
        m.DropColumn("cash_snapshot", "payment_attempts");
        m.DropColumn("points_snapshot", "payment_attempts");
        m.DropColumn("provider_transaction_id", "payment_attempts");
        m.DropColumn("verified_result", "payment_attempts");
        m.DropColumn("verified_at_utc", "payment_attempts");
        m.DropTable("checkout_sessions");
        m.DropColumn("paid_via", "invoices");
        m.DropColumn("paid_at_utc", "invoices");
        m.DropColumn("reconciliation_required", "invoices");
    }
}
