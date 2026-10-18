using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace SportHub.API.Migrations
{
    /// <inheritdoc />
    public partial class AddManualNoticeHistory : Migration
    {
        // Never decrypt the email outbox or infer historical message content from an email subject.
        public const string LegacyBackfillSql = """
            WITH receipts AS (
                SELECT DISTINCT ON (a.target_id) a.target_id::uuid AS notice_id, a.user_id AS manager_id,
                    a.timestamp AS created_at_utc, a.new_value,
                    left(coalesce(nullif(p.full_name, ''), u.email), 320) AS sender_name
                FROM audit_logs a
                JOIN user_accounts u ON u.user_id = a.user_id
                LEFT JOIN user_profiles p ON p.user_id = u.user_id
                WHERE a.action = 'SEND_MANUAL_NOTICE' AND a.target_entity = 'Notification'
                    AND a.target_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                ORDER BY a.target_id, a.timestamp, a.audit_id
            )
            INSERT INTO manual_notice_records
                (notice_id, manager_id, sender_name, created_at_utc, subject, message, send_in_app,
                 send_email, recipient_count, recipients_json, is_legacy)
            SELECT r.notice_id, r.manager_id, r.sender_name, r.created_at_utc,
                left(coalesce(r.new_value->>'subject', 'Older notice'), 150), left(content.message, 3000),
                coalesce((r.new_value->>'SendInApp')::boolean, (r.new_value->>'sendInApp')::boolean, false),
                coalesce((r.new_value->>'SendEmail')::boolean, (r.new_value->>'sendEmail')::boolean, false),
                coalesce((r.new_value->>'recipientCount')::integer, people.recipient_count, 0),
                coalesce(people.recipients_json, '[]'::jsonb), true
            FROM receipts r
            LEFT JOIN LATERAL (
                SELECT n.message FROM notifications n WHERE n.source_event_type = 12
                    AND n.source_entity_id = r.notice_id AND n.channel = 0 AND n.message <> ''
                ORDER BY n.notification_id LIMIT 1
            ) content ON true
            LEFT JOIN LATERAL (
                SELECT count(*)::integer AS recipient_count,
                    jsonb_agg(jsonb_build_object('UserId', person.user_id, 'Name', person.name, 'Email', person.email)
                        ORDER BY person.name, person.user_id) AS recipients_json
                FROM (
                    SELECT n.user_id, coalesce(nullif(p.full_name, ''), u.email, 'Unknown recipient') AS name,
                        coalesce(max(n.recipient_address) FILTER (WHERE n.channel = 1), u.email, '') AS email
                    FROM notifications n
                    LEFT JOIN user_accounts u ON u.user_id = n.user_id
                    LEFT JOIN user_profiles p ON p.user_id = n.user_id
                    WHERE n.source_event_type = 12 AND n.source_entity_id = r.notice_id AND n.user_id IS NOT NULL
                    GROUP BY n.user_id, p.full_name, u.email
                ) person
            ) people ON true
            ON CONFLICT (notice_id) DO NOTHING;
            """;
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "manual_notice_records",
                columns: table => new
                {
                    notice_id = table.Column<Guid>(type: "uuid", nullable: false),
                    manager_id = table.Column<Guid>(type: "uuid", nullable: false),
                    sender_name = table.Column<string>(type: "character varying(320)", maxLength: 320, nullable: false),
                    created_at_utc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    subject = table.Column<string>(type: "character varying(150)", maxLength: 150, nullable: false),
                    message = table.Column<string>(type: "character varying(3000)", maxLength: 3000, nullable: true),
                    send_in_app = table.Column<bool>(type: "boolean", nullable: false),
                    send_email = table.Column<bool>(type: "boolean", nullable: false),
                    recipient_count = table.Column<int>(type: "integer", nullable: false),
                    recipients_json = table.Column<string>(type: "jsonb", nullable: false),
                    is_legacy = table.Column<bool>(type: "boolean", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_manual_notice_records", x => x.notice_id);
                    table.ForeignKey(
                        name: "fk_manual_notice_records_user_accounts_manager_id",
                        column: x => x.manager_id,
                        principalTable: "user_accounts",
                        principalColumn: "user_id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "ix_notifications_source_event_type_source_entity_id",
                table: "notifications",
                columns: new[] { "source_event_type", "source_entity_id" });

            migrationBuilder.CreateIndex(
                name: "ix_manual_notice_records_manager_id_created_at_utc_notice_id",
                table: "manual_notice_records",
                columns: new[] { "manager_id", "created_at_utc", "notice_id" });
            migrationBuilder.Sql(LegacyBackfillSql);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "manual_notice_records");

            migrationBuilder.DropIndex(
                name: "ix_notifications_source_event_type_source_entity_id",
                table: "notifications");
        }
    }
}
