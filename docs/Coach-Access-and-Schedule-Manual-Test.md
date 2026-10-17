# Coach access and schedule changes

## Setup

Use a Manager, a primary Coach A, substitute Coach B, and two Members. Publish a class with at least three future sessions, assign A, and register one Member through a successful payment. Leave the other Member outside the class. Configure SMTP to check actual email delivery; integration tests check the encrypted email outbox.

## Coach absence request and withdrawal

1. Sign in as A. Open **Teaching schedule**, select an assigned Scheduled session at least six hours away and open **Request**.
2. Click **Request absence**, enter a reason and submit. The request stays **Pending**; the session schedule does not change and Manager receives a notification.
3. Open **Requests** and the session detail. Pending requests offer **Withdraw request**, but no **Edit pending request**. The Coach cannot choose a substitute, reschedule or makeup time. At 320px, fields and actions remain within the viewport.
4. Try `PUT /api/coaches/me/teaching/change-requests/{id}` and a new POST with `SUBSTITUTE`, `RESCHEDULE` or `CANCEL_WITH_MAKEUP`: neither may create or edit a request. Existing requests of those types remain readable as history.
5. Withdraw the Pending absence; its status changes without altering the teaching schedule. Resolve or reject a separate Pending request as Manager; Coach cannot withdraw a closed request. A new absence less than six hours before the session is rejected.

## Manager changes and automatic closure

1. Create another Pending request. As Manager, reschedule that session directly, using a free time slot.
2. The request becomes **Closed** in the UI (`WITHDRAWN`/`SCHEDULE_UPDATED` on the wire), with **Closed automatically — schedule updated by Manager.** The schedule updates and A receives bell/email notifications.
3. Repeat with a substitute assignment and with cancel plus makeup. Both outgoing and incoming coaches receive the change; each receives one schedule notice per channel. Cancelling a whole course also closes Pending requests on its remaining sessions.
4. Try a conflicting target slot. The schedule and Pending request must stay unchanged and no change notification may be committed.
5. Approve a request through the normal review flow. It must stay **Approved**, rather than being automatically cancelled.
6. For an incident affecting a class, use the required reschedule/makeup flow before blocking the room; verify the same coach notifications are generated.

## Student access

1. As A, open **Students**. Only Members with Confirmed enrollment in A's Published/In progress classes appear. Open a student: health profile appears first; plans and assessments remain available.
2. Attempt to open the unregistered Member's URL and health API: access is denied.
3. Withdraw/refund the registered Member. The next API request is denied immediately. An already open student view closes within 30 seconds or when the browser regains focus; historical rows remain in the database.
4. Restore the enrollment, then complete/cancel the class. Repeat the access checks. A stale active Coach–Member relationship must not restore access.
5. If A still teaches the Member in another active class, the Member remains accessible through that class. The ended class's records API remains denied.
6. As B, open the assigned session in **Teaching schedule**. B can read its roster and session records and use session tools. B cannot read another session's roster, the health profile, class-wide plans, learning history, or student AI context. **Classes** and **Students** do not grant class-wide access through a substitute assignment.
7. Check API access directly as B: `/api/classes/{classId}/sessions` contains only B's non-cancelled sessions; `/api/coaches/me/teaching/classes/{classId}/members` requires B's `sessionId`; other session IDs return 403. General user/profile/package APIs do not grant access from a substitute assignment.

## Storage and deployment

No new schema migration is required. Requests reuse `WITHDRAWN`, review metadata and `resolutionType=SCHEDULE_UPDATED`. Existing relationship and history data are retained; authorization derives from current assignments and enrollment on each request. Deploy/restart the backend and frontend together.
