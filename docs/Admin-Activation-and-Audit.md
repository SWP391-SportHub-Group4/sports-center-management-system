# Staff activation and audit visibility

Confirmed by the product owner on 14 October 2026. These decisions replace earlier staff-link lifetimes and audit access descriptions in the Word SRS, Business Rules and design documents.

## Staff activation

- Only System Administrator can correct or resend an invitation for an unactivated staff account. Member accounts and activated staff do not use these endpoints.
- The activation deadline is exactly `UserAccount.CreatedAt + 168 hours`, stored in UTC and displayed in Vietnam time. Every newly issued staff activation link expires at this same deadline. It is not valid for another seven days from the resend or correction.
- Resending replaces the old token and has a 60-second cooldown. Correcting an email requires a different valid address, uniqueness and a nonblank reason of 3–500 characters. The Admin reviews the new address before confirming; the recipient verifies ownership by opening the link and setting a password.
- Correcting an email invalidates the previous address's activation token and queues a fresh email for the new address in the same transaction. It does not extend the deadline. Queuing an email is not proof of delivery.
- Links are single-use. Expired invitations cannot activate, resend or correct their email, even before the cleanup job runs. The existing seven-day cleanup retains audit history.
- Member activation remains 24 hours; password recovery remains 10 minutes. This change concerns staff invitations only.

Endpoints: `POST /api/users/{id}/resend-activation`, `PUT /api/users/{id}/email` with `{email, reason}`. In the user list, only rows labelled Activation required show a More button. It opens a single activation popup with recipient information, deadline, resend and email correction, including review. Account details also expose both actions. `UserAdminResponse` adds nullable `activationExpiresAtUtc` and `activationResendAvailableAtUtc`. These fields describe Admin-created pending invitations; seed accounts do not acquire invitation metadata simply because they have no password.

Existing links issued before this release keep their original expiry until replaced. Resending or correcting their email issues a token with the fixed account deadline.

The Admin Account status filter includes `ACTIVATION_REQUIRED`: active non-member accounts without a password or external login. The API applies this filter before counting and pagination; the stored account status remains `ACTIVE`.

## Audit access

| Reader | Recorded actor roles they can read |
|---|---|
| System Administrator | `CENTER_MANAGER`, `SYSTEM_ADMINISTRATOR`, `COACH`, `SYSTEM` |
| Center Manager | `CENTER_MANAGER`, `RECEPTIONIST`, `COACH`, `MEMBER` |
| Receptionist, Coach, Member | No access to the audit endpoints |

All recorded action and target types are eligible within these role scopes. Admin is no longer restricted to account targets. Manager cannot see Administrator or system events. Viewing an event does not grant permission to execute its action or open an operational detail page; Admin audit views do not link into Manager routes.

`AuditLog.ActorRole` stores the role at event time. New authenticated events use the authenticated role, including the original role when a role-change command runs. Background jobs, unauthenticated gateway processing and explicitly automatic fulfillment record `SYSTEM`; an associated account ID is an origin reference, not the automatic executor. Staff invitation expiry records `SYSTEM` while retaining the inviter foreign key.

The migration reconstructs old roles using available `CHANGE_USER_ROLE` history, then current account roles where no change evidence exists. Known automatic events, legacy events with no request IP and `executedBy` events are classified as system events. Legacy reconstruction depends on the completeness of stored history; unclassifiable events retain `UNKNOWN` and are excluded from both readers. No original event values or timestamps are rewritten.

Visibility is enforced server-side before all filters, counts, ordering and pagination. The action catalogue uses the same visibility restriction. Optional `actorRole`, `actorId`, `actor` (current name/email search), `targetEntity`, `targetId`, action and date filters can only narrow the permitted scope. Changing an account's current role does not reclassify past events.

Audit responses include `actorFullName`, resolved from the current profile alongside `actorEmail`. The Actor column shows name and email; automatic events show System and their origin email. Details replaces the Metadata heading. UUIDs are hidden in audit table display text, including missing-account and unresolved-reference fallbacks; identifiers and original event payloads remain intact in the API and supported links.

Admin and Manager audit tables show only the record type in Affected record; record names and the Current name annotation are removed from that column. The final column has a blank heading and contains only View details, without record names or summaries. Each button has an accessible event-specific label. The popup contains all displayable event information, rendering creation/deletion values as Field/Value and updates as Field/Before/After, excluding unchanged fields. Reasons are highlighted; cleared values are labelled Removed. Technical operation/report codes and report column names use readable labels. Names prefer recorded snapshots, falling back to available current identity fields; those fallbacks do not replace recorded change values.

## Validation

- PostgreSQL integration tests cover permission matrices, action catalogues, pagination, event roles after current-role changes, real request/background writers, activation deadlines, replaced links and invalid/expired requests.
- Playwright tests cover correcting an email with review, the conditional More button and activation popup, cooldown, expired controls, keyboard focus/Escape, role filters and Admin operational targets without Manager detail links.

Word document edits to reconcile BR-143, FR-16/17/21 and SRS UC-19 are listed in `WORD-DOCS-MANUAL-EDITS.md`.
