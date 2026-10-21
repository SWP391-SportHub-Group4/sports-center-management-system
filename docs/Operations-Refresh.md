# Operations refresh

This existing-surface extension updates Manager operations, shared table controls and account settings. It uses the incumbent Court & Volt tokens and shared components; the product's design sources remain unchanged.

## Class decisions and historical interests

Course/Member interests UI is retired, old Manager interests routes redirect to Classes, and both interest controllers are marked `[NonController]`. Interest-notification work and creation of new threshold Member-response windows stop. Historical interests/responses and legacy settlement services remain; retirement does not delete records or disable ordinary session reminders.

A Manager can waive a threshold with a reason, defer opening, or cancel an eligible Published/AtRisk class. Cancellation with paid enrollments requires the roster still to be below threshold and no completed session. **Cancel class and refund points** expands the reason/preview/confirm flow. The preview includes remaining paid values, point totals and a fingerprint; the server rechecks current state under locks and rejects stale previews.

Cancellation refunds 100% of each remaining paid value as points, ends enrollments, closes enrollment, releases scheduled sessions/occupancy and seat/payment holds, and settles pending legacy response state in one transaction. Members and the teaching Coach receive in-app notices and queued email. Retrying an already cancelled class does not duplicate refunds. This exception does not allow ordinary enrolled classes or individual sessions to bypass their cancellation rules.

## Controls and navigation

- Sports, Gym plans, rates, rooms and room types change activity through an **Activity switch** inside Edit, saved with other fields. Save contracts accept optional `isActive`, preserving callers that omit it. Room-type status changes require a reason; Gym day pass cannot be deactivated. Admin account-access switching retains its reason and review/confirm flow.
- Shared `FilterBar` and handwritten table filters use `TableFilters`: a native details/summary funnel, active-filter badge and Escape-to-close with focus restored. Quick views are inside the disclosure; creation/export actions remain visible outside. Notice history follows the same pattern.
- Manager navigation has exactly **Overview, Sport, Media, People, Services, Exception**. Sport links directly to `/manager/sports`; Finance, points and reports are in Services. Requests contain only Coach absence, Refunds and Member support. Profile Schedule/Audit access is unchanged.
- Media now shows read-only text with image replacement and a three-card Coach selection/order dialog. A fixed repository snapshot powers **Restore original** into the draft; Cancel returns to last published. The dirty bar's **Preview** renders the actual public homepage with unsaved data over validated same-origin messaging; Save publishes separately. The page header/help toolbar and inline-text/Coach-framing controls are removed. See [Media-Editor.md](Media-Editor.md).
- Schedule uses a date picker and date-range context instead of a numbered-week input. Create Class waits for server availability for every generated slot, matched to the current schedule fingerprint; pending/error/conflict states disable Next and Enter follows the same guard.
- Overview/revenue remove the collected KPI and collected line. Net figures, calculations and existing financial data remain.
- For non-Coach users, `/account` has a profile hero and keyboard-operable Personal/Security tabs. Unsaved profile fields survive switching tabs; existing password validation and OTP flows remain.

## Moderation and invoices

Avatar reports notify active System Administrators rather than Managers. Review/dismiss uses `/api/admin/avatar-reports`; removal uses `/api/admin/users/{id}/avatar`. Reports retain duplicate protection and audit. Manager Request no longer lists reports. Existing direct Manager removal of Member/Coach photos from People remains authorized.

Management invoice lists exclude Void in the backend query before totals/pagination; Manager direct Void detail returns not found. System Administrator financial access remains denied: the query change adds no new financial permissions.

## Sources and verification

Core backend sources are `backend/SportHub.Scheduling/Application/Services/CourseCancellationService.cs`, `Threshold/Application/ClassThresholdService.cs`, legacy threshold response/expiry services and API reminder jobs; catalog `SportCatalogService`, `MembershipPackageService`, payment `InvoiceQueryService`/`InvoicesController`, and identity `AvatarReportsController`.

Frontend sources include `components/ActivitySwitch`, `components/data/{TableFilters,FilterBar}`, `components/AppShell.tsx`, `features/catalog/*-manager.tsx`, `features/courses/{course-editor,course-operations,threshold-panel}.tsx`, `features/manager/{request-center,manager-schedule}.tsx`, `features/administration/users.tsx`, `features/reports/{monthly-analysis,monthly-analysis-charts,reports}.tsx`, and `app/account/page.tsx`, all under `frontend/src`.

From `frontend`:

```powershell
npm run typecheck
npm run lint
npm run format:check
npm run build
npm run test:e2e -- tests/operations-refresh.spec.ts tests/manager-workspace.spec.ts tests/manager-catalog.spec.ts
```

From the repository root, with the integration-test database configured:

```powershell
dotnet test backend/SportHub.Scheduling.Tests/SportHub.Scheduling.Tests.csproj --filter FullyQualifiedName~EnrolledClassCancellationTests
dotnet test backend/SportHub.Security.Tests/SportHub.Security.Tests.csproj --filter FullyQualifiedName~AvatarReportWorkflowTests
```

Focused coverage includes transactional/idempotent cancellation and stale previews, Void pagination/detail and denied admin finance, avatar-report RBAC, activity edits, funnel filters, class availability guards, navigation, account draft/tab behavior and removed collected displays. Browser fixtures and queued-email assertions do not verify live email delivery. Application Docker rebuild remains user-managed; validation used temporary PostgreSQL rather than rebuilding application containers.

Existing design documentation still describes token integration as pending although the app imports the tokens/fonts; this documentation drift is unchanged. Conditional threshold deadline copy and expiry processing apply to existing legacy response windows. New threshold evaluations create neither a response deadline nor response records.
