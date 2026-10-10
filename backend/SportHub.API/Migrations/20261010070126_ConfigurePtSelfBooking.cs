using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

#pragma warning disable CA1814 // Prefer jagged arrays over multidimensional

namespace SportHub.API.Migrations
{
    /// <inheritdoc />
    public partial class ConfigurePtSelfBooking : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.InsertData(
                table: "system_settings",
                columns: new[] { "key", "description", "updated_at", "updated_by_user_id", "value" },
                values: new object[,]
                {
                    { "pt.self_book_max_advance_days", "Số ngày tối đa Member được tự đặt buổi PT trước.", new DateTime(2026, 10, 10, 0, 0, 0, 0, DateTimeKind.Utc), null, "30" },
                    { "pt.self_book_min_lead_hours", "Số giờ tối thiểu Member phải đặt trước buổi PT.", new DateTime(2026, 10, 10, 0, 0, 0, 0, DateTimeKind.Utc), null, "12" }
                });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DeleteData(
                table: "system_settings",
                keyColumn: "key",
                keyValue: "pt.self_book_max_advance_days");

            migrationBuilder.DeleteData(
                table: "system_settings",
                keyColumn: "key",
                keyValue: "pt.self_book_min_lead_hours");
        }
    }
}
