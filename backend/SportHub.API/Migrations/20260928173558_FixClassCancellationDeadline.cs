using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace SportHub.API.Migrations
{
    /// <inheritdoc />
    public partial class FixClassCancellationDeadline : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DeleteData(
                table: "system_settings",
                keyColumn: "key",
                keyValue: "cancellation_deadline_hours");

            migrationBuilder.DropColumn(
                name: "cancellation_deadline_hours",
                table: "enrollments");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "cancellation_deadline_hours",
                table: "enrollments",
                type: "integer",
                nullable: false,
                defaultValue: 12);

            migrationBuilder.InsertData(
                table: "system_settings",
                columns: new[] { "key", "description", "updated_at", "updated_by_user_id", "value" },
                values: new object[] { "cancellation_deadline_hours", "BR-50 — Số giờ tối thiểu trước giờ bắt đầu buổi học mà hội viên phải hủy để được hoàn lượt tập. Giá trị được chụp lại tại thời điểm đăng ký; thay đổi ở đây không ảnh hưởng các đăng ký đã xác nhận.", new DateTime(2026, 9, 21, 0, 0, 0, 0, DateTimeKind.Utc), null, "12" });
        }
    }
}
