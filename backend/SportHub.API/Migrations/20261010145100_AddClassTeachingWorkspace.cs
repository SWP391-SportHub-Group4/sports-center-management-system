using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace SportHub.API.Migrations
{
    /// <inheritdoc />
    public partial class AddClassTeachingWorkspace : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "class_teaching_records",
                columns: table => new
                {
                    record_id = table.Column<Guid>(type: "uuid", nullable: false),
                    class_id = table.Column<int>(type: "integer", nullable: false),
                    session_id = table.Column<Guid>(type: "uuid", nullable: true),
                    member_id = table.Column<Guid>(type: "uuid", nullable: true),
                    coach_id = table.Column<Guid>(type: "uuid", nullable: false),
                    kind = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: false),
                    title = table.Column<string>(type: "character varying(160)", maxLength: 160, nullable: false),
                    content = table.Column<string>(type: "character varying(8000)", maxLength: 8000, nullable: false),
                    score = table.Column<int>(type: "integer", nullable: true),
                    due_at_utc = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    created_at_utc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    updated_at_utc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    version = table.Column<int>(type: "integer", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_class_teaching_records", x => x.record_id);
                    table.CheckConstraint("ck_teaching_kind", "kind IN ('PLAN','RESULT','NOTICE','HOMEWORK')");
                    table.CheckConstraint("ck_teaching_result_scope", "kind <> 'RESULT' OR (session_id IS NOT NULL AND member_id IS NOT NULL)");
                    table.CheckConstraint("ck_teaching_score", "score IS NULL OR score BETWEEN 1 AND 5");
                    table.ForeignKey(
                        name: "fk_class_teaching_records_class_sessions_session_id",
                        column: x => x.session_id,
                        principalTable: "class_sessions",
                        principalColumn: "session_id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_class_teaching_records_classes_class_id",
                        column: x => x.class_id,
                        principalTable: "classes",
                        principalColumn: "class_id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_class_teaching_records_user_accounts_coach_id",
                        column: x => x.coach_id,
                        principalTable: "user_accounts",
                        principalColumn: "user_id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_class_teaching_records_user_accounts_member_id",
                        column: x => x.member_id,
                        principalTable: "user_accounts",
                        principalColumn: "user_id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "ix_class_teaching_records_class_id_created_at_utc",
                table: "class_teaching_records",
                columns: new[] { "class_id", "created_at_utc" });

            migrationBuilder.CreateIndex(
                name: "ix_class_teaching_records_coach_id",
                table: "class_teaching_records",
                column: "coach_id");

            migrationBuilder.CreateIndex(
                name: "ix_class_teaching_records_member_id",
                table: "class_teaching_records",
                column: "member_id");

            migrationBuilder.CreateIndex(
                name: "ix_class_teaching_records_session_id_member_id",
                table: "class_teaching_records",
                columns: new[] { "session_id", "member_id" },
                unique: true,
                filter: "kind = 'RESULT'");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "class_teaching_records");
        }
    }
}
