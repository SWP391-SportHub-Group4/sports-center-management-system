# SportHub component review

Open `/design-review` on the frontend. The page works without signing in or connecting to the backend.

```powershell
cd D:\Roy\sports-center-management-system\frontend
npm run dev
```

Then open <http://localhost:3000/design-review>.

## Reusable public components

The public-facing components live in `src/components/public` and are exported from `@/components/public`:

```tsx
import {
  AccountMenu,
  CourseCard,
  Footer,
  Hero,
  PublicHeader,
  type Course,
} from "@/components/public";
```

- `PublicHeader` accepts navigation links, an account name, and a sign-out callback.
- `Hero` accepts headline, description, image, and CTA props; its defaults match the homepage's Court & Volt direction.
- `CourseCard` accepts the shared `Course` model and a selection callback.
- `AccountMenu` is the same keyboard-aware component used by the application header.
- `Footer` accepts navigation links.

The showcase building blocks are exported from `@/components/design-review`:

```tsx
import {
  AccountForm,
  CheckoutLayout,
  CourseDetail,
  CourseList,
  demoCourses,
} from "@/components/design-review";
```

`CourseList` accepts an `items` prop. `CourseDetail` accepts a course and checkout callback. `AccountForm` supports initial values and an `onSave` callback. `CheckoutLayout` has a `counter` variant for the quầy layout.

## Review flow

1. Use the public header, account menu, hero, and course cards at the top of the page.
2. Filter the list, search by title, and switch its loading, error, and empty states.
3. Select a course to view its detail and disabled/full state.
4. Submit valid or invalid contact information to see form feedback.
5. Toggle points in checkout. In the counter variant, use the sample OTP `123456`.
6. Change checkout status to see when payment actions are blocked.
7. Review the page at 390px and desktop widths.

The page uses the same light Court & Volt tokens, type, and public component treatments as the current homepage. Components use CSS Modules and design tokens; no new UI framework is required.

## Demo boundary

The list data, member identities, point balance, discount, OTP, and checkout statuses are for UI review only. The page makes no API calls and does not create transactions, holds, or persistent form data. Use the real backend quote, balance, confirmation, and expiry data when wiring a production flow.
