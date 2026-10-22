# Operations refresh

This existing-surface extension updates Manager operations, shared table controls and account settings. It uses the incumbent Court & Volt tokens and shared components; the product's design sources remain unchanged.

## Class decisions and historical interests

Course/Member interests is removed following the incoming team update: the UI, routes, controllers and interest services are deleted. Migration `20261022120000_RemoveCourseInterest` removes the interest tables, type-26 notifications and class continuation columns, and normalizes past wait-next-course choices to refunds. Its Down migration is unsupported. Cancellation notices may suggest currently open courses of the same sport once; no interest subscription is created. Existing threshold-response settlement and ordinary session reminders remain available.

A Manager can waive a threshold with a reason, defer opening, or cancel an eligible Published/AtRisk class. Cancellation with paid enrollments requires the roster still to be below threshold and no completed session. **Cancel class and refund points** expands the reason/preview/confirm flow. The preview includes remaining paid values, point totals and a fingerprint; the server rechecks current state under locks and rejects stale previews.

Cancellation refunds 100% of each remaining paid value as points, ends enrollments, closes enrollment, releases scheduled sessions/occupancy and seat/payment holds, and settles pending legacy response state in one transaction. Members and the teaching Coach receive in-app notices and queued email. Retrying an already cancelled class does not duplicate refunds. This exception does not allow ordinary enrolled classes or individual sessions to bypass their cancellation rules.

Class Details now reads cancellation availability from the server preview instead of blocking all enrolled classes locally. Published classes still below threshold qualify when marked AtRisk, or when their configured opening-review deadline has arrived while still NotEvaluated; eligibility no longer depends on the background job running first. Completed sessions, an approved/waived threshold, sufficient enrollment and missing payment links remain protected. The callout shows the current roster/threshold and review date, explains blocked states, supports retry after loading errors and rechecks when the deadline arrives. Cancellation still requires a reason and a fresh refund preview before confirmation. Focused coverage: `ClassCancellationRulesTests`, `EnrolledClassCancellationTests` and `frontend/tests/class-cancellation-action.spec.ts`.

## Controls and navigation

- Sports, Gym plans, rates, rooms and room types change activity through an **Activity switch** inside Edit, saved with other fields. Save contracts accept optional `isActive`, preserving callers that omit it. Room-type status changes require a reason; Gym day pass cannot be deactivated. Admin account-access switching retains its reason and review/confirm flow.
- Shared `FilterBar` and handwritten table filters use `TableFilters`: a native details/summary funnel, active-filter badge and Escape-to-close with focus restored. Quick views are inside the disclosure; creation/export actions remain visible outside. Notice history follows the same pattern.
- Sports adds an enabled-service filter (Membership, Group courses, Court rental), combined with search/status and retained in the URL; resetting filters clears it. Create/Edit sport replaces the image URL field with a Landing page image editor: Browse, local preview, pointer/keyboard repositioning, zoom and reset. The crop is uploaded through the existing authenticated Media image endpoint only on Save, then its URL is saved with the sport; upload errors preserve the form and crop. Courts list links to details; the Edit control and activity switch live inside Edit court.
- Manager navigation has exactly **Overview, Sport, Media, People, Billing management, Exception**. Sport groups Sports, Courts, Membership and Classes; Billing management groups Invoices, Point wallets and Report; Exception groups Request, Incident and Manual notices. Requests contain only Coach absence, Refunds and Member support. Profile Schedule/Audit access is unchanged.
- Media now shows read-only text with image replacement and a three-card Coach selection/order dialog. A fixed repository snapshot powers **Restore original** into the draft; Cancel returns to last published. The dirty bar's **Preview** renders the actual public homepage with unsaved data over validated same-origin messaging; Save publishes separately. The page header/help toolbar and inline-text/Coach-framing controls are removed. See [Media-Editor.md](Media-Editor.md).
- Schedule uses a date picker and date-range context instead of a numbered-week input. Create Class step 2 checks Vietnam dates/times before requesting availability: coach and room are required, dates/times must be valid and in the future, session count must be an integer from 1 to 100, configured duration must be positive and at most 12 hours, weekly rules must be present, valid and distinct, the start date must match a selected weekday, and generated sessions must be complete and non-overlapping. Past-time errors have their own short message instead of a generic schedule conflict.
- Next waits for a complete, all-available server result matching the latest schedule fingerprint, including duration. Inactive/incompatible resources, room capacity, opening hours, occupancy, incident review and coach conflicts are shown as distinct, deduplicated reasons in an icon notice below the weekly inputs. Loading and failed/incomplete checks keep Next disabled; failures offer Retry. Enter and saving share the guard, and time validity refreshes while the page remains open. Sources: `features/courses/{course-editor,schedule-validation}`; focused coverage: `tests/course-schedule-validation.spec.ts` and the schedule-validation cases in `tests/manager-operations.spec.ts`.
- Overview/revenue remove the collected KPI and collected line. Net figures, calculations and existing financial data remain.
- For non-Coach users, `/account` has a profile hero and keyboard-operable Personal/Security tabs. Unsaved profile fields survive switching tabs; existing password validation and OTP flows remain.
- Manager Member/Coach detail pages share a compact profile header with the existing avatar, name, contact details, status and actions. Scoped tab styling removes unnecessary scroll controls, keeps mobile labels readable and groups the existing content into consistent surfaces. Membership/class/payment information, Coach biography/specialties, assigned classes/schedule, pagination, editing and photo-removal behavior remain unchanged; transitions only affect hover colors and respect reduced motion.

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

Opening conditions now uses aligned enrollment, deadline and pricing facts, with distinct warning notices. Edit pricing uses full-width price and cost fields in two columns (one on mobile), followed by the live break-even threshold and reason. Pricing validation and waiver actions are unchanged. The “How opening conditions work” and “Threshold responses” disclosures are removed from this manager view; response APIs and legacy expiry processing remain available.
