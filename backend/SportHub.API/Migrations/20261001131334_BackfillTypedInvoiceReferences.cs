using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace SportHub.API.Migrations
{
    /// <inheritdoc />
    public partial class BackfillTypedInvoiceReferences : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Backfill only references that can be proven from existing typed owners/cycles.
            // Unmapped historical rows keep their legacy reference and remain readable.
            migrationBuilder.Sql("""
                UPDATE invoice_items i SET member_package_id = p.member_package_id
                FROM member_packages p WHERE i.item_type = 0 AND i.member_package_id IS NULL
                    AND (p.invoice_item_id = i.item_id OR p.member_package_id = i.related_entity_id);
                UPDATE invoice_items i SET pt_entitlement_id = p.entitlement_id,
                    pt_frequency_per_week = p.frequency_per_week
                FROM pt_entitlements p WHERE i.item_type = 1 AND i.pt_entitlement_id IS NULL
                    AND (p.activation_reference = i.item_id OR p.entitlement_id = i.related_entity_id);
                UPDATE invoice_items i SET court_rental_id = r.court_rental_id, sport_id = r.sport_id
                FROM court_rentals r WHERE i.item_type = 3 AND i.court_rental_id IS NULL
                    AND (r.invoice_item_id = i.item_id OR r.court_rental_id = i.related_entity_id);
                UPDATE invoice_items i SET class_id = c.class_id, sport_id = c.sport_id
                FROM checkout_sessions s JOIN classes c ON c.class_id = s.class_id
                WHERE i.invoice_id = s.invoice_id AND i.item_type IN (2, 4) AND i.class_id IS NULL;
                UPDATE invoice_items i SET class_id = c.class_id, sport_id = c.sport_id
                FROM seat_holds h JOIN classes c ON c.class_id = h.class_id
                WHERE i.related_entity_id = h.hold_id AND i.item_type = 2 AND i.class_id IS NULL;
                UPDATE invoice_items i SET sport_name_snapshot = s.name
                FROM sports s WHERE s.sport_id = i.sport_id AND i.sport_name_snapshot IS NULL;
                UPDATE payments p SET payment_attempt_id = a.payment_attempt_id
                FROM payment_attempts a WHERE p.method = 4 AND p.invoice_id = a.invoice_id AND p.payment_attempt_id IS NULL
                    AND p.reference_code = a.provider_transaction_id;
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            // Retain proven historical references; rollback must not erase financial lineage.
        }
    }
}
