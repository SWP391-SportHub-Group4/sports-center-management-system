using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace SportHub.API.Migrations
{
    /// <inheritdoc />
    public partial class SelfReportedHealthProfileAndGymClosureExtension : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "member_body_measurements",
                columns: table => new
                {
                    measurement_id = table.Column<Guid>(type: "uuid", nullable: false),
                    member_id = table.Column<Guid>(type: "uuid", nullable: false),
                    height_cm = table.Column<decimal>(type: "numeric(5,1)", precision: 5, scale: 1, nullable: false),
                    weight_kg = table.Column<decimal>(type: "numeric(5,1)", precision: 5, scale: 1, nullable: false),
                    measured_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_member_body_measurements", x => x.measurement_id);
                    table.CheckConstraint("ck_member_body_measurement_range", "height_cm BETWEEN 100 AND 250 AND weight_kg BETWEEN 30 AND 300");
                    table.ForeignKey(
                        name: "fk_member_body_measurements_user_accounts_member_id",
                        column: x => x.member_id,
                        principalTable: "user_accounts",
                        principalColumn: "user_id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "ix_member_body_measurements_member_id_measured_at",
                table: "member_body_measurements",
                columns: new[] { "member_id", "measured_at" });

            // Giữ lại số đo đã ghi tại trung tâm: đưa vào lịch sử cơ thể và điền chiều cao/cân nặng cho hồ sơ đã có.
            migrationBuilder.Sql("""
                INSERT INTO member_body_measurements (measurement_id, member_id, height_cm, weight_kg, measured_at)
                SELECT gen_random_uuid(), member_id, height_cm, weight_kg, measured_at
                FROM member_bmi_profiles
                WHERE measured_at IS NOT NULL
                  AND height_cm BETWEEN 100 AND 250 AND weight_kg BETWEEN 30 AND 300;
                """);
            migrationBuilder.AddColumn<int>(
                name: "activity_level",
                table: "member_training_profiles",
                type: "integer",
                nullable: true);

            migrationBuilder.AddColumn<DateOnly>(
                name: "date_of_birth",
                table: "member_training_profiles",
                type: "date",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "dietary_preference",
                table: "member_training_profiles",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<string>(
                name: "food_allergies",
                table: "member_training_profiles",
                type: "character varying(500)",
                maxLength: 500,
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "goal_type",
                table: "member_training_profiles",
                type: "integer",
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "height_cm",
                table: "member_training_profiles",
                type: "numeric(5,1)",
                precision: 5,
                scale: 1,
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "session_minutes",
                table: "member_training_profiles",
                type: "integer",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "sex",
                table: "member_training_profiles",
                type: "integer",
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "target_weight_kg",
                table: "member_training_profiles",
                type: "numeric(5,1)",
                precision: 5,
                scale: 1,
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "training_days_per_week",
                table: "member_training_profiles",
                type: "integer",
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "weight_kg",
                table: "member_training_profiles",
                type: "numeric(5,1)",
                precision: 5,
                scale: 1,
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "extended_member_count",
                table: "incident_notices",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<int>(
                name: "membership_extension_days",
                table: "incident_notices",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.Sql("""
                UPDATE member_training_profiles p
                SET height_cm = b.height_cm, weight_kg = b.weight_kg
                FROM member_bmi_profiles b
                WHERE b.member_id = p.member_id AND b.measured_at IS NOT NULL
                  AND b.height_cm BETWEEN 100 AND 250 AND b.weight_kg BETWEEN 30 AND 300;
                """);

            migrationBuilder.DropTable(
                name: "member_bmi_profiles");

            migrationBuilder.AddCheckConstraint(
                name: "ck_incident_membership_extension",
                table: "incident_notices",
                sql: "membership_extension_days BETWEEN 0 AND 31 AND extended_member_count >= 0");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "member_body_measurements");

            migrationBuilder.DropCheckConstraint(
                name: "ck_incident_membership_extension",
                table: "incident_notices");

            migrationBuilder.DropColumn(
                name: "activity_level",
                table: "member_training_profiles");

            migrationBuilder.DropColumn(
                name: "date_of_birth",
                table: "member_training_profiles");

            migrationBuilder.DropColumn(
                name: "dietary_preference",
                table: "member_training_profiles");

            migrationBuilder.DropColumn(
                name: "food_allergies",
                table: "member_training_profiles");

            migrationBuilder.DropColumn(
                name: "goal_type",
                table: "member_training_profiles");

            migrationBuilder.DropColumn(
                name: "height_cm",
                table: "member_training_profiles");

            migrationBuilder.DropColumn(
                name: "session_minutes",
                table: "member_training_profiles");

            migrationBuilder.DropColumn(
                name: "sex",
                table: "member_training_profiles");

            migrationBuilder.DropColumn(
                name: "target_weight_kg",
                table: "member_training_profiles");

            migrationBuilder.DropColumn(
                name: "training_days_per_week",
                table: "member_training_profiles");

            migrationBuilder.DropColumn(
                name: "weight_kg",
                table: "member_training_profiles");

            migrationBuilder.DropColumn(
                name: "extended_member_count",
                table: "incident_notices");

            migrationBuilder.DropColumn(
                name: "membership_extension_days",
                table: "incident_notices");

            migrationBuilder.CreateTable(
                name: "member_bmi_profiles",
                columns: table => new
                {
                    member_id = table.Column<Guid>(type: "uuid", nullable: false),
                    appointment_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    height_cm = table.Column<decimal>(type: "numeric(5,1)", precision: 5, scale: 1, nullable: true),
                    measured_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    recorded_by_id = table.Column<Guid>(type: "uuid", nullable: true),
                    requested_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    weight_kg = table.Column<decimal>(type: "numeric(5,1)", precision: 5, scale: 1, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_member_bmi_profiles", x => x.member_id);
                    table.CheckConstraint("ck_bmi_complete_measurement", "(measured_at IS NULL AND height_cm IS NULL AND weight_kg IS NULL AND recorded_by_id IS NULL) OR (measured_at IS NOT NULL AND height_cm IS NOT NULL AND weight_kg IS NOT NULL AND height_cm BETWEEN 50 AND 250 AND weight_kg BETWEEN 10 AND 400 AND recorded_by_id IS NOT NULL)");
                    table.ForeignKey(
                        name: "fk_member_bmi_profiles_user_accounts_member_id",
                        column: x => x.member_id,
                        principalTable: "user_accounts",
                        principalColumn: "user_id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_member_bmi_profiles_user_accounts_recorded_by_id",
                        column: x => x.recorded_by_id,
                        principalTable: "user_accounts",
                        principalColumn: "user_id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "ix_member_bmi_profiles_recorded_by_id",
                table: "member_bmi_profiles",
                column: "recorded_by_id");
        }
    }
}
