# SportHub frontend

Next.js App Router, React, TypeScript and CSS Modules. Routes in `src/app` use `src/lib/apiClient.ts`; canonical DTOs are in `src/lib/types.ts`. Reusable API-backed courses, membership, wallet, payment and training features are in `src/features`. The duplicate demo repository/member shell and fake entrance pass were removed.

P2.00–P2.05 implement six-role auth/profile refresh, OTP identity flows, public multi-sport catalog, shared points/gateway checkout and Member workflows. Gym membership, whole-course purchases and PT entitlements are separate. Financial states and ownership come from backend.

Run `npm run typecheck`, `npm run lint`, `npm run check:i18n`, `npm run build`, then `npx playwright test tests/member.spec.ts tests/refactor-foundation.spec.ts tests/refactor-payments.spec.ts`. Browser tests use installed Microsoft Edge and a production server on3100. These suites mock HTTP to test UI behaviors, responsive layouts and WCAG.

Real integration: set `P2_LIVE_API=http://localhost:5000`, then run `npx playwright test tests/refactor-live.spec.ts`. Use a fresh isolated demo database, VNPay mock and disabled SMTP. It creates/pays real courses and verifies server fulfillment; do not point it at a shared database or rerun against already-used course schedules.

Progress, evidence and next P2.06 work: [progress](../docs/refactor-progress.md), [API contract](../docs/refactor-api-contract.md), [handover](../docs/refactor-frontend-handover-temp.md). External Google/SMTP/VNPay sandbox integration is separate from internal mock-provider tests. Remaining staff refactor belongs to P2.06 onwards.
