using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace SportHub.API.Migrations
{
    /// <inheritdoc />
    public partial class AddRoomBlockIncidentSteps : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AlterColumn<Guid>(
                name: "session_id",
                table: "incident_fence_steps",
                type: "uuid",
                nullable: true,
                oldClrType: typeof(Guid),
                oldType: "uuid");

            migrationBuilder.AddColumn<Guid>(
                name: "block_created_by_user_id",
                table: "incident_fence_steps",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "block_reason",
                table: "incident_fence_steps",
                type: "character varying(1000)",
                maxLength: 1000,
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "room_block_id",
                table: "incident_fence_steps",
                type: "uuid",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "block_created_by_user_id",
                table: "incident_fence_steps");

            migrationBuilder.DropColumn(
                name: "block_reason",
                table: "incident_fence_steps");

            migrationBuilder.DropColumn(
                name: "room_block_id",
                table: "incident_fence_steps");

            migrationBuilder.AlterColumn<Guid>(
                name: "session_id",
                table: "incident_fence_steps",
                type: "uuid",
                nullable: false,
                defaultValue: new Guid("00000000-0000-0000-0000-000000000000"),
                oldClrType: typeof(Guid),
                oldType: "uuid",
                oldNullable: true);
        }
    }
}
