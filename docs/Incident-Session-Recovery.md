# M03 + M04 — Whole-session incident recovery

Scope: repeat the whole missed/interrupted session. No minute-based compensation, class transfer or new refund policy. Fully delivered sessions need no replacement.

User scope update: remove automatic slot search and suggestions. Manager supplies the replacement date/time, room and Coach manually; the save command still checks eligibility and conflicts.

## Manager flow

Open `/manager/incidents` → enter room/center, actual period and reason → preview impacts → edit a session → enter the replacement date/time, room and Coach → review → confirm → re-preview and complete the incident. Historical periods are accepted; the incident duration remains limited to 31 days.

Future sessions reuse the existing reschedule/cancel-with-makeup editor and journal. Started/finished sessions record `INTERRUPTED`, `NOT_HELD` or `COMPLETED_AS_PLANNED`, with actual occurrence, server recording time, actor and reason. Whole-session makeup follows the last noncancelled remaining lesson, reusing the existing rule. Original times, attendance and assessments remain stored. History exposes these outcomes and the replacement class link.

## Existing and new APIs

Existing reschedule/cancel, occupancy, opening hours, notifications, preview/fence/resolve and history are reused. The following Manager-only operation records historical outcomes:

- `POST /api/class-sessions/{id}/incident`: `{fenceId,outcome,occurredAtUtc,reason,makeup?}`. Requires a matching open/unexpired held window. Actual occurrence must overlap the session/incident and cannot be future. Fully delivered requires a finished session and no makeup. Missed/interrupted requires a valid whole-session replacement after the incident.

## Transactions and history

Migration `20261018080000_SessionIncidentReport` adds nullable JSONB `class_sessions.incident_report_json`, containing immutable facts, replacement link and an idempotency key. Old records remain null. Report and makeup run in one transaction with scheduling/class/session locks. Retry returns the same replacement; conflicting reports are rejected. Failure rolls back the operation. A Completed class reopens to InProgress for its new replacement and restores class-based relationships for still-Confirmed Members.

Ordinary past-session edits remain blocked. Historical decisions cannot be undone into past slots; abandonment lists these as not undone. Historical court rental impacts require separate review and are not automatically refunded by this new class workflow. Current/future rental and Gym closure handling retain their existing behavior. Confirmation checks opening hours, capacity, Coach eligibility, room/Coach occupancy, incident windows and Members' stored class/rental commitments.

## Verification

`IncidentSessionRecoveryTests` covers historical/ongoing outcomes with manually supplied replacement times, completed-class recovery, concurrent retry deduplication, retained attendance/results, historical resolve/history, member rental conflicts and matching-window validation using disposable PostgreSQL.

`manager-incident-recovery.spec.ts` covers the historical outcome forms, manual whole-session replacements, review before write and fully delivered decisions with API fixtures. Existing incident and schedule tests provide regression coverage.

After removing slot search: 27 backend cases and 5 browser cases passed; frontend TypeScript/targeted ESLint and Docker backend/frontend builds passed. Local logs: `.tmp/manual-schedule-backend-tests.log`, `.tmp/manual-schedule-ui-tests.log`, `.tmp/manual-schedule-docker-build.log`. Docker local has been updated; backend health returned 200.
