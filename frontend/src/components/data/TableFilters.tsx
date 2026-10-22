"use client";

import { useRef, type ReactNode } from "react";
import { Funnel } from "lucide-react";
import { useLanguage } from "@/lib/language";
import styles from "./TableFilters.module.css";

export function TableFilters({
  children,
  activeCount = 0,
}: {
  children: ReactNode;
  activeCount?: number;
}) {
  const { t } = useLanguage();
  const details = useRef<HTMLDetailsElement>(null);
  return (
    <details
      ref={details}
      className={styles.root}
      onKeyDown={(event) => {
        if (event.key === "Escape" && details.current?.open) {
          event.stopPropagation();
          details.current.open = false;
          details.current.querySelector("summary")?.focus();
        }
      }}
    >
      <summary
        aria-label={t.common.filter}
        title={t.common.filter}
        className={styles.trigger}
      >
        <Funnel size={20} aria-hidden="true" />
        {activeCount > 0 && <span className={styles.count}>{activeCount}</span>}
      </summary>
      <div className={styles.panel}>{children}</div>
    </details>
  );
}
