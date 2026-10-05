"use client";

import { useId, useRef, type KeyboardEvent, type ReactNode } from "react";
import styles from "./Tabs.module.css";

export interface TabItem {
  id: string;
  label: ReactNode;
}

export interface TabsProps {
  tabs: TabItem[];
  value: string;
  onChange: (id: string) => void;
  /** Nhãn của cả nhóm tab cho trình đọc màn hình (đã i18n ở nơi gọi). */
  ariaLabel: string;
  /** Nội dung của tab đang chọn. Chỉ tab đang chọn được render. */
  children: ReactNode;
}

/**
 * Tab điều khiển bằng state/URL của trang (An dùng cho `?tab=` ở Tài chính, Gym & PT, Tập luyện…).
 * Roving tabindex + phím mũi tên/Home/End theo mẫu WAI-ARIA; tab không tự đổi URL — nơi gọi quyết định.
 */
export function Tabs({
  tabs,
  value,
  onChange,
  ariaLabel,
  children,
}: TabsProps) {
  const base = useId();
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const active = Math.max(
    0,
    tabs.findIndex((tab) => tab.id === value),
  );

  function onKeyDown(event: KeyboardEvent, index: number) {
    const last = tabs.length - 1;
    const target =
      event.key === "ArrowRight"
        ? index === last
          ? 0
          : index + 1
        : event.key === "ArrowLeft"
          ? index === 0
            ? last
            : index - 1
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? last
              : null;
    if (target === null) return;
    event.preventDefault();
    onChange(tabs[target].id);
    refs.current[target]?.focus();
  }

  return (
    <div>
      <div className={styles.list} role="tablist" aria-label={ariaLabel}>
        {tabs.map((tab, index) => (
          <button
            key={tab.id}
            ref={(node) => {
              refs.current[index] = node;
            }}
            type="button"
            role="tab"
            id={`${base}-tab-${tab.id}`}
            aria-selected={index === active}
            aria-controls={`${base}-panel`}
            tabIndex={index === active ? 0 : -1}
            className={styles.tab}
            onClick={() => onChange(tab.id)}
            onKeyDown={(event) => onKeyDown(event, index)}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div
        role="tabpanel"
        id={`${base}-panel`}
        aria-labelledby={`${base}-tab-${tabs[active]?.id}`}
        className={styles.panel}
      >
        {children}
      </div>
    </div>
  );
}
