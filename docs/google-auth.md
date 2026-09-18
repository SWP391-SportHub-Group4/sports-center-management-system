# Google authentication APIs

Google endpoints use `GoogleAuthController` and `GoogleAuthService`, alongside the
password login/register controller and service from `feat/auth/login`.
`GoogleAuthResponse` has a distinct schema name so Swagger can document both login flows.

## Configuration

Set `GoogleAuth__ClientId` to the Google OAuth web client ID used by the frontend.
The ID is checked against the signed token's audience. No Google client secret is required
for this ID-token flow. Existing `JwtOptions` and PostgreSQL configuration are also required.
If the client ID is absent, these endpoints return 503; other endpoints remain available.

Google verification uses Microsoft's JWT validation libraries and Google's fixed HTTPS
OIDC discovery endpoint, with cached signing keys. It validates signature (RS256), issuer,
audience, expiry and subject. Reference: https://developers.google.com/identity/gsi/web/guides/verify-google-id-token

## Requests

Both endpoints accept JSON `{ "idToken": "<Google ID token>" }`.
Use the Google Identity Services credential from the frontend, not a Google access token.

### POST /api/auth/google

Public. Returns 200 with `{ "userId": "...", "accessToken": "..." }`.
An existing `(Google, sub)` link identifies the account even if its Google email changes.
Without a matching link, an existing email (case insensitive) returns 409 `GOOGLE_LINK_REQUIRED`:
no account or link is created. A new verified email creates an Active Member account,
profile and Google link in one atomic SaveChanges; no password credential is created.

### POST /api/auth/google/link

Requires `Authorization: Bearer <SportHub JWT>` with Member, Coach, Receptionist or
CenterManager role, matching the documented endpoint actors. Returns 204.
The target account comes exclusively from the validated JWT NameIdentifier claim, matching
the current JwtService; request data cannot select another account. The account must still
exist and be Active. Linking the same Google subject again is idempotent. A Google subject
owned by another account, or a different Google subject already linked to the current account,
returns 409. Linking does not change the account email and does not require matching emails:
the caller proves control of both identities via the SportHub JWT and Google ID token.

## Errors and concurrency

- 400: missing/blank/oversized request token (request validation).
- 401: invalid Google token or invalid/missing SportHub JWT for linking.
- 403: inactive account, or missing/unverified email on account creation/linking.
- 409: email/link conflict; concurrent unique-constraint conflicts return `AUTH_CONFLICT`.
- 503: Google client ID not configured or discovery service unavailable.

Unique indexes on email, `(Provider, ProviderUserId)` and `(UserId, Provider)` remain the
final protection against concurrent inserts. A conflict never falls back to automatic linking.
Responses use `{ "error": "CODE", "message": "..." }` for handled auth errors;
ASP.NET request validation uses its standard validation-problem response.

## Verification

Run `dotnet test backend/SportHub.Identity.Tests/SportHub.Identity.Tests.csproj`.
Tests use signed local RSA tokens and SQLite with case-insensitive email collation;
they do not call Google. For end-to-end verification, configure a real client ID and
PostgreSQL, apply existing migrations, and obtain an actual frontend Google credential.
The SQLite tests do not verify PostgreSQL concurrency behavior.
