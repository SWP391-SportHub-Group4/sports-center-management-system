# SportHub frontend

SportHub là **hệ thống quản lý trung tâm thể thao với ba môn Gym (bao gồm PT), cầu lông và bóng rổ; có thể mở rộng thêm môn trong tương lai**. PT là dịch vụ thuộc Gym, không phải môn thứ tư.

Next.js App Router, React, TypeScript and CSS Modules. Routes in `src/app` use `src/lib/apiClient.ts`; canonical DTOs are in `src/lib/types.ts`. Feature modules (courses, catalog, payments, wallet, rentals, pt, reports, court-schedule, incidents) live in `src/features`. Financial states, ownership and authorization always come from the backend; the UI only mirrors them. API reference: [docs/api-contract.md](../docs/api-contract.md).

## Checks

```bash
npm run typecheck
npm run lint
npm run check:i18n
npm run build
npx playwright test
```

Playwright runs Chromium against a production server on port 3100. Without `P2_LIVE_API` the suites mock HTTP, so they verify UI behavior, responsive layout and WCAG only; live suites are skipped.

## Live integration tests

Use a freshly seeded, isolated PostgreSQL database and API (`VnPay__UseMock=true`, SMTP disabled), with CORS allowing `http://127.0.0.1:3100`. Build the frontend with the same API URL, then run:

```bash
NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:5000 npm run build
P2_LIVE_API=http://127.0.0.1:5000 npx playwright test --workers=1
```

The suites create and pay real courses, so they are not repeatable on the same database; never point them at a shared one. Login is rate limited per IP, so `tests/helpers/auth.ts` caches tokens and waits on HTTP 429. External Google, SMTP and VNPay sandbox integrations are not covered by these tests.
