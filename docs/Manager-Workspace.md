# Manager workspace

Confirmed product scope on 20 October 2026. This update supersedes older Manager navigation, manual wallet adjustment, room-type selection and incident-cancellation descriptions. It does not change staff account administration or role management, which remain with System Administrator.

## Navigation

- Top-level order: Overview, Sport, Media, People, Billing management, Exception.
- Sport: Sports, Courts, Membership, Classes.
- Billing management: Invoices, Point wallets, Report.
- Exception: Request, Incident, Manual notices.
- Media: homepage image management. People: Members and Coaches.
- Overview preserves its current page, charts and data presentation.
- Schedule, Audit log and operational Settings remain under the account menu.

## People

Members can be registered at the counter from People. Old Member/Coach list bookmarks redirect to People with the corresponding role filter; detail routes remain compatible. Pending accounts have resend-activation and email-correction actions in the list; cooldown, validation and audit still apply. View details contains memberships, classes and payment history. Remove the Manager health-profile UI and manual Coach–Member relationship UI; automatic relationships required by class access and historical records are preserved.

Coaches expose specialties, assigned classes and schedule through View details. Keep profile/specialty editing in this context. Admin locking a Coach continues to notify Managers; the notification opens that Coach's details. Show affected main classes and future sessions and allow eligible reassignment through the existing commands. Changing a main class Coach does not silently rewrite individual session assignments.

Manager can still remove the current Member or Coach avatar directly from View details. Authenticated users can report another Member/Coach photo with its current URL and a reason. Reports are persisted and duplicate pending submissions by the same reporter/photo are consolidated. System Administrators receive the report notifications and review/dismiss/remove photos through the admin endpoints; reports no longer appear in Manager Request or notify Managers. Removing a photo resolves its open reports; dismissal is audited. Staff accounts outside Member/Coach remain outside Manager avatar moderation.

## Media

Media edits images and the selection/order of three profile-backed Coaches; text/titles are read-only. Its page header/help toolbar is hidden. **Restore original** stages the fixed repository snapshot for review; **Cancel** restores the last published document. The dirty bar's **Preview** opens the actual public homepage with unsaved draft images, and **Save changes** publishes. Coach replacement and mouse/touch/keyboard ordering use a three-card dialog without image-framing controls. See [Media-Editor.md](Media-Editor.md) for restore/preview details and the distinction from the earlier one-time local content restoration.

## Services and scheduling

Managers choose Sport when creating a room or rental court; no Room type control or management page is exposed. Rooms have a direct nullable SportId. Migration fills only unambiguous legacy mappings. Existing internal room-type keys and rates remain for compatibility and historical references; new sport selection resolves the internal mapping automatically. Preserve previously blocked availability when migrating inactive types. Changing a room's sport must not invalidate existing sessions or prices.

Rental court creation still saves opening hours and prices together. Rental pricing is available inside court details. Membership offers a paged list of Members registered for that package. Existing class detail tabs and automatic enrollment policy remain. The normal class/session cancellation restriction for active Confirmed enrollment remains enforced.

Activity status for Sports, Gym plans, rates, rooms and room types is edited through an Activity switch and saved with the other edits. A room-type status change requires a reason. Gym day pass remains active. Schedule navigation uses a date picker with date-range context. Class creation advances beyond schedule setup only after the server confirms every generated slot for the current form fingerprint; pending checks, errors and conflicts block Next and Enter submission.

Exception: after threshold evaluation marks a Published class AtRisk, a Manager may cancel it while its paid roster is still below the threshold and no session has been completed. Opening conditions exposes **Cancel class and refund points** with reason, fresh preview and confirmation. The preview fingerprint protects the roster/refund quote. Cancellation immediately refunds 100% of each remaining paid balance as points, ends enrollments and releases scheduled sessions/holds in one transaction. Members and the teaching Coach receive in-app notices and queued email; retries do not duplicate refunds. New classes do not open a Member response window. Ordinary enrolled classes and individual session cancellation remain restricted; historical response settlements remain supported.

## Incident-only makeup exception

A missed/interrupted session may receive one full-duration makeup in Incident even with active enrolled students. Keep the source, attendance, assessments and enrollment history. A valid matching held incident window is required. Future-session incident makeup has its own Manager command; ordinary cancellation cannot use this exception. Recheck room/Coach/member conflicts, opening hours and replacement timing. Retries must not create another makeup. A fully delivered session is recorded without a replacement.

## Requests and transactions

Request centralizes only Coach absence, refunds and Member support. Categories show pending counts and retain their own statuses, authorization, transaction and review rules. Member support is recorded by staff; this does not add Member self-submission. Existing support, refund and schedule-request links lead to the shared Request entry point.

Wallet balance/ledger and existing financial history remain readable. Manager credit/debit creation and approval/rejection of legacy manual point-credit requests are forbidden through HTTP as well as hidden in the UI. Refund/payment-driven point movements remain functional. Remove the reconciliation UI while retaining backend payment verification and automatic reconciliation. Finance, points, reports and export history are under Services. Manager invoice lists exclude Void before pagination and direct Void detail is hidden; System Administrator gains no financial permissions.

Table filters and quick views open from a funnel disclosure with an active-filter badge and Escape-to-close behavior. Creation/export actions remain visible outside it. Shared FilterBar and handwritten filters, including notice history, use this pattern.

## Deployment and validation

Apply the ManagerWorkspace and RemoveCourseInterest migrations with the backend deployment (RemoveCourseInterest drops the course-interest tables and the class "next cohort" link, and is not reversible). Do not rebuild or replace the running database/AI services for this change. Verification evidence belongs to the relevant backend integration suites and frontend Manager workspace tests; fixture screenshots are not proof of live email delivery.
