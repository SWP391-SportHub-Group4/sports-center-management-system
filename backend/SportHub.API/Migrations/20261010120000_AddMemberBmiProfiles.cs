using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace SportHub.API.Migrations;

public partial class AddMemberBmiProfiles : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.CreateTable(
            name: "member_bmi_profiles",
            columns: table => new
            {
                member_id = table.Column<Guid>(type: "uuid", nullable: false),
                requested_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                appointment_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                height_cm = table.Column<decimal>(type: "numeric(5,1)", precision: 5, scale: 1, nullable: true),
                weight_kg = table.Column<decimal>(type: "numeric(5,1)", precision: 5, scale: 1, nullable: true),
                measured_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                recorded_by_id = table.Column<Guid>(type: "uuid", nullable: true)
            },
            constraints: table =>
            {
                table.PrimaryKey("pk_member_bmi_profiles", x => x.member_id);
                table.ForeignKey("fk_member_bmi_profiles_user_accounts_member_id", x => x.member_id, "user_accounts", "user_id", onDelete: ReferentialAction.Restrict);
                table.ForeignKey("fk_member_bmi_profiles_user_accounts_recorded_by_id", x => x.recorded_by_id, "user_accounts", "user_id", onDelete: ReferentialAction.Restrict);
                table.CheckConstraint("ck_bmi_complete_measurement", "(measured_at IS NULL AND height_cm IS NULL AND weight_kg IS NULL AND recorded_by_id IS NULL) OR (measured_at IS NOT NULL AND height_cm IS NOT NULL AND weight_kg IS NOT NULL AND height_cm BETWEEN 50 AND 250 AND weight_kg BETWEEN 10 AND 400 AND recorded_by_id IS NOT NULL)");
            });
        migrationBuilder.CreateIndex("ix_member_bmi_profiles_recorded_by_id", "member_bmi_profiles", "recorded_by_id");
    }

    protected override void Down(MigrationBuilder migrationBuilder)
        => migrationBuilder.DropTable("member_bmi_profiles");
}
