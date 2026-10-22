# Manager workspace

Confirmed product scope on 20 October 2026. This update supersedes older Manager navigation, manual wallet adjustment, room-type selection and incident-cancellation descriptions. It does not change staff account administration or role management, which remain with System Administrator.

## Navigation

- Overview: preserve the existing page, charts and data presentation.
- Services: Sports, Courts & Rooms, Membership, Classes.
- Schedule: one calendar for class sessions, rentals and blocked times.
- Support & Communication: Request, Incident, Manual notices.
- People: Members and Coaches.
- Transaction & Report: invoices, read-only point wallets, reports and exports.
- Audit: the existing Manager audit scope.
- Settings: retain operational settings under the account menu.

## People

Members can be registered at the counter from the Member list. Pending accounts have resend-activation and email-correction actions in the list; cooldown, validation and audit still apply. View details contains memberships, classes and payment history. Remove the Manager health-profile UI and manual Coach–Member relationship UI; automatic relationships required by class access and historical records are preserved.

Coaches expose specialties, assigned classes and schedule through View details. Keep profile/specialty editing in this context. Admin locking a Coach continues to notify Managers; the notification opens that Coach's details. Show affected main classes and future sessions and allow eligible reassignment through the existing commands. Changing a main class Coach does not silently rewrite individual session assignments.

Manager can remove the current Member or Coach avatar from View details. Authenticated users can report another Member/Coach photo with its current URL and a reason. The report is persisted, duplicate pending submissions by the same reporter/photo are consolidated, Managers are notified and Request links to the corresponding account. Removing a photo resolves its open reports; dismissal is audited. Staff accounts outside Member/Coach remain outside Manager avatar moderation.

## Services and scheduling

Managers choose Sport when creating a room or rental court; no Room type control or management page is exposed. Rooms have a direct nullable SportId. Migration fills only unambiguous legacy mappings. Existing internal room-type keys and rates remain for compatibility and historical references; new sport selection resolves the internal mapping automatically. Preserve previously blocked availability when migrating inactive types. Changing a room's sport must not invalidate existing sessions or prices.

Rental court creation still saves opening hours and prices together. Rental pricing is available inside court details. Membership offers a paged list of Members registered for that package. Existing class detail tabs and automatic enrollment policy remain. The normal class/session cancellation restriction for active Confirmed enrollment remains enforced.

## Incident-only makeup exception

A missed/interrupted session may receive one full-duration makeup in Incident even with active enrolled students. Keep the source, attendance, assessments and enrollment history. A valid matching held incident window is required. Future-session incident makeup has its own Manager command; ordinary cancellation cannot use this exception. Recheck room/Coach/member conflicts, opening hours and replacement timing. Retries must not create another makeup. A fully delivered session is recorded without a replacement.

## Requests and transactions

Request centralizes Coach absence, refunds, Member support and avatar reports. Categories show pending counts and retain their own statuses, authorization, transaction and review rules. Member support is recorded by staff; this does not add Member self-submission. Existing support, refund and schedule-request links lead to the shared Request entry point.

Wallet balance/ledger and existing financial history remain readable. Manager credit/debit creation and approval/rejection of legacy manual point-credit requests are forbidden through HTTP as well as hidden in the UI. Refund/payment-driven point movements remain functional. Remove the reconciliation UI while retaining backend payment verification and automatic reconciliation. Reports and export history stay under Transaction & Report; Overview remains unchanged.

## Deployment and validation

Apply the ManagerWorkspace and RemoveCourseInterest migrations with the backend deployment (RemoveCourseInterest drops the course-interest tables and the class "next cohort" link, and is not reversible). Do not rebuild or replace the running database/AI services for this change. Verification evidence belongs to the relevant backend integration suites and frontend Manager workspace tests; fixture screenshots are not proof of live email delivery.
