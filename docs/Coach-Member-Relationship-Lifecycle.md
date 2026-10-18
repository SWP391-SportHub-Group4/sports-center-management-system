# Coach and Member assignment lifecycle

Confirmed scope for M02 on 18 October 2026: every assignment, including one created manually by a Manager, remains active only while the Member has a confirmed enrollment in at least one Published or InProgress course led by that Coach. Completing one course does not end the assignment if another qualifying shared course remains. Holds, drafts and cancelled/refunded/transferred-out enrollments do not qualify.

## Existing API

No new HTTP route is introduced.

| Method | Existing route | Behavior |
|---|---|---|
| GET | `/api/coach-member-relationships?coachId&memberId&activeOnly&page&pageSize` | Existing role/owner scope and pagination remain. Active-only results require a current shared course for every source type. |
| POST | `/api/coach-member-relationships` | Manager only. Existing body remains. A pair without a current shared course receives 409 `relationship_requires_active_class`; duplicate Active pairs still receive 409 `relationship_already_active`. |
| POST | `/api/coach-member-relationships/{id}/end` | Existing Manager action, with a persisted reason. |

Responses add nullable `endReason` and `activeClasses: [{classId,className}]`. Active classes are all current supporting courses, not just the original `classId`. Ended assignments return an empty list. Existing fields and result shapes remain compatible.

## Automatic ending

- Fulfillment reconciles the Member's assignments when an enrollment ends, in the same transaction as cancellation/refund.
- Transfers reconcile after destination confirmation, including transfers with no additional payment and transfers after paying a difference. A same-Coach transfer keeps the current relationship if a qualifying class remains.
- The existing locked-Coach coverage API creates/reuses replacement-Coach assignments and reconciles the old Coach. Other shared courses continue to support their assignments.
- The existing five-minute `ClassStatusJob` completes classes and reconciles unsupported assignments in one transaction. It also repairs legacy unsupported Active assignments of every source type.
- Automatic ending records `EndedAt`, an English `EndReason` and one `AUTO_END_COACH_MEMBER_RELATIONSHIP` audit. Row locks and rechecks make repeated/concurrent cleanup idempotent.
- Re-enrollment creates a new Active record when the earlier relationship is Ended; it does not reactivate historical records.

The primary course Coach remains the authority used by `CoachDataScope`. Changing an individual substitute lesson does not itself change the primary Coach or create a new long-lived relationship. Existing lesson/history permissions remain separate.

## Manager interface and migration

Member profile → Overview → Coach relationships → **Assign coach** opens a dialog for the selected Member. Only primary Coaches of confirmed enrollments in Published/InProgress classes are listed. Active pairs are disabled as already assigned. Selecting an available Coach shows all qualifying shared classes; an optional note (500 characters maximum) is stored in the creation audit. Confirm uses the existing relationship POST and refreshes the list. Failed saves reload eligibility; empty/loading/error states cannot submit. All-assigned and no-shared-class states explain why assignment is unavailable.

The existing Member enrollments GET adds nullable `coachId` alongside `coachName`, avoiding per-class detail calls. No HTTP endpoint is added.

The assignment dialog offers an All sports / Sport filter derived from eligible shared classes. Coach options and supporting-class labels include sport names. Switching sports clears the selected Coach; duplicate detection remains per Coach–Member pair across all sports. The filter does not make Coaches without a shared class eligible.

Each Active relationship has an **End relationship** action. The confirmation names the Coach, requires a trimmed reason of 3–500 characters, and uses the existing `POST /api/coach-member-relationships/{id}/end`. Success refreshes the list to show Ended, ending time and reason; historical Ended records cannot be ended again from the UI.

Manual ending changes only the relationship and writes its audit in a transaction. It does not cancel enrollment, remove or reschedule lessons, change the class/session Coach, refund payment or remove training history. Coach access granted by a current primary class assignment remains governed by `CoachDataScope`; ending the relationship alone does not revoke that class access. A teacher change or enrollment cancellation must use the separate class workflow.

Member profile → Overview → Coach relationships shows source, status, supporting-course links, ending time and recorded reason. Older Ended records with no reason show `End reason not recorded.` rather than an invented historical reason.

Migration `20261018042000_CoachRelationshipEndReason` adds nullable `end_reason`. Existing relationship IDs, plans and teaching history are preserved. Cleanup ends unsupported Active records without deleting them.

## Verification

`SportHub.Training.Tests/Integration/RelationshipLifecycleTests.cs` covers multiple shared classes and source types, concurrent audit deduplication, rollback, existing manual-create API guards, re-enrollment history, the class-status job and the existing reassignment API. Tests use disposable PostgreSQL, not the development database.

Manager UI tests check current-course links and historical ending reasons using API fixtures. UI fixtures do not certify backend transaction behavior or external email delivery.
