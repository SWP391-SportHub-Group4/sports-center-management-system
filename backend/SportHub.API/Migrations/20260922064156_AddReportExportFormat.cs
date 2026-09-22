using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace SportHub.API.Migrations
{
    /// <inheritdoc />
    public partial class AddReportExportFormat : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "format",
                table: "report_exports",
                type: "character varying(16)",
                maxLength: 16,
                nullable: false,

                // Mọi bản ghi có trước migration này đều là CSV — đó là định dạng duy nhất từng
                // tồn tại. Để defaultValue rỗng (bản EF sinh ra) sẽ vi phạm CHECK ngay khi
                // nâng cấp một DB đã có báo cáo.
                defaultValue: "Csv");

            migrationBuilder.AddCheckConstraint(
                name: "CK_report_exports_format_allowed",
                table: "report_exports",
                sql: "format IN ('Csv', 'Pdf')");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropCheckConstraint(
                name: "CK_report_exports_format_allowed",
                table: "report_exports");

            migrationBuilder.DropColumn(
                name: "format",
                table: "report_exports");
        }
    }
}
