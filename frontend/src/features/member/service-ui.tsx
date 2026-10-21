"use client";

import type { ReactNode } from "react";
import { ServiceEmblem } from "./service-emblem";
import {
  FILTER_LABEL,
  KIND_LABEL,
  SERVICE_KINDS,
  type EmblemKind,
  type ServiceKind,
} from "./service-kinds";
import styles from "./service-ui.module.css";

export function KindTile({
  kind,
  emblem,
  size = 56,
  delay = 0,
}: {
  kind: ServiceKind;
  emblem: EmblemKind;
  size?: number;
  delay?: number;
}) {
  return (
    <span
      className={styles.tile}
      data-kind={kind}
      style={{ width: size + 24, height: size + 24 }}
    >
      <ServiceEmblem kind={emblem} size={size} delay={delay} />
    </span>
  );
}

export function KindBadge({ kind, vi }: { kind: ServiceKind; vi: boolean }) {
  return (
    <span className={styles.badge} data-kind={kind}>
      {KIND_LABEL[kind][vi ? "vi" : "en"]}
    </span>
  );
}

export type FilterValue = "all" | ServiceKind;

export function TypeFilter({
  value,
  onChange,
  counts,
  vi,
  label,
}: {
  value: FilterValue;
  onChange: (next: FilterValue) => void;
  counts?: Partial<Record<FilterValue, number>>;
  vi: boolean;
  label: string;
}) {
  const items: FilterValue[] = ["all", ...SERVICE_KINDS];
  return (
    <div className={styles.filter} role="group" aria-label={label}>
      {items.map((item) => (
        <button
          key={item}
          type="button"
          className={styles.chip}

          aria-pressed={value === item}
          onClick={() => onChange(item)}
        >
          {FILTER_LABEL[item][vi ? "vi" : "en"]}
          {counts?.[item] !== undefined && (
            <span className={styles.count}>{counts[item]}</span>
          )}
        </button>
      ))}
    </div>
  );
}

export type HubView = "owned" | "explore";

export function SubNav({
  view,
  onChange,
  vi,
  ownedCount,
  label,
  labels,
}: {
  view: HubView;
  onChange: (next: HubView) => void;
  vi: boolean;
  ownedCount?: number;
  label: string;
  /** Đổi chữ hai tab (vd. màn quầy: "Member's services" / "Packages"). */
  labels?: { owned: string; explore: string };
}) {
  const items: { id: HubView; text: string; extra?: ReactNode }[] = [
    {
      id: "owned",
      text: labels?.owned ?? (vi ? "Dịch vụ của tôi" : "My services"),
      extra:
        ownedCount === undefined ? null : (
          <span className={styles.count}>{ownedCount}</span>
        ),
    },
    {
      id: "explore",
      text: labels?.explore ?? (vi ? "Khám phá gói" : "Explore packages"),
    },
  ];
  return (
    <nav className={styles.subnav} aria-label={label}>
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          aria-current={view === item.id ? "page" : undefined}
          onClick={() => onChange(item.id)}
        >
          {item.text}
          {item.extra}
        </button>
      ))}
    </nav>
  );
}
