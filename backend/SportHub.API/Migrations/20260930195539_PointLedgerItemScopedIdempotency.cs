using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace SportHub.API.Migrations
{
    /// <inheritdoc />
    public partial class PointLedgerItemScopedIdempotency : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "ix_point_ledger_entries_wallet_id_reference_type_reference_id_",
                table: "point_ledger_entries");

            migrationBuilder.CreateIndex(
                name: "ix_point_ledger_entries_wallet_id_reference_type_reference_id_",
                table: "point_ledger_entries",
                columns: new[] { "wallet_id", "reference_type", "reference_id", "entry_type" },
                unique: true,
                filter: "invoice_item_id IS NULL");

            migrationBuilder.CreateIndex(
                name: "ix_point_ledger_entries_wallet_id_reference_type_reference_id_1",
                table: "point_ledger_entries",
                columns: new[] { "wallet_id", "reference_type", "reference_id", "entry_type", "invoice_item_id" },
                unique: true,
                filter: "invoice_item_id IS NOT NULL");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "ix_point_ledger_entries_wallet_id_reference_type_reference_id_",
                table: "point_ledger_entries");

            migrationBuilder.DropIndex(
                name: "ix_point_ledger_entries_wallet_id_reference_type_reference_id_1",
                table: "point_ledger_entries");

            migrationBuilder.CreateIndex(
                name: "ix_point_ledger_entries_wallet_id_reference_type_reference_id_",
                table: "point_ledger_entries",
                columns: new[] { "wallet_id", "reference_type", "reference_id", "entry_type" },
                unique: true);
        }
    }
}
