using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace SportHub.API.Migrations
{
    /// <inheritdoc />
    public partial class RemoveSupportBankDetails : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "member_support_payout_details");

            migrationBuilder.DeleteData(
                table: "system_settings",
                keyColumn: "key",
                keyValue: "support.bank_data_retention_days");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "member_support_payout_details",
                columns: table => new
                {
                    request_id = table.Column<Guid>(type: "uuid", nullable: false),
                    account_holder = table.Column<string>(type: "character varying(160)", maxLength: 160, nullable: true),
                    account_last4 = table.Column<string>(type: "character varying(4)", maxLength: 4, nullable: true),
                    account_number_encrypted = table.Column<string>(type: "character varying(2048)", maxLength: 2048, nullable: true),
                    bank_name = table.Column<string>(type: "character varying(120)", maxLength: 120, nullable: true),
                    purged_at_utc = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_member_support_payout_details", x => x.request_id);
                    table.ForeignKey(
                        name: "fk_member_support_payout_details_member_support_requests_reque",
                        column: x => x.request_id,
                        principalTable: "member_support_requests",
                        principalColumn: "request_id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.InsertData(
                table: "system_settings",
                columns: new[] { "key", "description", "updated_at", "updated_by_user_id", "value" },
                values: new object[] { "support.bank_data_retention_days", "Days to retain bank details after a support request closes.", new DateTime(2026, 10, 24, 0, 0, 0, 0, DateTimeKind.Utc), null, "90" });
        }
    }
}
