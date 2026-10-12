"use client";
import pagerStyles from "./list-pager.module.css";
import { type ReactNode } from "react";
import { AppShell } from "@/components/AppShell";
import { useAuth } from "@/lib/auth";
import { useLanguage } from "@/lib/language";
import { canUsePtFeatures } from "@/lib/permissions";
import type { Translations } from "@/locales/en";
import { operationsStyles as styles } from "@/features/operations";
import { PtCoachWorkspaceHeader } from "./pt-coach-workspace";

export function PtPage({
  title,
  manager = false,
  titleText,
  children,
}: {
  title: keyof Translations["staffWork"];
  manager?: boolean;
  titleText?: string;
  children: ReactNode;
}) {
  const { t } = useLanguage();
  const { user } = useAuth();
  return (
    <AppShell
      title={titleText ?? t.staffWork[title]}
      allow={[manager ? "CenterManager" : "Coach"]}
      operationalLayout
    >
      <div className={styles.workspace}>
        {!manager && canUsePtFeatures(user) && <PtCoachWorkspaceHeader />}
        {children}
      </div>
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
