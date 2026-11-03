"use client";

import {
  useEffect,
  useId,
  useRef,
  type KeyboardEvent,
  type ReactNode,
} from "react";
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
  /** Opt in to a shared moving selection surface; other tab groups keep their existing behavior. */
  animatedIndicator?: boolean;
}

/**
 * Tab điều khiển bằng state/URL của trang (An dùng cho `?tab=` ở Tài chính, Gym, Tập luyện…).
 * Roving tabindex + phím mũi tên/Home/End theo mẫu WAI-ARIA; tab không tự đổi URL — nơi gọi quyết định.
 */
export function Tabs({
  tabs,
  value,
  onChange,
  ariaLabel,
  children,
  animatedIndicator = false,
}: TabsProps) {
  const base = useId();
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const listRef = useRef<HTMLDivElement>(null);
  const indicatorRef = useRef<HTMLSpanElement>(null);
  const glide = useRef<Animation | null>(null);
  const active = Math.max(
    0,
    tabs.findIndex((tab) => tab.id === value),
  );

  useEffect(() => () => glide.current?.cancel(), [animatedIndicator]);
  useEffect(() => {
    if (!animatedIndicator) return;
    const list = listRef.current;
    const indicator = indicatorRef.current;
    const button = refs.current[active];
    if (!list || !indicator || !button) return;
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const position = (animate: boolean) => {
      const previous = getComputedStyle(indicator).transform;
      const ready = list.dataset.indicatorReady === "true";
      glide.current?.cancel();
      const target = `translate3d(${button.offsetLeft}px, ${button.offsetTop}px, 0)`;
      indicator.style.width = `${button.offsetWidth}px`;
      indicator.style.height = `${button.offsetHeight + 1}px`;
      indicator.style.transform = target;
      list.dataset.indicatorReady = "true";
      if (
        animate &&
        ready &&
        !preference.matches &&
        typeof indicator.animate === "function"
      ) {
        glide.current = indicator.animate(
          [
            { transform: previous === "none" ? target : previous },
            { transform: target },
          ],
          { duration: 340, easing: "cubic-bezier(0.22, 1, 0.36, 1)" },
        );
      }
    };
    position(true);
    let width = list.clientWidth;
    let height = list.clientHeight;
    const observer =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(() => {
            if (width === list.clientWidth && height === list.clientHeight)
              return;
            width = list.clientWidth;
            height = list.clientHeight;
            position(false);
          });
    observer?.observe(list);
    const onPreference = () => position(false);
    preference.addEventListener("change", onPreference);
    return () => {
      observer?.disconnect();
      preference.removeEventListener("change", onPreference);
    };
  }, [active, animatedIndicator]);

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
      <div
        ref={listRef}
        className={styles.list}
        role="tablist"
        aria-label={ariaLabel}
      >
        {animatedIndicator && (
          <span
            ref={indicatorRef}
            className={styles.indicator}
            data-tab-indicator=""
            aria-hidden="true"
          />
        )}
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
