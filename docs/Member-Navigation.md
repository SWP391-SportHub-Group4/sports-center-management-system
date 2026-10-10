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
Existing links to a specific rental redirect to My schedule, which shows its details
and cancellation actions in a sliding page with a return to the calendar.

My schedule opens a full month grid with previous/next month navigation, Today,
and a month picker. Event colors distinguish classes, PT and court rentals.
Mobile retains the seven-column month and displays the selected day's agenda below.
The compact schedule embedded in course details retains its week view.
Confirmed class, PT and court events offer an Add to Google Calendar link that
opens a prefilled event editor in a new tab; the member confirms Save in Google.
The link includes UTC start/end timestamps, Vietnam timezone, and available
location/coach details. Preview and cancelled events do not offer this action.
Rental requests are split into ranges of at most 31 days to cover adjacent-month
days in a 35/42-day grid without exceeding the API limit.

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
Registered class and court details render inside My schedule; PT session details render inside
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

Training shares the Services/Schedule teal accents, animated Gym sticker and
icon-labelled tabs. The Sessions tab embeds the shared weekly calendar, combining
PT, registered classes and booked courts with a Book PT action. Booking and payment
expand inline below the weekly calendar within Sessions. The calendar stays mounted;
closing booking preserves the selected date and returns focus to Book PT.
The legacy `tab=book` URL still opens booking under Sessions. Booking separates available coach/time
selection from the session review and existing payment dialog. Workout plans show
exercise sets/reps alongside notes; results label progress and coach feedback.
Sticker animations respect reduced-motion preferences.

BMI Profile replaces the member training-goal form with centre-measured height (cm),
weight (kg), calculated BMI (kg/m²), and measurement date. Members cannot enter or
edit measurements. A member without results submits one persistent measurement
request; repeated submissions return that same request. Pending and confirmed
appointments appear in BMI Profile. Receptionist/Manager member lists include a
measurement request queue; their member profiles include a BMI tab to confirm an
appointment and record measurements. Recorded results are immutable at the API.
The previous training-goal data and API remain available for existing coach/AI flows.
