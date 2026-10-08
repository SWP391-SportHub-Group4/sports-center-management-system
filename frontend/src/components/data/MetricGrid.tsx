import type { CSSProperties, ReactNode } from "react";
import Link from "next/link";
import styles from "./MetricGrid.module.css";

/** Related metrics share one surface. Columns adapt to the available container. */
export function MetricGrid({
  children,
  columns = 4,
}: {
  children: ReactNode;
  /** Maximum columns on a wide container; use the actual count for short groups. */
  columns?: 2 | 3 | 4;
}) {
  return (
    <div className={styles.container}>
      <div
        className={styles.grid}
        style={{ "--metric-columns": columns } as CSSProperties}
      >
        {children}
      </div>
    </div>
  );
}

/** A label/value pair with an optional explanation or destination. */
export function Metric({
  label,
  value,
  hint,
  href,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  href?: string;
}) {
  return (
    <dl className={`${styles.metric} ${href ? styles.linked : ""}`}>
      <dt>{href ? <Link href={href}>{label}</Link> : label}</dt>
      <dd>
        <div className={styles.value}>{value}</div>
        {hint && <div className={styles.hint}>{hint}</div>}
      </dd>
    </dl>
  );
}
