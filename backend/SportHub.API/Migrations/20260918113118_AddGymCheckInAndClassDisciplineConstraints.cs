using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace SportHub.API.Migrations
{
    /// <inheritdoc />
    public partial class AddGymCheckInAndClassDisciplineConstraints : Migration
    {
        // CẢNH BÁO TRƯỚC KHI CHẠY TRÊN DB CÓ DỮ LIỆU: hai CHECK bên dưới sẽ làm migration
        // FAIL nếu bảng classes còn dòng không hợp lệ. Rà trước bằng:
        //
        //   SELECT discipline, count(*) FROM classes
        //   WHERE discipline NOT IN ('PersonalTraining', 'Yoga', 'GroupX')
        //   GROUP BY discipline;
        //
        //   SELECT class_id, capacity FROM classes
        //   WHERE discipline = 'PersonalTraining' AND capacity <> 1;
        //
        // Có dòng trả về => DỪNG. Việc chuyển đổi dữ liệu (vd 'Gym' -> ?) phải được chốt và
        // tách thành migration dữ liệu riêng, review trước khi bật constraint — migration này
        // cố ý KHÔNG tự đổi 'Gym' thành 'GroupX', không xóa lịch sử và không đụng Attendance cũ.
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "gym_checkins",
                columns: table => new
                {
                    check_in_id = table.Column<Guid>(type: "uuid", nullable: false),
                    member_id = table.Column<Guid>(type: "uuid", nullable: false),
                    checked_in_by_user_id = table.Column<Guid>(type: "uuid", nullable: false),
                    check_in_time = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_gym_checkins", x => x.check_in_id);
                    table.ForeignKey(
                        name: "fk_gym_checkins_user_accounts_checked_in_by_user_id",
                        column: x => x.checked_in_by_user_id,
                        principalTable: "user_accounts",
                        principalColumn: "user_id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_gym_checkins_user_accounts_member_id",
                        column: x => x.member_id,
                        principalTable: "user_accounts",
                        principalColumn: "user_id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.AddCheckConstraint(
                name: "CK_classes_discipline_allowed",
                table: "classes",
                sql: "discipline IN ('PersonalTraining', 'Yoga', 'GroupX')");

            migrationBuilder.AddCheckConstraint(
                name: "CK_classes_personal_training_capacity",
                table: "classes",
                sql: "discipline <> 'PersonalTraining' OR capacity = 1");

            migrationBuilder.CreateIndex(
                name: "ix_gym_checkins_checked_in_by_user_id",
                table: "gym_checkins",
                column: "checked_in_by_user_id");

            migrationBuilder.CreateIndex(
                name: "ix_gym_checkins_member_id_check_in_time",
                table: "gym_checkins",
                columns: new[] { "member_id", "check_in_time" },
                descending: new[] { false, true });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "gym_checkins");

            migrationBuilder.DropCheckConstraint(
                name: "CK_classes_discipline_allowed",
                table: "classes");

            migrationBuilder.DropCheckConstraint(
                name: "CK_classes_personal_training_capacity",
                table: "classes");
        }
    }
}
