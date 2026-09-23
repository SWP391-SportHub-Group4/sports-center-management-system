# SportHub Member frontend

Next.js App Router + React + TypeScript. Run `npm ci`, then `npm run dev`; open `/member`. `npm run build`, `npm run typecheck`, `npm run lint`, and `npm run test:e2e` validate the implementation. Browser tests use installed Microsoft Edge (`channel: msedge`).

## Architecture

- `src/app`: thin routes and framework boundaries only.
- `src/application/member`: composes the Member role, navigation, providers and repository port. Add another role here with its own routes/provider; do not branch every feature on role names.
- `src/features/{identity,scheduling,membership,coaches,training,notifications,check-in,news}`: independent feature models and views. Public entry points are `index.ts`. Views take typed props/callbacks and do not depend on application or infrastructure. ESLint enforces those dependency boundaries.
- `src/shared`: role-neutral UI, accessible dialog, design tokens and date/format helpers.
- `src/infrastructure/demo`: replaceable demo repository. Production data belongs in a separate adapter implementing `MemberRepository`; server authorization and transactions must remain on the backend.

## Current integration boundary

Backend currently exposes only `HealthController`. This delivery is an interactive Member frontend using clearly identified demo data, not a completed authentication/payment integration. Demo actions persist locally when storage is available and otherwise last for the current session. No passwords, access tokens, or real payment details are stored. Membership requests create pending packages/invoices only, never activate paid access.

QR codes encode explicitly marked demo data and rotate every 60 seconds. They are not valid entrance credentials. Replace the injected `QrPassIssuer` with a server-authorized, signed, expiring pass API before using real check-in. The backend must bind self actions to JWT identity, enforce capacity/credit transactions, and provide current cancellation deadlines (the demo seed contains illustrative deadlines).

Core reference: `docs/Requirements.md`, `docs/00-Source-of-Truth.md`, `docs/Center-Management-System-Design-v2.md`. Figma: `fb7fsYbC89R5XfpbawXWLf`, calendar `72:510`, mobile home `100:334`. Exact SVG assets downloaded from Figma are in `public/sporthub`.

## Accessibility and responsive behavior

390px Figma mobile and 768px tablet are implemented fluidly, with tests down to 320px. Desktop navigation begins at 1024px; the calendar becomes a seven-column view. Below that it is an agenda. Uses semantic landmarks, a skip link, native form labels, visible focus, 44px controls, selected-state text, live result messages, and native modal focus containment/Escape restoration. News advances manually; QR countdown does not announce each second. Roboto and the six design-system colors are local tokens.

Dependencies follow the main branch: Next 16, React 19 and ESLint 9. Use npm and commit package-lock.json; Docker installs with npm ci. No deployment is performed by this change.

