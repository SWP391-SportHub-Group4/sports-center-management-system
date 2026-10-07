# CourtRate audit metadata

Completed on 2026-10-06.

## Behavior

- CourtRate metadata renders the recorded price, applicable days, local time window, room type, sport scope and status with translated labels.
- Updates show old → new values only for changed fields. Room type/sport remain as identifying context; unchanged price/day/time/status are hidden.
- Creation and deletion show their recorded snapshot. Day comparisons ignore ordering and duplicate codes.
- New backend events capture room type/sport names and start/end times alongside existing IDs, days, price and active status. JSON serialization handles names safely, including quotation marks.
- Historical logs are unchanged. Snapshot names take priority; older room type IDs are resolved through the existing room type list API, with a visible note identifying current catalog names. Absent time fields are not invented. Missing comparison values show “Not recorded”; unreadable metadata has an explicit fallback.
- CourtRate has no independent name field, so its heading is “Court rate: [room type name]”. Room type lines show the name. The duplicate Rate ID line was removed from Metadata on 2026-10-07; the entity column retains the target ID. A single shared room type request serves the page when legacy snapshots need it; no requests are made per row. Lookup failures preserve the audit and IDs, with a retry action; missing references retain IDs.
- The audit screen does not fetch current rates to reconstruct prices or historical time windows. No migration, finance changes or pricing API payload changes. This follow-up uses an existing read API only, with no further backend changes.

## Validation

- TypeScript, touched-file ESLint, i18n checks and production Docker builds passed.
- 3 backend integration tests passed against isolated Testcontainers PostgreSQL: complete create/update snapshots; status/delete snapshots; invalid update writes no success event.
- 18 Playwright tests passed after the name-display follow-up: 8 CourtRate audit cases, 6 Membership audit regression cases and 4 Admin audit target cases. Includes single shared reference lookup, stored name priority, lookup failure/retry, missing references, read-only live verification and desktop/390px/320px layouts.
- Live historical events confirmed: price 100,000 → 120,000 VND at 23:35 and Active → Inactive at 23:33. No business mutation was performed on the development database for verification.
- Visuals inspected: manager-court-rate-audit-live.png and manager-court-rate-audit-mobile.png.
- Docker frontend/backend updated at localhost:3000 / localhost:5000; database volume retained.

## Main files

- frontend/src/features/administration/CourtRateAuditChanges.tsx
- frontend/src/components/AuditLogView.tsx
- frontend/src/locales/en.ts and vi.ts
- backend/SportHub.Scheduling/Catalog/Application/CourtRateService.cs
- docs/api-contract.md
- frontend/tests/manager-court-rate-audit.spec.ts
- backend/SportHub.Security.Tests/Integration/CourtRateAuditTests.cs
