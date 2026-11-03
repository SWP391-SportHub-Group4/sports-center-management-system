"use client";

import { useEffect, useId, useRef, useState, type CSSProperties } from "react";
import { Check, ChevronDown, Search } from "lucide-react";
import styles from "./point-gifts.module.css";

type ClassOption = { classId: number; name: string; code: string };

export function GiftClassFilter({
  value,
  onChange,
  classes,
  disabled,
  vi,
}: {
  value: string;
  onChange: (value: string) => void;
  classes: ClassOption[];
  disabled: boolean;
  vi: boolean;
}) {
  const id = useId();
  const panel = useRef<HTMLDivElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [keyword, setKeyword] = useState("");
  const [position, setPosition] = useState<CSSProperties>({
    top: 0,
    left: 0,
    width: 0,
    maxHeight: 360,
  });
  const normalize = (text: string) =>
    text
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/đ/g, "d")
      .toLowerCase();
  const options = classes.filter((item) =>
    normalize(`${item.name} ${item.code}`).includes(normalize(keyword.trim())),
  );
  const selected = classes.find((item) => String(item.classId) === value);
  const allLabel = vi ? "Tất cả lớp học" : "All classes";

  useEffect(() => {
    if (!open) return;
    const close = (event: Event) => {
      if (event.target instanceof Node && panel.current?.contains(event.target))
        return;
      panel.current?.hidePopover();
    };
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [open]);

  function choose(next: string) {
    onChange(next);
    panel.current?.hidePopover();
    trigger.current?.focus();
  }

  return (
    <div className={styles.classFilter}>
      <label htmlFor={`${id}-trigger`}>{vi ? "Lớp học" : "Class"}</label>
      <button
        ref={trigger}
        id={`${id}-trigger`}
        type="button"
        className={styles.classTrigger}
        disabled={disabled}
        popoverTarget={id}
        aria-expanded={open}
        aria-controls={id}
        onClick={() => {
          const rect = trigger.current!.getBoundingClientRect();
          const height = Math.min(360, window.innerHeight - 32);
          const below = window.innerHeight - rect.bottom;
          const above = below < Math.min(height, 240) && rect.top > below;
          setPosition({
            ...(above
              ? { bottom: window.innerHeight - rect.top + 6 }
              : { top: rect.bottom + 6 }),
            left: Math.max(
              8,
              Math.min(rect.left, window.innerWidth - rect.width - 8),
            ),
            width: Math.min(rect.width, window.innerWidth - 16),
            maxHeight: Math.max(
              80,
              Math.min(height, (above ? rect.top : below) - 14),
            ),
          });
        }}
      >
        <span>
          {selected ? `${selected.name} · ${selected.code}` : allLabel}
        </span>
        <ChevronDown size={18} aria-hidden="true" />
      </button>
      <div
        id={id}
        ref={panel}
        popover="auto"
        className={styles.classPopover}
        style={position}
        onToggle={(event) => {
          const visible = event.newState === "open";
          setOpen(visible);
          if (visible) {
            setKeyword("");
            search.current?.focus({ preventScroll: true });
          }
        }}
      >
        <div className={styles.classSearch}>
          <Search size={18} aria-hidden="true" />
          <input
            ref={search}
            type="search"
            aria-label={vi ? "Tìm lớp học" : "Search classes"}
            placeholder={
              vi ? "Tìm tên hoặc mã lớp…" : "Search class name or code…"
            }
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
          />
        </div>
        <div
          className={styles.classOptions}
          role="group"
          aria-label={vi ? "Các lớp học" : "Classes"}
        >
          <button
            type="button"
            aria-pressed={!value}
            onClick={() => choose("")}
          >
            <span>{allLabel}</span>
            {!value && <Check size={18} aria-hidden="true" />}
          </button>
          {options.map((item) => (
            <button
              key={item.classId}
              type="button"
              aria-pressed={value === String(item.classId)}
              onClick={() => choose(String(item.classId))}
            >
              <span>
                {item.name}
                <small>{item.code}</small>
              </span>
              {value === String(item.classId) && (
                <Check size={18} aria-hidden="true" />
              )}
            </button>
          ))}
          {!options.length && (
            <p>{vi ? "Không tìm thấy lớp học." : "No classes found."}</p>
          )}
        </div>
      </div>
    </div>
  );
}
