# Incident refunds

Incident refunds apply only to paid Gym day passes and court rentals whose service dates overlap the incident, including historical rentals and day passes with check-ins. Long-term Gym memberships are not refunded, cancelled or extended by this flow. Day passes are affected when the incident covers every active Gym room and overlaps Gym operating hours (06:00–22:00 Vietnam time).

The manager previews affected services before confirming. The table contains Member, Service, Service date/time, Status and one editable Refund points column. Refund points default to the remaining paid value, at 1,000 VND per point. A different amount requires a 3–500 character adjustment reason. Zero is permitted; negative, fractional and above-balance amounts are rejected. Previously refunded points appear as helper text, not a separate column. Fully refunded and unpaid rows have locked zero inputs. Unpaid checkouts release their resource holds and any held points; they never receive a refund credit.

`POST /api/manager/incidents/preview` returns `refunds` and an opaque `previewToken`. To resolve an incident with affected services, send the same scope/window with:

```json
{
  "previewToken": "token returned by the latest preview",
  "operationId": "client-generated UUID retained for retries",
  "refunds": [
    { "sourceId": "service UUID", "points": 75, "adjustmentReason": "Part of the booking was already used" }
  ]
}
```

Every preview row must be included, including locked zero rows. The server locks invoices/items/wallets, acquires the calendar barrier and rechecks the preview before applying changes. Changes to affected services or balances return `incident_refund_preview_changed` and require another review. Amounts and cancellations are committed together with room blocks, receipts, notifications and the audit log.

Repeating an identical `operationId` returns the original incident without crediting again. Reusing it with different details returns `incident_operation_conflict`. Different incidents share the original invoice item's remaining refund cap. Overlapping incident blocks are reused; only uncovered time ranges receive new blocks. A partial refund leaves only its unrefunded paid balance available for a later, separately reviewed confirmation.

Incident detail responses include immutable `refunds` receipts containing member/service details, actual points, the original suggestion, prior refunds and adjustment reasons. Member notifications report the actual credited points. New day-pass activation shares the calendar barrier and checks closure again before granting access.

Migration: `20261025150000_IncidentRefundReceipts`. Development startup applies migrations automatically; existing incidents retain an empty receipt list.
