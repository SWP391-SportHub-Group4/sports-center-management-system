# Member navigation

The member portal has five primary destinations:

| Destination | Tasks |
| --- | --- |
| Overview | Today's agenda, upcoming activity, urgent actions and Gym/PT entitlement summaries |
| Services | Classes, Gym, PT packages and courts; registration and existing purchases/bookings share each category |
| My schedule | Class, PT and court events in one calendar |
| Training | PT sessions and booking, workout plans, results/progress and training profile |
| Finance | Wallet, invoices, invoice details and refund history |

Courts opens the sport/date/time booking calendar directly, without a My rentals
subsection. After successful court payment, the next action opens My schedule.
Existing links to a specific rental still open its details and cancellation actions
inside Services; the detail view links back to My schedule.

Course discovery opens a dedicated detail page at `/member/services/courses/[id]`,
with a compact class overview, an animated vector sports sticker and the shared Member calendar.
Payment opens the existing checkout in a centered dialog. VNPay and full/partial wallet
points use the existing verified backend flow; VietQR is visibly unavailable because
the current contract has no bank-transfer provider. The checkout query parameter
keeps the invoice recoverable on the course route after reload.
The shared Member calendar combines registered classes, PT and court bookings with
local previews of the viewed course. Preview sessions use a muted fill, dashed border
and an explicit not-registered label. Matching registered sessions are deduplicated;
preview details cannot export bookings or open registered-class actions.
Registered class and court details render inside Services; PT session details render inside
Training; invoice details render inside Finance. Query parameters preserve the
selected category, activity and item for browser Back/Forward and incoming links.

Old discovery, course list, court booking/rental, PT booking/session and invoice
detail routes redirect to the corresponding group. Existing aliases for wallet,
training profile and registrations continue to work. Checkout remains a separate
transaction flow. Token-based class-threshold email handling remains available;
member response details are also available inside Services.

Notifications are accessed from the shared header, account settings from the user
menu, and the assistant from its existing entry point. The Overview no longer
duplicates the wallet panel or notification feed.

Services uses the same compact layout as the course detail page: four categories,
short comparison cards and expandable detail/filter sections. Classes, Gym packages and PT are visible together in one Services frame. The member class
catalog shows two courses per page; every result remains reachable via pagination.
Gym, PT and court purchases open the shared checkout dialog. The checkoutIntent
query value scopes recovery to the selected service intent, preventing another
package's button from resuming an unrelated invoice. Wallet data loads when a
payment dialog opens rather than for every package card.
