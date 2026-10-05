import type { SVGProps, ReactNode } from "react";

/** Courtline: authored on a 24-unit court grid, 1.8-unit strokes, open corners.
 * Decorative by default; the adjacent control text supplies the accessible name.
 */
const shapes: Record<string, ReactNode> = {
  gym: (
    <>
      <path d="M3 9v6m3-9v12m12-12v12m3-9v6M6 12h12" />
      <path d="M3 9h3m12 0h3M3 15h3m12 0h3" />
    </>
  ),
  badminton: (
    <>
      <path d="m9 15-4-9 4-2 6 1 5 4-7 8M5 6l8 11M9 4l4 13m2-12-2 12m7-8-7 8" />
      <path d="m9 15-3 3a3 3 0 0 0 4 4l3-5" />
    </>
  ),
  basketball: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3v18M6 5c7 4 7 10 0 14M18 5c-7 4-7 10 0 14" />
    </>
  ),
  calendar: (
    <>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M7 3v4m10-4v4M3 10h18M7 15h3m4 0h3m-10 3h3" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 6v6l4 2" />
    </>
  ),
  location: (
    <>
      <path d="M19 10c0 6-7 11-7 11S5 16 5 10a7 7 0 1 1 14 0Z" />
      <circle cx="12" cy="10" r="2" />
    </>
  ),
  wallet: (
    <>
      <path d="M20 8V5H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h15v-6M3 8h18v7h-6a3 3 0 0 1 0-6h6" />
      <path d="M16 12h1" />
    </>
  ),
  shield: (
    <>
      <path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6l8-3Z" />
      <path d="m8 12 3 3 5-6" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="7" r="4" />
      <path d="M4 21v-3a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v3M8 21v-3m8 3v-3" />
    </>
  ),
  arrow: (
    <>
      <path d="M4 12h16m-6-6 6 6-6 6" />
    </>
  ),
  diagonal: (
    <>
      <path d="M5 19 19 5M7 5h12v12" />
    </>
  ),
  chevron: <path d="m6 9 6 6 6-6" />,
  menu: <path d="M4 6h16M4 12h12M4 18h16" />,
  close: <path d="m6 6 12 12M6 18 18 6" />,
  logout: (
    <>
      <path d="M9 4H4v16h5m-1-8h13m-5-5 5 5-5 5" />
    </>
  ),
  search: (
    <>
      <circle cx="10" cy="10" r="6" />
      <path d="m15 15 6 6" />
    </>
  ),
  receipt: (
    <>
      <path d="M5 3h14v18l-3-2-4 2-4-2-3 2V3Z" />
      <path d="M9 8h6m-6 4h6m-6 4h3" />
    </>
  ),
  check: <path d="m4 12 5 5L20 6" />,
  refresh: (
    <>
      <path d="M20 9a8 8 0 0 0-14-4L3 8m0-5v5h5M4 15a8 8 0 0 0 14 4l3-3m0 5v-5h-5" />
    </>
  ),
  alert: (
    <>
      <path d="m12 3 10 18H2L12 3Z" />
      <path d="M12 9v5m0 3v1" />
    </>
  ),
  mail: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m3 6 9 7 9-7" />
    </>
  ),
};

export type CourtIconName =
  | "gym"
  | "badminton"
  | "basketball"
  | "calendar"
  | "clock"
  | "location"
  | "wallet"
  | "shield"
  | "user"
  | "arrow"
  | "diagonal"
  | "chevron"
  | "menu"
  | "close"
  | "logout"
  | "search"
  | "receipt"
  | "check"
  | "refresh"
  | "alert"
  | "mail";
export const courtIconNames = Object.keys(shapes) as CourtIconName[];
export function CourtIcon({
  name,
  size = 24,
  ...props
}: SVGProps<SVGSVGElement> & { name: CourtIconName; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      style={{ flexShrink: 0, verticalAlign: "middle" }}
      {...props}
    >
      {shapes[name]}
    </svg>
  );
}
