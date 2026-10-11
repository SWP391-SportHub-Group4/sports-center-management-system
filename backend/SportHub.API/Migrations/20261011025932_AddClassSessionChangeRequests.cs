using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace SportHub.API.Migrations
{
    /// <inheritdoc />
    public partial class AddClassSessionChangeRequests : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "class_session_change_requests",
                columns: table => new
                {
                    request_id = table.Column<Guid>(type: "uuid", nullable: false),
                    session_id = table.Column<Guid>(type: "uuid", nullable: false),
                    requested_by_user_id = table.Column<Guid>(type: "uuid", nullable: false),
                    type = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    reason = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: false),
                    proposed_start_at_utc = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    proposed_end_at_utc = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    original_start_at_utc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    original_end_at_utc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    original_room_id = table.Column<int>(type: "integer", nullable: false),
                    status = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: false),
                    created_at_utc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    reviewed_at_utc = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    reviewed_by_user_id = table.Column<Guid>(type: "uuid", nullable: true),
                    review_note = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    resolution_type = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: true),
                    result_session_id = table.Column<Guid>(type: "uuid", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_class_session_change_requests", x => x.request_id);
                    table.CheckConstraint("ck_class_change_status", "status IN ('PENDING','RESOLVED','REJECTED','WITHDRAWN')");
                    table.CheckConstraint("ck_class_change_type", "type IN ('SUBSTITUTE','RESCHEDULE','CANCEL_WITH_MAKEUP')");
                    table.ForeignKey(
                        name: "fk_class_session_change_requests_class_sessions_result_session",
                        column: x => x.result_session_id,
                        principalTable: "class_sessions",
                        principalColumn: "session_id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_class_session_change_requests_class_sessions_session_id",
                        column: x => x.session_id,
                        principalTable: "class_sessions",
                        principalColumn: "session_id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_class_session_change_requests_user_accounts_requested_by_us",
                        column: x => x.requested_by_user_id,
                        principalTable: "user_accounts",
                        principalColumn: "user_id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_class_session_change_requests_user_accounts_reviewed_by_use",
                        column: x => x.reviewed_by_user_id,
                        principalTable: "user_accounts",
                        principalColumn: "user_id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "ix_class_session_change_requests_requested_by_user_id_created_",
                table: "class_session_change_requests",
                columns: new[] { "requested_by_user_id", "created_at_utc" });

            migrationBuilder.CreateIndex(
                name: "ix_class_session_change_requests_result_session_id",
                table: "class_session_change_requests",
                column: "result_session_id");

            migrationBuilder.CreateIndex(
                name: "ix_class_session_change_requests_reviewed_by_user_id",
                table: "class_session_change_requests",
                column: "reviewed_by_user_id");

            migrationBuilder.CreateIndex(
                name: "ix_class_session_change_requests_session_id",
                table: "class_session_change_requests",
                column: "session_id",
                unique: true,
                filter: "status = 'PENDING'");

            migrationBuilder.CreateIndex(
                name: "ix_class_session_change_requests_status_created_at_utc",
                table: "class_session_change_requests",
                columns: new[] { "status", "created_at_utc" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "class_session_change_requests");
        }
    }
}
