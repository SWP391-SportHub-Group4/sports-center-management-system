"use client";

import type { StateViewProps } from "@/components/contracts/state";
import { PageHeader } from "@/components/primitives/PageHeader";
import styles from "./Table.module.css";

export function StateView({
  kind,
  title,
  description,
  code,
  action,
  scope = "block",
}: StateViewProps) {
  return (
    <section
      className={`${styles.state} ${scope === "inline" ? styles.inlineState : ""}`}
      aria-busy={kind === "loading" || undefined}
      role={kind === "error" || kind === "conflict" ? "alert" : "status"}
    >
      {scope === "page" ? (
        <PageHeader title={title} as="h2" />
      ) : (
        <h3>{title}</h3>
      )}
      {description && <div className={styles.description}>{description}</div>}
      {code && <code className="small muted">{code}</code>}
      {kind === "loading" ? (
        <div className={styles.skeletonRows} aria-hidden="true">
          {[0, 1, 2].map((row) => (
            <div key={row} className="skeleton" />
          ))}
        </div>
      ) : (
        action && <div>{action}</div>
      )}
    </section>
  );
}
