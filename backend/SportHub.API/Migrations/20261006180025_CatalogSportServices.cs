using System;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

#pragma warning disable CA1814 // Prefer jagged arrays over multidimensional

namespace SportHub.API.Migrations
{
    /// <inheritdoc />
    public partial class CatalogSportServices : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Thứ tự có chủ đích: tạo cấu trúc mới và seed trước, chuyển tham chiếu của môn PT cũ sang Gym, rồi mới xóa
            // môn PT và các cột operation_type. Không dùng được thứ tự do EF sinh vì xóa môn trước khi có chỗ nhận tham chiếu.
            migrationBuilder.DropCheckConstraint(
                name: "ck_sports_default_capacity",
                table: "sports");

            migrationBuilder.DropCheckConstraint(
                name: "ck_sports_default_minutes",
                table: "sports");

            migrationBuilder.DropCheckConstraint(
                name: "ck_sports_group_course_defaults",
                table: "sports");

            migrationBuilder.AddColumn<string>(
                name: "code",
                table: "sports",
                type: "citext",
                nullable: false,
                defaultValue: "");

            migrationBuilder.CreateTable(
                name: "sport_service_offerings",
                columns: table => new
                {
                    offering_id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    sport_id = table.Column<int>(type: "integer", nullable: false),
                    service_type = table.Column<int>(type: "integer", nullable: false),
                    is_enabled = table.Column<bool>(type: "boolean", nullable: false),
                    default_session_minutes = table.Column<int>(type: "integer", nullable: true),
                    default_max_capacity = table.Column<int>(type: "integer", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_sport_service_offerings", x => x.offering_id);
                    table.CheckConstraint("ck_sport_service_offerings_defaults", "(service_type = 1 AND default_session_minutes > 0 AND default_max_capacity > 0) OR (service_type <> 1 AND default_session_minutes IS NULL AND default_max_capacity IS NULL)");
                    table.CheckConstraint("ck_sport_service_offerings_type", "service_type BETWEEN 0 AND 3");
                    table.ForeignKey(
                        name: "fk_sport_service_offerings_sports_sport_id",
                        column: x => x.sport_id,
                        principalTable: "sports",
                        principalColumn: "sport_id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "coach_service_qualifications",
                columns: table => new
                {
                    user_id = table.Column<Guid>(type: "uuid", nullable: false),
                    offering_id = table.Column<int>(type: "integer", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_coach_service_qualifications", x => new { x.user_id, x.offering_id });
                    table.ForeignKey(
                        name: "fk_coach_service_qualifications_sport_service_offerings_offeri",
                        column: x => x.offering_id,
                        principalTable: "sport_service_offerings",
                        principalColumn: "offering_id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_coach_service_qualifications_user_accounts_user_id",
                        column: x => x.user_id,
                        principalTable: "user_accounts",
                        principalColumn: "user_id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "service_room_types",
                columns: table => new
                {
                    offering_id = table.Column<int>(type: "integer", nullable: false),
                    room_type_id = table.Column<int>(type: "integer", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_service_room_types", x => new { x.offering_id, x.room_type_id });
                    table.ForeignKey(
                        name: "fk_service_room_types_room_types_room_type_id",
                        column: x => x.room_type_id,
                        principalTable: "room_types",
                        principalColumn: "room_type_id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_service_room_types_sport_service_offerings_offering_id",
                        column: x => x.offering_id,
                        principalTable: "sport_service_offerings",
                        principalColumn: "offering_id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.InsertData(
                table: "sport_room_types",
                columns: new[] { "room_type_id", "sport_id" },
                values: new object[] { 2, 1 });

            migrationBuilder.InsertData(
                table: "sport_service_offerings",
                columns: new[] { "offering_id", "default_max_capacity", "default_session_minutes", "is_enabled", "service_type", "sport_id" },
                values: new object[,]
                {
                    { 1, null, null, true, 0, 1 },
                    { 2, null, null, true, 3, 1 },
                    { 3, 12, 90, true, 1, 3 },
                    { 4, null, null, true, 2, 3 },
                    { 5, 20, 120, true, 1, 4 },
                    { 6, null, null, true, 2, 4 }
                });

            migrationBuilder.UpdateData(
                table: "sports",
                keyColumn: "sport_id",
                keyValue: 1,
                column: "code",
                value: "gym");

            migrationBuilder.UpdateData(
                table: "sports",
                keyColumn: "sport_id",
                keyValue: 3,
                columns: new[] { "code", "sort_order" },
                values: new object[] { "badminton", 2 });

            migrationBuilder.UpdateData(
                table: "sports",
                keyColumn: "sport_id",
                keyValue: 4,
                columns: new[] { "code", "sort_order" },
                values: new object[] { "basketball", 3 });

            migrationBuilder.InsertData(
                table: "service_room_types",
                columns: new[] { "offering_id", "room_type_id" },
                values: new object[] { 2, 2 });

            // Seed dùng offering_id tường minh nên đưa sequence lên sau giá trị lớn nhất để offering Manager thêm sau không trùng khóa.
            migrationBuilder.Sql(
                "SELECT setval(pg_get_serial_sequence('sport_service_offerings', 'offering_id'), (SELECT MAX(offering_id) FROM sport_service_offerings));");

            // PT không còn là môn riêng (môn 2 cũ). Coach đang có chuyên môn PT giữ quyền PT qua qualification dịch vụ PT của Gym
            // (offering 2) và chuyên môn Gym; tham chiếu snapshot hóa đơn chuyển sang Gym. Bảng khác trỏ tới môn 2 (ví dụ lớp)
            // cố ý KHÔNG được chuyển để FK báo lỗi rõ ràng thay vì làm sai dữ liệu im lặng.
            migrationBuilder.Sql(@"
INSERT INTO coach_service_qualifications (user_id, offering_id)
SELECT user_id, 2 FROM user_sport_specialties WHERE sport_id = 2
ON CONFLICT DO NOTHING;
INSERT INTO user_sport_specialties (user_id, sport_id)
SELECT user_id, 1 FROM user_sport_specialties WHERE sport_id = 2
ON CONFLICT DO NOTHING;
DELETE FROM user_sport_specialties WHERE sport_id = 2;
UPDATE invoice_items SET sport_id = 1 WHERE sport_id = 2;
DELETE FROM court_rates WHERE sport_id = 2;");

            migrationBuilder.DeleteData(
                table: "sport_room_types",
                keyColumns: new[] { "room_type_id", "sport_id" },
                keyValues: new object[] { 2, 2 });

            migrationBuilder.DeleteData(
                table: "sports",
                keyColumn: "sport_id",
                keyValue: 2);

            migrationBuilder.DropColumn(
                name: "default_max_capacity",
                table: "sports");

            migrationBuilder.DropColumn(
                name: "default_session_minutes",
                table: "sports");

            migrationBuilder.DropColumn(
                name: "operation_type",
                table: "sports");

            migrationBuilder.CreateIndex(
                name: "ix_sports_code",
                table: "sports",
                column: "code",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_coach_service_qualifications_offering_id",
                table: "coach_service_qualifications",
                column: "offering_id");

            migrationBuilder.CreateIndex(
                name: "ix_service_room_types_room_type_id",
                table: "service_room_types",
                column: "room_type_id");

            migrationBuilder.CreateIndex(
                name: "ix_sport_service_offerings_sport_id_service_type",
                table: "sport_service_offerings",
                columns: new[] { "sport_id", "service_type" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "coach_service_qualifications");

            migrationBuilder.DropTable(
                name: "service_room_types");

            migrationBuilder.DropTable(
                name: "sport_service_offerings");

            migrationBuilder.DropIndex(
                name: "ix_sports_code",
                table: "sports");

            migrationBuilder.DeleteData(
                table: "sport_room_types",
                keyColumns: new[] { "room_type_id", "sport_id" },
                keyValues: new object[] { 2, 1 });

            migrationBuilder.DropColumn(
                name: "code",
                table: "sports");

            migrationBuilder.AddColumn<int>(
                name: "default_max_capacity",
                table: "sports",
                type: "integer",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "default_session_minutes",
                table: "sports",
                type: "integer",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "operation_type",
                table: "sports",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.UpdateData(
                table: "sports",
                keyColumn: "sport_id",
                keyValue: 1,
                columns: new[] { "default_max_capacity", "default_session_minutes", "operation_type" },
                values: new object[] { null, null, 0 });

            migrationBuilder.UpdateData(
                table: "sports",
                keyColumn: "sport_id",
                keyValue: 3,
                columns: new[] { "default_max_capacity", "default_session_minutes", "operation_type", "sort_order" },
                values: new object[] { 12, 90, 2, 3 });

            migrationBuilder.UpdateData(
                table: "sports",
                keyColumn: "sport_id",
                keyValue: 4,
                columns: new[] { "default_max_capacity", "default_session_minutes", "operation_type", "sort_order" },
                values: new object[] { 20, 120, 2, 4 });

            migrationBuilder.InsertData(
                table: "sports",
                columns: new[] { "sport_id", "default_max_capacity", "default_session_minutes", "description", "image_url", "is_active", "name", "operation_type", "sort_order" },
                values: new object[] { 2, null, null, null, null, true, "Personal Training", 1, 2 });

            migrationBuilder.InsertData(
                table: "sport_room_types",
                columns: new[] { "room_type_id", "sport_id" },
                values: new object[] { 2, 2 });

            migrationBuilder.AddCheckConstraint(
                name: "ck_sports_default_capacity",
                table: "sports",
                sql: "default_max_capacity IS NULL OR default_max_capacity > 0");

            migrationBuilder.AddCheckConstraint(
                name: "ck_sports_default_minutes",
                table: "sports",
                sql: "default_session_minutes IS NULL OR default_session_minutes > 0");

            migrationBuilder.AddCheckConstraint(
                name: "ck_sports_group_course_defaults",
                table: "sports",
                sql: "operation_type <> 2 OR (default_session_minutes IS NOT NULL AND default_max_capacity IS NOT NULL)");
        }
    }
}
