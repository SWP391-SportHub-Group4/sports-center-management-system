# Member experience: manual acceptance checks

Updated: 2026-10-16. UI labels below use English.

## Preparation

- Use a Member, a second Member, a sport Coach and a Center Manager in a development/test environment.
- Start the current backend and frontend. Development startup applies migrations; production must run its migration step before starting this version. The new migration is `20261016045838_MemberClassCommunication`.
- Keep existing operational data. Create uniquely named test classes and purchases through the normal APIs/UI.
- For email delivery, configure SMTP and `Frontend__BaseUrl`. An outbox row alone proves queuing, not inbox delivery. For live AI responses, the existing Python AI service and its Gemini configuration must be available.

## M01 — Day-pass terms before payment

1. Member → **Services** → Gym day pass → **Choose plan** (or **Renew plan** after a previous pass expires).
2. Before paying, find: **“the check-in code is valid only today (Vietnam time) and the pass is not refundable.”**
3. Refresh. Open the same checkout URL in another tab using the same account.
4. Confirm the terms still appear before the payment action. A monthly plan must not show the day-pass warning.
5. Check Network → `GET /api/checkouts/{invoiceId}`: `isDayPass` is `true` for the day pass.

Expected: the warning does not depend on navigation state or a query parameter. Existing server rules still determine pass validity and reject refunds.

## M02 — Download invoice PDF

1. Member → account menu → **Billing** → open an invoice → **Download invoice**.
2. Confirm a `.pdf` downloads and shows the correct invoice number, items, amounts and payment state.
3. Complete another purchase. On **Payment successful**, select **Download invoice**.
4. Using the second Member, request the first Member's `/api/invoices/{invoiceId}/receipt.pdf` in an authenticated API client.

Expected: own invoice returns PDF; another Member receives 403/404. An issued/unpaid invoice must retain its unpaid state in the PDF. Failed downloads show an error and allow retry.

## M03 — Wait for the next cohort

Prerequisite: a paid class enrollment with an active threshold response. Manager has not waived the decision and the response deadline has not passed.

1. Member → notification bell → open the class threshold notice.
2. Select **Wait for the next course** → **Review response**.
3. Confirm the dialog explains a full refundable-value refund in points, no reserved seat and no automatic enrollment.
4. Select **Confirm response**. Refresh and inspect the wallet and registration history.
5. Repeat the same POST with the same response ID in an API client.
6. Select **Manage course interests**. Confirm the source class, sport, actual refunded points and **Following next cohort** appear.

Expected: the enrollment ends, the remaining eligible value is refunded once, one interest is created, and an identical retry does not credit more points. A different submitted choice receives 409. Another Member cannot cancel/read this interest.

## M04 — Notify the matching next cohort

1. Manager → **Classes** → **Course interests**. Find the waiting Member and source class.
2. Create a new draft in the same sport. In **Next cohort of (optional)**, select that source class. Complete schedule/pricing and save.
3. Publish while registration remains closed. Wait over one minute; no availability notice should be queued.
4. **Reopen enrollment**. The new class must have available seats and future lessons.
5. Within the next communication-job run, Member receives a bell notice and an email is queued. The email's **View class** and the bell's **View class** lead to purchase details.
6. Refresh/restart the backend. Confirm one notice per recipient/channel for this interest/class.
7. A class without the source link, in another program, already started, full or closed must not trigger this notice.
8. Member → **Services** → **Course interests** → **Stop notifications**. Open another linked cohort.

Expected: **Notifications stopped** persists; future notices stop and the previous refund remains. No seat or enrollment is created by notification delivery. If registration is closed by the time the Member opens a notice, normal purchase rules still apply.

## M05 — Lesson reminders

1. Register a Member before the applicable reminder threshold. Leave another Member unregistered or end their enrollment.
2. For the 1-hour check, use a lesson starting more than one hour ahead and register before that threshold. Keep the API running until the lesson is less than one hour away.
3. Member → bell: confirm **Upcoming lesson** contains class, Vietnam date/time and room. **View session** opens the class in My schedule.
4. Wait through several one-minute worker runs and restart the API. Confirm no repeated notice for that same lesson/start/window.
5. Repeat with a lesson crossing the 24-hour threshold.
6. Manager moves a lesson: later reminders must use its new start time. Cancelled lessons and ended enrollments receive no new reminders.
7. Register between the 24-hour and 1-hour thresholds: no retroactive 24-hour notice; the 1-hour notice remains eligible. Register after the 1-hour threshold: no catch-up reminder.

Expected: separate 24-hour and 1-hour windows; notifications are deduplicated against the lesson's scheduled start. Automated integration tests exercise these windows with a controlled clock so they do not require a day-long wait.

## M06 — Ended class access

1. With a current enrollment, Member → **My schedule** → open class details. Confirm lessons and coach content load.
2. In another session, end that enrollment through a supported refund/cancellation flow, or let the class finish.
3. Return focus to the Member tab. The open view should clear protected content and display **Class access has ended**. A continuously visible tab rechecks within 30 seconds.
4. Refresh/open the old URL. Request both `/api/members/me/classes/{classId}/sessions` and `/teaching-records` directly.
5. Open **Billing** and registration history.

Expected: both protected APIs return `403 class_access_ended`; financial/registration records remain available. Class completion is enforced from lesson end times even before a status job updates the class. Public catalog/schedule data remains governed by public catalog rules.

## M07 — Personalized AI with permitted sources

1. Member → account menu → **Fitness profile**. Save real test measurements, goals, routine and any relevant limitations.
2. Assigned Coach adds a course/individual lesson plan and a session assessment/comment for this Member. Add a different comment for the second Member.
3. Member → **Ask SportHub**. Ask: “Based on my fitness profile and my coach's latest assessment, what should I focus on in my next lesson?”
4. Check the response reflects the saved goal/limitations and permitted coach guidance, citing the source lesson/title/date when used.
5. Ask for the second Member's assessment. It must not be present in the context or disclosed.
6. End access to one class and send another question in the same conversation. The provider must receive fresh authorization context; an old continuation cannot restore ended-class material.
7. Test a Member without measurements/assessments. The response must identify missing information instead of inventing it.

Expected: advice is based on the Member's permitted records. Context limits are 12 plans, 16 assessments, 8 notices/homework, excerpts of at most 2,000 characters and up to 30 upcoming enrolled sessions over 14 days. AI does not change plans, attendance or results. Context/authorization are covered by integration tests; answer quality and actual delivery need the configured live AI provider.
