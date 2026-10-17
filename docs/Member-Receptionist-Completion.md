# Receptionist and Member completion

## Behavior

- Receptionist: support assignment, progress and closure; Member-only account lookup; forgotten Gym checkout with actual Vietnam departure time and reason; Gym closure check; payment/service reconciliation including expired holds.
- Member: one in-app reminder during the 24 hours before a scheduled class session, only while the enrollment is active. Repeated job runs do not duplicate a reminder for the same member/session. Existing schedule-change notices handle subsequent timetable changes.
- Choosing **Wait for the next course** after a class misses its threshold refunds the remaining paid value as points, ends enrollment and creates an interest for the same sport in one transaction. Repeating the same response does not duplicate either the refund or subscription.
- Active interests receive an in-app notice when another eligible course in the sport is published after subscribing. This does not reserve a seat or create an enrollment. Members can stop future notifications without reversing the refund. Managers can review interests by sport.
- Day-pass checkout shows that access is valid only on the payment day in Vietnam and is non-refundable, including when reopening checkout by invoice ID.
- Members can download their invoice PDF through the existing authenticated receipt endpoint. Another member's invoice remains forbidden.
- Class teaching content requires an active enrollment and a class that is Published or InProgress. Completed classes no longer grant access through a lingering Confirmed enrollment.

AI recommendations remain assigned separately to Hào.

## Database and worker

Migration: `20261016133000_AddMemberCourseNotifications`. It adds `course_interests` and extends the existing threshold-response constraint, preserving enum values. Run the normal application migration process before using the new endpoints.

`MemberCourseNotificationsJob` runs every minute. Its transaction serializes workers with a PostgreSQL advisory lock; notification outbox uniqueness protects retries.

## Validation

Validated on 16 October 2026 against the working tree:

- Backend builds and frontend production build passed.
- Eleven relevant PostgreSQL integration cases passed across Security, Scheduling, Payment and Training. They cover Receptionist access/support/Gym/payment, late capture compensation, threshold refund idempotency, course interests, reminders, PDF ownership and withdrawal of class-content access.
- Eleven Playwright cases passed for Receptionist workflows and Member threshold choice, interests, day-pass disclosure and PDF download. Browser tests use API fixtures; PostgreSQL integration tests exercise the real API and persistence.

This is targeted verification of these changes, not a run of every test in the repository. Real VNPay and outbound email delivery are outside these test cases.
