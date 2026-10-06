import type { ReactNode } from "react";

export interface MemberPageHeaderProps {
  /** Page title. Greeting pages pass "Hello, <name>". */
  title: string;
  description?: string;
  /** Show today's date under the title (dashboard only). */
  language?: "en" | "vi";
  showDate?: boolean;
  /** Primary action(s) for the page. */
  actions?: ReactNode;
}

/** Page header that sits in <main>, below the sticky nav bar. */
export function MemberPageHeader({
  title,
  description,
  language = "vi",
  showDate = false,
  actions,
}: MemberPageHeaderProps) {
  const date = showDate
    ? new Intl.DateTimeFormat(language === "vi" ? "vi-VN" : "en-GB", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
      }).format(new Date())
    : null;

  return (
    <div className="mx-auto flex w-full max-w-[1280px] flex-col gap-4 px-4 pb-6 pt-8 sm:flex-row sm:items-end sm:justify-between sm:px-6 sm:pt-10">
      <div className="min-w-0">
        {date && (
          <p className="mb-1.5 text-[13px] capitalize text-muted">
            <time dateTime={new Date().toISOString().slice(0, 10)}>{date}</time>
          </p>
        )}
        <h1 className="text-balance text-2xl font-bold leading-tight tracking-tight text-ink sm:text-[28px]">
          {title}
        </h1>
        {description && (
          <p className="mt-1.5 max-w-[65ch] text-sm leading-relaxed text-muted">
            {description}
          </p>
        )}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}
