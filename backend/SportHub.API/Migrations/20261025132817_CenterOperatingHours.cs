using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

#pragma warning disable CA1814 // Prefer jagged arrays over multidimensional

namespace SportHub.API.Migrations
{
    /// <inheritdoc />
    public partial class CenterOperatingHours : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.InsertData(
                table: "system_settings",
                columns: new[] { "key", "description", "updated_at", "updated_by_user_id", "value" },
                values: new object[,]
                {
                    { "center.closing_minutes", "Center closing time in minutes after midnight, Vietnam time.", new DateTime(2026, 10, 25, 0, 0, 0, 0, DateTimeKind.Utc), null, "1320" },
                    { "center.opening_minutes", "Center opening time in minutes after midnight, Vietnam time.", new DateTime(2026, 10, 25, 0, 0, 0, 0, DateTimeKind.Utc), null, "360" }
                });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DeleteData(
                table: "system_settings",
                keyColumn: "key",
                keyValue: "center.closing_minutes");

            migrationBuilder.DeleteData(
                table: "system_settings",
                keyColumn: "key",
                keyValue: "center.opening_minutes");
        }
    }
}
