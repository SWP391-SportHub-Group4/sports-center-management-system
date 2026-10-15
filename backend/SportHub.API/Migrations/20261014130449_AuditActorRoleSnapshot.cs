using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace SportHub.API.Migrations
{
    /// <inheritdoc />
    public partial class AuditActorRoleSnapshot : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "actor_role",
                table: "audit_logs",
                type: "character varying(32)",
                maxLength: 32,
                nullable: false,
                defaultValue: "");

            // Reconstruct legacy roles using the next recorded role change's old
            // role, or the preceding change's new role. Current role is used only
            // when no role-change evidence exists. Original event payloads stay intact.
            migrationBuilder.Sql("""
                WITH historical AS (
                    SELECT a.audit_id,
                        COALESCE(
                            (SELECT c.old_value->>'role' FROM audit_logs c
                             WHERE c.action = 'CHANGE_USER_ROLE' AND c.target_entity = 'UserAccount'
                               AND c.target_id = a.user_id::text AND c.timestamp >= a.timestamp
                             ORDER BY c.timestamp, c.audit_id LIMIT 1),
                            (SELECT COALESCE(c.new_value->>'role', c.new_value#>>'{value,role}') FROM audit_logs c
                             WHERE c.action = 'CHANGE_USER_ROLE' AND c.target_entity = 'UserAccount'
                               AND c.target_id = a.user_id::text AND c.timestamp < a.timestamp
                             ORDER BY c.timestamp DESC, c.audit_id DESC LIMIT 1),
                            CASE r.role_name WHEN 0 THEN 'CENTER_MANAGER' WHEN 1 THEN 'COACH'
                                WHEN 2 THEN 'MEMBER' WHEN 3 THEN 'RECEPTIONIST'
                                WHEN 4 THEN 'SYSTEM_ADMINISTRATOR' END
                        ) AS role,
                        a.action, a.ip_address, a.new_value
                    FROM audit_logs a LEFT JOIN user_accounts u ON u.user_id = a.user_id
                        LEFT JOIN roles r ON r.role_id = u.role_id
                )
                UPDATE audit_logs a SET actor_role = CASE
                    WHEN h.action = 'EXPIRE_UNACTIVATED_STAFF_ACCOUNT'
                        OR h.new_value->>'executedBy' IS NOT NULL
                        OR h.ip_address = ''
                        OR h.action IN ('FULFILL_CHECKOUT', 'MANUAL_GATEWAY_COMPENSATION_REQUIRED', 'COMPENSATE_GATEWAY_PAYMENT')
                        THEN 'SYSTEM'
                    WHEN upper(replace(h.role, '_', '')) = 'CENTERMANAGER' THEN 'CENTER_MANAGER'
                    WHEN upper(replace(h.role, '_', '')) = 'SYSTEMADMINISTRATOR' THEN 'SYSTEM_ADMINISTRATOR'
                    WHEN upper(h.role) IN ('COACH', 'MEMBER', 'RECEPTIONIST') THEN upper(h.role)
                    ELSE 'UNKNOWN' END
                FROM historical h WHERE h.audit_id = a.audit_id;
                """);

            migrationBuilder.CreateIndex(
                name: "ix_audit_logs_actor_role_timestamp",
                table: "audit_logs",
                columns: new[] { "actor_role", "timestamp" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "ix_audit_logs_actor_role_timestamp",
                table: "audit_logs");

            migrationBuilder.DropColumn(
                name: "actor_role",
                table: "audit_logs");
        }
    }
}
