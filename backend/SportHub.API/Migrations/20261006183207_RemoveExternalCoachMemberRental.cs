using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace SportHub.API.Migrations
{
    /// <inheritdoc />
    public partial class RemoveExternalCoachMemberRental : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // BR-140: gỡ role ExternalCoach, người thuê sân là Member. Tài khoản ExternalCoach còn sót (nếu có) chuyển thành
            // Member để giữ UserId, mật khẩu, ví, hóa đơn và lượt thuê; chuyên môn khai báo và OTP đăng ký riêng của họ bị bỏ.
            // Phiên cũ bị vô hiệu bằng security_stamp. Lượt thuê không còn chiếm lịch Coach nên xóa các dòng occupancy Coach của rental.
            migrationBuilder.Sql(@"
DELETE FROM user_sport_specialties WHERE user_id IN (SELECT user_id FROM user_accounts WHERE role_id = 6);
UPDATE user_accounts SET role_id = 3, security_stamp = gen_random_uuid() WHERE role_id = 6;
DELETE FROM email_otps WHERE purpose = 2;
DELETE FROM coach_occupancies WHERE source_type = 2; -- OccupancySourceType.CourtRental");

            migrationBuilder.DropForeignKey(
                name: "fk_court_rentals_user_accounts_external_coach_id",
                table: "court_rentals");

            migrationBuilder.DropTable(
                name: "external_coach_profiles");

            migrationBuilder.DeleteData(
                table: "roles",
                keyColumn: "role_id",
                keyValue: 6);

            migrationBuilder.DropColumn(
                name: "expected_attendees",
                table: "court_rentals");

            migrationBuilder.RenameColumn(
                name: "external_coach_id",
                table: "court_rentals",
                newName: "member_id");

            migrationBuilder.RenameIndex(
                name: "ix_court_rentals_external_coach_id_status_start_at_utc",
                table: "court_rentals",
                newName: "ix_court_rentals_member_id_status_start_at_utc");

            migrationBuilder.AddForeignKey(
                name: "fk_court_rentals_user_accounts_member_id",
                table: "court_rentals",
                column: "member_id",
                principalTable: "user_accounts",
                principalColumn: "user_id",
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "fk_court_rentals_user_accounts_member_id",
                table: "court_rentals");

            migrationBuilder.RenameColumn(
                name: "member_id",
                table: "court_rentals",
                newName: "external_coach_id");

            migrationBuilder.RenameIndex(
                name: "ix_court_rentals_member_id_status_start_at_utc",
                table: "court_rentals",
                newName: "ix_court_rentals_external_coach_id_status_start_at_utc");

            migrationBuilder.AddColumn<int>(
                name: "expected_attendees",
                table: "court_rentals",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.CreateTable(
                name: "external_coach_profiles",
                columns: table => new
                {
                    user_id = table.Column<Guid>(type: "uuid", nullable: false),
                    approval_status = table.Column<int>(type: "integer", nullable: false),
                    bio = table.Column<string>(type: "text", nullable: true),
                    created_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    review_note = table.Column<string>(type: "text", nullable: true),
                    reviewed_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    reviewed_by_user_id = table.Column<Guid>(type: "uuid", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_external_coach_profiles", x => x.user_id);
                    table.ForeignKey(
                        name: "fk_external_coach_profiles_user_accounts_reviewed_by_user_id",
                        column: x => x.reviewed_by_user_id,
                        principalTable: "user_accounts",
                        principalColumn: "user_id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_external_coach_profiles_user_accounts_user_id",
                        column: x => x.user_id,
                        principalTable: "user_accounts",
                        principalColumn: "user_id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.InsertData(
                table: "roles",
                columns: new[] { "role_id", "role_name" },
                values: new object[] { 6, 5 });

            migrationBuilder.CreateIndex(
                name: "ix_external_coach_profiles_approval_status",
                table: "external_coach_profiles",
                column: "approval_status");

            migrationBuilder.CreateIndex(
                name: "ix_external_coach_profiles_reviewed_by_user_id",
                table: "external_coach_profiles",
                column: "reviewed_by_user_id");

            migrationBuilder.AddForeignKey(
                name: "fk_court_rentals_user_accounts_external_coach_id",
                table: "court_rentals",
                column: "external_coach_id",
                principalTable: "user_accounts",
                principalColumn: "user_id",
                onDelete: ReferentialAction.Restrict);
        }
    }
}
