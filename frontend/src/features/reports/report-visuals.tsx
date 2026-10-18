"use client";

import { useId, useState, type CSSProperties, type ReactNode } from "react";
import { Stat } from "@/components/ui";
import { formatMoney, formatPoints } from "@/lib/format";
import type { RevenueDimensionsDto } from "@/lib/types";
import { RevenueMix } from "./monthly-analysis-charts";
import styles from "./reports.module.css";

export function ReportPanel({
  title,
  description,
  children,
  className = "",
}: {
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
}) {
  const id = useId();
  return (
    <section
      className={`${styles.analysisPanel} ${className}`}
      aria-labelledby={id}
    >
      <header className={styles.panelHeading}>
        <h2 id={id}>{title}</h2>
        {description && <p>{description}</p>}
      </header>
      {children}
    </section>
  );
}

export function ReportMetrics({
  items,
}: {
  items: { label: string; value: ReactNode; hint?: string }[];
}) {
  return (
    <div
      className={styles.reportMetrics}
      style={{ "--metric-columns": items.length } as CSSProperties}
    >
      {items.map((item) => (
        <Stat key={item.label} {...item} />
      ))}
    </div>
  );
}

export function ReportRecords({
  title,
  count,
  children,
}: {
  title: string;
  count: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <details
      className={styles.records}
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary>
        {title}
        <span>{count}</span>
      </summary>
      {open && children}
    </details>
  );
}

function CollectionsBySport({ report }: { report: RevenueDimensionsDto }) {
  const groups = new Map<
    string,
    { label: string; cash: number; points: number }
  >();
  for (const row of report.rows) {
    const key = row.sportId === null ? "unallocated" : String(row.sportId);
    const item = groups.get(key) ?? {
      label: row.sportName ?? "No sport allocated",
      cash: 0,
      points: 0,
    };
    item.cash += row.cashCollected;
    item.points += row.pointsRedeemed;
    groups.set(key, item);
  }
  const items = Array.from(groups.values()).sort((a, b) => b.cash - a.cash);
  const maximum = Math.max(1, ...items.map((item) => item.cash));
  if (!items.length)
    return (
      <p className={styles.empty}>
        No collections match these filters. Try another period or clear a
        filter.
      </p>
    );
  return (
    <div className={styles.sportChart}>
      <ul>
        {items.map((item) => (
          <li key={item.label}>
            <div className={styles.sportBarHeading}>
              <strong>{item.label}</strong>
              <span>{formatMoney(item.cash)}</span>
            </div>
            <div
              className={styles.sportTrack}
              role="img"
              aria-label={`${item.label}: ${formatMoney(item.cash)} cash collected`}
            >
              <span
                style={{
                  width: `${(Math.max(0, item.cash) / maximum) * 100}%`,
                }}
              />
            </div>
            <p>
              {formatPoints(item.points)} points used ·{" "}
              {formatMoney(item.points * 1000)} equivalent
            </p>
          </li>
        ))}
      </ul>
      <p className={styles.chartNote}>
        Bar lengths compare cash collected. Points remain separate.
      </p>
    </div>
  );
}

export function CollectionCharts({
  report,
  rentals = false,
}: {
  report: RevenueDimensionsDto;
  rentals?: boolean;
}) {
  return (
    <div className={rentals ? styles.singleChart : styles.collectionCharts}>
      {!rentals && (
        <section
          aria-label="Filtered cash by source"
          className={styles.chartSection}
        >
          <h3>Cash by source</h3>
          <RevenueMix
            report={{
              totalCollected: report.cashCollected,
              reconciliationCashCollected: 0,
              bySource: report.rows.map((row) => ({
                source: row.source,
                cashCollected: row.cashCollected,
                pointsRedeemed: row.pointsRedeemed,
              })),
            }}
          />
        </section>
      )}
      <section
        aria-label="Filtered cash by sport"
        className={styles.chartSection}
      >
        <h3>Cash by sport</h3>
        <CollectionsBySport report={report} />
      </section>
    </div>
  );
}
