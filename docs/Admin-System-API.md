# System Administrator API — implementation note

This implementation follows the current project sources with the Source-of-Truth / Business Rules taking precedence over the SRS.

## Confirmed Admin responsibilities

- BR-2: only `SystemAdministrator` creates internal accounts (`SystemAdministrator`, `CenterManager`, `Coach`, `Receptionist`) and assigns/changes their role.
- BR-6: only `SystemAdministrator` changes account status; self-lock is forbidden and the final active System Administrator must remain available.
- BR-7: sensitive administration actions are written to `AuditLog`; status changes include a reason.
- BR-49: email uniqueness is case-insensitive (`citext` in the current model).
- Roles are fixed seed data; there is no create/delete-role API.

## Added endpoints

| Method | Endpoint | Access | Purpose |
|---|---|---|---|
| GET | `/api/admin/users` | System Administrator | Paged account list; optional `search`, `role`, `status` filters |
| GET | `/api/admin/users/{userId}` | System Administrator | Account detail |
| GET | `/api/admin/roles` | System Administrator | Read the 5 fixed seeded roles |
| POST | `/api/users/staff` | System Administrator | Create an internal account |
| PUT | `/api/users/{userId}/role` | System Administrator | Change the internal account role |
| PUT | `/api/users/{userId}/status` | System Administrator | ACTIVE/BANNED/DEACTIVATED |

### POST `/api/users/staff`

```json
{
  "email": "coach01@sporthub.local",
  "password": "ChangeMe123!",
  "fullName": "Coach One",
  "phone": "0900000001",
  "role": "COACH"
}
```

Accepted role values: `SYSTEM_ADMINISTRATOR`, `CENTER_MANAGER`, `COACH`, `RECEPTIONIST`.
`MEMBER` creation remains in the Member self-registration / Receptionist front-desk flow.

### PUT `/api/users/{userId}/role`

```json
{
  "role": "CENTER_MANAGER",
  "reason": "Promoted to center manager"
}
```

### PUT `/api/users/{userId}/status`

```json
{
  "status": "BANNED",
  "reason": "Administrative suspension"
}
```

Accepted statuses: `ACTIVE`, `BANNED`, `DEACTIVATED`.

## Important project gap

The repository currently contains JWT infrastructure but does not yet contain the committed `/api/auth/login` implementation. These Admin endpoints therefore require a valid JWT carrying:

- `ClaimTypes.NameIdentifier` = Admin `UserId`
- `ClaimTypes.Role` = `SystemAdministrator`

The authentication/login API should be completed by the Identity/RBAC flow before these endpoints are exercised end-to-end from Swagger/frontend.

## Audit Log endpoint not added yet

The SRS assigns `System Monitoring & Audit Log` to System Administrator, but `docs/00-Source-of-Truth.md` still marks the permission to *view* Audit Log as an open question and Design v2 RBAC keeps it unresolved (`?`). Because the Source-of-Truth has higher precedence, this implementation logs Admin changes but does **not** expose `/api/admin/audit-logs` yet. Add that endpoint only after the team closes the open question / updates the authoritative documents.

## Immediate ban / role-change enforcement

A database-backed `CurrentAccountGuardMiddleware` is added after JWT authentication and before authorization. It checks the current `UserAccount.Status` and role on every authenticated request. This closes two important gaps of pure stateless JWT authentication:

- an already-issued token can no longer continue after the Admin bans/deactivates its account;
- a token carrying an old role is rejected after the Admin changes that account's role, forcing the user to sign in again.
