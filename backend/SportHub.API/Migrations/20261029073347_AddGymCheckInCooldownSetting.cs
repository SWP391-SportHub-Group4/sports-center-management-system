using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace SportHub.API.Migrations
{
    /// <inheritdoc />
    public partial class AddGymCheckInCooldownSetting : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.InsertData(
                table: "system_settings",
                columns: new[] { "key", "description", "updated_at", "updated_by_user_id", "value" },
                values: new object[] { "gym.checkin_cooldown_seconds", "Minimum seconds between two Gym check-ins of the same member.", new DateTime(2026, 10, 29, 0, 0, 0, 0, DateTimeKind.Utc), null, "10" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DeleteData(
                table: "system_settings",
                keyColumn: "key",
                keyValue: "gym.checkin_cooldown_seconds");
        }
    }
}
