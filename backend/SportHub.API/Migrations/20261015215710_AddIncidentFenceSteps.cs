using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace SportHub.API.Migrations
{
    /// <inheritdoc />
    public partial class AddIncidentFenceSteps : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "incident_fence_steps",
                columns: table => new
                {
                    step_id = table.Column<Guid>(type: "uuid", nullable: false),
                    fence_id = table.Column<Guid>(type: "uuid", nullable: false),
                    kind = table.Column<int>(type: "integer", nullable: false),
                    session_id = table.Column<Guid>(type: "uuid", nullable: false),
                    makeup_session_id = table.Column<Guid>(type: "uuid", nullable: true),
                    before_start_utc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    before_end_utc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    before_room_id = table.Column<int>(type: "integer", nullable: false),
                    before_coach_id = table.Column<Guid>(type: "uuid", nullable: false),
                    after_start_utc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    after_room_id = table.Column<int>(type: "integer", nullable: false),
                    after_coach_id = table.Column<Guid>(type: "uuid", nullable: false),
                    actor_user_id = table.Column<Guid>(type: "uuid", nullable: false),
                    created_at_utc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    state = table.Column<int>(type: "integer", nullable: false),
                    undone_at_utc = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    undo_note = table.Column<string>(type: "character varying(300)", maxLength: 300, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_incident_fence_steps", x => x.step_id);
                    table.ForeignKey(
                        name: "fk_incident_fence_steps_incident_fences_fence_id",
                        column: x => x.fence_id,
                        principalTable: "incident_fences",
                        principalColumn: "fence_id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "ix_incident_fence_steps_fence_id_created_at_utc",
                table: "incident_fence_steps",
                columns: new[] { "fence_id", "created_at_utc" });

            migrationBuilder.CreateIndex(
                name: "ix_incident_fence_steps_session_id",
                table: "incident_fence_steps",
                column: "session_id");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "incident_fence_steps");
        }
    }
}
