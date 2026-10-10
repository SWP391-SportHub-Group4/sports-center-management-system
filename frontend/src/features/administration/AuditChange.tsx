"use client";

import { useLanguage } from "@/lib/language";
import { ArrowRight } from "lucide-react";
import styles from "./AuditChange.module.css";

/** Missing snapshot fields are unknown, not evidence that a value was deleted. */
export function AuditChange({
  label,
  before,
  after,
  comparison = false,
}: {
  label: string;
  before?: string;
  after?: string;
  comparison?: boolean;
}) {
  const { t } = useLanguage();
  const both = comparison && before !== undefined && after !== undefined;
  return (
    <p className={styles.change}>
      <span className={styles.label}>{label}: </span>
      <span className={styles.values}>
        {before !== undefined && (both || after === undefined) && (
          <span className={styles.value}>
            {comparison && (
              <span className={styles.caption}>{t.auditChanges.before}: </span>
            )}
            {both ? <del>{before}</del> : <span>{before}</span>}
          </span>
        )}
        {both && (
          <ArrowRight className={styles.arrow} size={14} aria-hidden="true" />
        )}
        {after !== undefined && (
          <span className={styles.value}>
            {comparison && (
              <span className={styles.caption}>{t.auditChanges.after}: </span>
            )}
            <strong>{after}</strong>
          </span>
        )}
      </span>
    </p>
  );
}
