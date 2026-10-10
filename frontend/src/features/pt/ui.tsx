"use client";
import pagerStyles from "./list-pager.module.css";
import { type ReactNode } from "react";
import { AppShell } from "@/components/AppShell";
import { useAuth } from "@/lib/auth";
import { useLanguage } from "@/lib/language";
import { canUsePtFeatures } from "@/lib/permissions";
import type { Translations } from "@/locales/en";
import { operationsStyles as styles } from "@/features/operations";

export function PtPage({
  title,
  manager = false,
  children,
}: {
  title: keyof Translations["staffWork"];
  manager?: boolean;
  children: ReactNode;
}) {
  const { t } = useLanguage();
  return (
    <AppShell
      title={t.staffWork[title]}
      allow={[manager ? "CenterManager" : "Coach"]}
      operationalLayout
    >
      <div className={styles.workspace}>{children}</div>
    </AppShell>
  );
}
export function Specialty({
  children,
}: {
  children: (hasPt: boolean) => ReactNode;
}) {
  const { user } = useAuth();
  return <>{children(canUsePtFeatures(user))}</>;
}
export function ListPager({
  page,
  count,
  onChange,
  align = "right",
}: {
  page: number;
  count: number;
  align?: "left" | "right";
  onChange: (page: number) => void;
}) {
  const { t } = useLanguage();
  return (
    <nav
      className={`${pagerStyles.pagination} ${align === "left" ? pagerStyles.left : ""}`}
      aria-label={t.dataTable.pagination}
    >
      <button
        type="button"
        className="btn btn--secondary"
        disabled={page <= 1}
        onClick={() => onChange(page - 1)}
      >
        {t.wallet.previous}
      </button>
      <span className={pagerStyles.page} aria-live="polite">
        {t.common.pageLabel} {page}
      </span>
      <button
        type="button"
        className="btn btn--secondary"
        disabled={count < 20}
        onClick={() => onChange(page + 1)}
      >
        {t.wallet.next}
      </button>
    </nav>
  );
}
