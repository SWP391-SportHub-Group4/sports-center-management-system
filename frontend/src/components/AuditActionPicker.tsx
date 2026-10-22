"use client";

import { useEffect, useId, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { Input } from "@/components/primitives/Controls";
import { useLanguage } from "@/lib/language";
import type { AsyncState } from "@/lib/useApi";
import { auditActionLabel } from "@/features/administration/audit-action-label";
import styles from "./AuditActionPicker.module.css";

function actionLabel(action: string) {
  const parts = action.split("_");
  return parts.map((part, index) => (
    <span key={index}>
      {part}
      {index < parts.length - 1 && (
        <>
          _<wbr />
        </>
      )}
    </span>
  ));
}

export function AuditActionPicker({
  id,
  value,
  onChange,
  actions,
  errorId,
  humanReadable = false,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  actions: AsyncState<string[]>;
  errorId?: string;
  humanReadable?: boolean;
}) {
  const { t } = useLanguage();
  const l = t.filterBar;
  const listId = useId();
  const input = useRef<HTMLInputElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [searching, setSearching] = useState(false);
  const [position, setPosition] = useState<CSSProperties>({});
  const keywords = searching
    ? value.toLowerCase().replaceAll("_", " ").split(/\s+/).filter(Boolean)
    : [];
  const available = Array.isArray(actions.data) ? [...actions.data] : [];
  if (humanReadable)
    available.sort(
      (a, b) =>
        auditActionLabel(a).localeCompare(auditActionLabel(b)) ||
        a.localeCompare(b),
    );
  const matches = available.filter((action) => {
    const text =
      `${action.replaceAll("_", " ")}${humanReadable ? ` ${auditActionLabel(action)}` : ""}`.toLowerCase();
    return keywords.every((keyword) => text.includes(keyword));
  });
  const options = searching && value.trim() ? matches : ["", ...matches];
  const activeOption = active >= 0 && active < options.length ? active : -1;

  useEffect(() => {
    if (!open) return;
    const place = () => {
      const rect = input.current?.getBoundingClientRect();
      if (!rect) return;
      const below = window.innerHeight - rect.bottom - 12;
      const above = rect.top - 12;
      const showAbove = below < 180 && above > below;
      const width = Math.min(rect.width, window.innerWidth - 16);
      setPosition({
        left: Math.max(8, Math.min(rect.left, window.innerWidth - width - 8)),
        width,
        maxHeight: Math.max(80, Math.min(320, showAbove ? above : below)),
        ...(showAbove
          ? { bottom: window.innerHeight - rect.top + 4 }
          : { top: rect.bottom + 4 }),
      });
    };
    const outside = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!input.current?.contains(target) && !panel.current?.contains(target))
        setOpen(false);
    };
    place();
    document.addEventListener("pointerdown", outside);
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      document.removeEventListener("pointerdown", outside);
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open]);

  useEffect(() => {
    if (open && activeOption >= 0)
      document
        .getElementById(`${listId}-${activeOption}`)
        ?.scrollIntoView({ block: "nearest" });
  }, [open, activeOption, listId]);

  function choose(action: string) {
    onChange(action);
    setOpen(false);
    setActive(-1);
    setSearching(false);
    input.current?.focus();
  }

  return (
    <div className={styles.control}>
      <Input
        ref={input}
        id={id}
        name="action"
        type="search"
        role="combobox"
        autoComplete="off"
        aria-autocomplete="list"
        aria-invalid={errorId ? true : undefined}
        aria-describedby={errorId}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={
          open && !actions.loading && !actions.error ? listId : undefined
        }
        aria-activedescendant={
          open && activeOption >= 0 ? `${listId}-${activeOption}` : undefined
        }
        placeholder={l.actionPlaceholder}
        value={
          humanReadable && !searching && available.includes(value)
            ? auditActionLabel(value)
            : value
        }
        onFocus={() => {
          setSearching(false);
          setOpen(true);
        }}
        onClick={() => {
          setSearching(false);
          setOpen(true);
        }}
        onBlur={() => {
          setOpen(false);
          if (available.includes(value)) setSearching(false);
        }}
        onChange={(event) => {
          onChange(event.target.value);
          setActive(-1);
          setSearching(true);
          setOpen(true);
        }}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            setOpen(true);
            if (options.length)
              setActive(
                event.key === "ArrowDown"
                  ? (activeOption + 1) % options.length
                  : activeOption <= 0
                    ? options.length - 1
                    : activeOption - 1,
              );
          } else if (event.key === "Enter" && open && actions.error) {
            event.preventDefault();
            actions.reload();
          } else if (event.key === "Enter" && open && activeOption >= 0) {
            event.preventDefault();
            choose(options[activeOption]);
          } else if (event.key === "Escape" && open) {
            event.preventDefault();
            event.stopPropagation();
            setOpen(false);
            setActive(-1);
          } else if (event.key === "Tab") setOpen(false);
        }}
      />
      {open &&
        createPortal(
          <div ref={panel} className={styles.panel} style={position}>
            {actions.loading ? (
              <p role="status">{t.common.loading}</p>
            ) : actions.error ? (
              <div role="alert" className={styles.error}>
                <span>{l.actionsUnavailable}</span>
                <button
                  type="button"
                  className="btn btn--ghost"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={actions.reload}
                >
                  {t.common.retry}
                </button>
              </div>
            ) : (
              <>
                <div id={listId} role="listbox" aria-label={t.staffWork.action}>
                  {options.map((action, index) => (
                    <button
                      key={action}
                      id={`${listId}-${index}`}
                      type="button"
                      role="option"
                      tabIndex={-1}
                      aria-selected={value === action}
                      aria-label={
                        action
                          ? humanReadable
                            ? auditActionLabel(action)
                            : action
                          : l.allActions
                      }
                      title={humanReadable && action ? action : undefined}
                      className={styles.option}
                      data-active={activeOption === index}
                      onMouseDown={(event) => event.preventDefault()}
                      onPointerMove={() => setActive(index)}
                      onClick={() => choose(action)}
                    >
                      {action
                        ? humanReadable
                          ? auditActionLabel(action)
                          : actionLabel(action)
                        : l.allActions}
                    </button>
                  ))}
                </div>
                {!matches.length && (
                  <p role="status">
                    {available.length ? l.noMatchingActions : l.noActions}
                  </p>
                )}
              </>
            )}
          </div>,
          document.body,
        )}
    </div>
  );
}
