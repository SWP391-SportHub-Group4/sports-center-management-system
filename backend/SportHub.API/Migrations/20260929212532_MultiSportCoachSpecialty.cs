using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace SportHub.API.Migrations
{
    /// <inheritdoc />
    public partial class MultiSportCoachSpecialty : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Giữ dữ liệu demo: chuyển CoachCategory cũ thành chuyên môn theo môn TRƯỚC khi bỏ cột.
            // Mapping tạm (category không đủ xác định môn): PersonalTrainer(0) -> Personal Training (sport 2);
            // ClassInstructor(1) -> Cầu lông (3) và Bóng rổ (4). Manager chỉnh lại qua API sau khi lên phiên bản này.
            // Chỉ áp cho tài khoản đang có role Coach (role_id = 2).
            migrationBuilder.Sql(
                """
                INSERT INTO user_sport_specialties (user_id, sport_id)
                SELECT cp.user_id, s.sport_id
                FROM coach_profiles cp
                JOIN user_accounts u ON u.user_id = cp.user_id AND u.role_id = 2
                JOIN LATERAL (
                    SELECT unnest(CASE cp.coach_category WHEN 0 THEN ARRAY[2] ELSE ARRAY[3, 4] END) AS sport_id
                ) s ON TRUE
                ON CONFLICT DO NOTHING;
                """);

            migrationBuilder.DropColumn(
                name: "coach_category",
                table: "coach_profiles");

            migrationBuilder.AddColumn<string>(
                name: "bio",
                table: "coach_profiles",
                type: "text",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "bio",
                table: "coach_profiles");

            migrationBuilder.AddColumn<int>(
                name: "coach_category",
                table: "coach_profiles",
                type: "integer",
                nullable: false,
                defaultValue: 0);
        }
    }
}
