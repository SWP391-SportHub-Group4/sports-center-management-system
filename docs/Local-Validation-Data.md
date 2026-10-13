# Local validation data

The application reads operational data from PostgreSQL through real APIs. Normal startup never seeds or rewrites business data. Existing local records remain unchanged.

## Prepare the local database

Apply migrations first. The validation command refuses a database with pending migrations and never migrates, resets, or deletes it.

If any required account is missing, set `Seed__Password` in the untracked root `.env` to your own strong password (at least 12 characters, uppercase, lowercase, number and symbol). The seed never resets existing passwords, roles, profiles or account states.

Run from the repository root:

```powershell
dotnet run --project backend/SportHub.API/SportHub.API.csproj --launch-profile http -- --seed-validation=true
```

This command only runs in Development against a loopback PostgreSQL host. It exits after seeding and does not start another HTTP server. Concurrent seed runs are serialized with a PostgreSQL advisory lock.

## Minimum records

- Existing accounts are reused by email: `admin@sporthub.vn`, `manager@sporthub.vn`, `letan@sporthub.vn`, `coach.caulong@sporthub.vn`, `coach.bongro@sporthub.vn`, `an.member@sporthub.vn`, `binh.member@sporthub.vn`. Missing accounts are created with their corresponding roles. These are local validation identities, not verified real customers.
- Coach sport assignments for badminton and basketball are added when missing, without removing existing specialties.
- An active 30-day Gym package and Gym room are added only when none exists.
- Two separate validation courts have opening hours. Missing court rates are added without changing existing active rates.
- Two four-session fundamentals courses are created and published through `IClassService`, using its scheduling, occupancy, validation and audit logic. They begin on a Monday at least two weeks ahead. The seed searches for a common free time for all four lessons across the following eight weeks before publishing. Existing classes with the validation codes are not changed or moved on repeated runs.
- Paid invoices, memberships, enrollments, attendance, assessments, wallet balances and rentals are not fabricated. Create these through the real UI/API flows.

If publishing is interrupted, a repeated run can resume only the original unedited validation draft (version 1, matching coach, room, name and lesson count). Edited drafts and existing published classes remain unchanged; resolve them through Manager Classes.

## Integrations

- VNPay always uses the actual provider; its real merchant sandbox can be used for integration checks. The application contains no simulation endpoint or simulation buttons.
- SMTP is required for OTP and email delivery. A missing SMTP configuration produces an unavailable-delivery error; it does not log an OTP and pretend the email was sent. Configure a reachable recipient email through account management when checking delivery; seed account email domains are not delivery guarantees.
- Google, Cloudinary and Gemini continue to use their configured integrations. An absent key or integration error is not replaced with fictitious successful results.
- Homepage counts and facility names come from `GET /api/public/overview`. Missing coach photos use an icon, not another person's portrait. Community artwork remains illustrative media, not database evidence.
- Business contact information comes from `PublicContact__Phone`, `PublicContact__Email`, `PublicContact__Address`, `PublicContact__Hours`. Empty values are not replaced with fictional contact information.

Legacy seed scenarios and the payment simulation controller now live solely in the integration-test project. They are excluded from the deployed API. Automated test infrastructure remains available for existing tests.
