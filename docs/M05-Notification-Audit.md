# M05 notification audit — 2026-10-18

## Fixes implemented after the audit

All four findings below have been addressed using existing APIs and the existing
transactional notification outbox:

- Main-coach replacement now notifies confirmed members, the former coach and
  the replacement through in-app notices and email. It states both coach names,
  the reason, and that individual session assignments/times/rooms do not change.
- Course cancellation now queues an email for each affected member alongside
  the in-app notice, using the same enrollment event identifier.
- Successful incident undo notifies the main coach and both affected session
  coaches, deduplicating recipients. Corrections identify the restored schedule,
  coach/room changes and cancellation of the makeup where relevant. Failed undo
  does not announce successful restoration.
- A reschedule whose time, duration, room and coach already match the stored
  session returns without another audit, journal step or notification. Existing
  class/session locks serialize parallel identical requests. Subsequent real
  schedule changes still create fresh events.

Regression tests now assert the corrected behavior rather than characterize the
missing notifications. No API or database migration was added for these fixes.
The audit results below are retained as the record of behavior before the fixes.

Validation after fixes: 27 Scheduling scenarios covered (7 notification regression
cases plus 20 existing incident/schedule cases), 2 Payment cancellation scenarios,
and 3 browser scenarios. All passed in the final relevant runs. The initial full
Scheduling run had one obsolete email assertion reading the intentionally empty
plaintext field; it was corrected to decrypt and inspect the protected email
payload, and all 7 notification cases were rerun successfully. Build of the backend
Docker image passed. Logs: `.tmp/m05-fix-scheduling.log` (initial run),
`.tmp/m05-fix-audit-final.log`, `.tmp/m05-fix-cancellation.log`,
`.tmp/m05-fix-ui.log`, `.tmp/m05-backend-build.log`.

Scope: main-coach replacement for a locked coach, whole-course cancellation,
incident abandonment/undo, and identical reschedule retries. Production behavior
was not changed during the original audit. Backend tests use disposable PostgreSQL databases; browser
tests use mocked HTTP responses against the existing frontend.

## Confirmed results

| Operation | Working behavior | Remaining gap |
| --- | --- | --- |
| Replace locked main coach | Class coach changes; replacement receives one in-app notice and one email record; individual session coaches/times stay unchanged. Repeating the request returns 409 without another notice. | No notice to enrolled members or former coach. |
| Cancel whole course, before teaching or after one of three sessions | Correct 100/66 point refunds, released holds, cancelled scheduled sessions. Member receives one in-app cancellation notice; coach receives in-app/email per cancelled session. Two concurrent cancellations and a later retry do not repeat refunds/notices. | No cancellation email is queued for the member. Per-session coach notices represent different sessions, not duplicates. |
| Undo reschedule, including replacement coach | Original time/coach/status restored; member receives correction in-app and email. | Neither former nor replacement coach receives a correction. |
| Undo cancel-with-makeup, including replacement coach | Original session restored; makeup cancelled; member receives correction in-app and email. | Neither coach receives a correction. |
| Undo when old slot is occupied or session changed again | Does not force restoration; reports the skipped step. Closed incident rejects another abandon request. | No additional finding in the covered scenarios. |
| Repeat identical direct reschedule | Both requests return 200; final schedule is unchanged by the second request. | Notice count per member/coach grows from 2 to 4 (one in-app plus one email each time). Retry is not notification-idempotent. |

The notification counts above are persisted notification/outbox records, not proof
of external email delivery. Test email delivery is deliberately unavailable.

## Validation

- Scheduling: 18 tests passed (`ManagerNotificationAuditTests`, `IncidentUndoTests`,
  `CoachScheduleWorkflowTests`). The four new audit cases characterize current
  behavior, including known gaps; their passing does not mean M05 is complete.
- Payments: 2 cancellation cases passed, with additional per-recipient/channel
  assertions after concurrent requests and retry.
- Browser: 3 M05 cases passed: main-coach replacement submission/queue refresh,
  cancellation preview/confirmation/refresh, and abandon review/skipped-step result.
  Browser cases validate UI behavior; backend tests validate actual persistence.
- Frontend TypeScript and targeted ESLint passed.

Commands:

```powershell
dotnet test backend/SportHub.Scheduling.Tests/SportHub.Scheduling.Tests.csproj --filter 'FullyQualifiedName~ManagerNotificationAuditTests|FullyQualifiedName~IncidentUndoTests|FullyQualifiedName~CoachScheduleWorkflowTests'
dotnet test backend/SportHub.Payment.Tests/SportHub.Payment.Tests.csproj --filter 'FullyQualifiedName~Course_cancel_returns_exact_proration_releases_holds_and_is_repeat_safe'
# From frontend, with PLAYWRIGHT_BASE_URL=http://localhost:3000
node node_modules/@playwright/test/cli.js test tests/manager-operations.spec.ts --grep M05 --workers=1 --reporter=line
```

Local logs: `.tmp/m05-scheduling-audit.log`, `.tmp/m05-cancellation-audit.log`,
`.tmp/m05-ui-audit.log` (ignored workspace artifacts).
