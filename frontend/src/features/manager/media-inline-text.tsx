"use client";

import { useLayoutEffect, useRef, useState } from "react";
import styles from "./media-editor.module.css";

/** Plain text only: editing never introduces markup into the published content. */
export function MediaInlineText({
  as: Tag = "span",
  id,
  field,
  label,
  value,
  disabled,
  className = "",
  onChange,
  onSelect,
}: {
  as?: "h2" | "h3" | "p" | "span" | "small" | "figcaption";
  id?: string;
  field: string;
  label: string;
  value: string;
  disabled: boolean;
  className?: string;
  onChange: (key: string, value: string) => void;
  onSelect?: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState("");
  const original = useRef(value);
  const active = useRef(false);
  const input = useRef<HTMLTextAreaElement>(null);
  const view = useRef<HTMLSpanElement>(null);
  const begin = () => {
    if (disabled || active.current) return;
    original.current = value;
    active.current = true;
    setError("");
    setEditing(true);
    window.getSelection()?.removeAllRanges();
  };
  const finish = (cancel = false, restoreFocus = false) => {
    if (!active.current) return;
    active.current = false;
    if (cancel || !value.trim()) {
      onChange(field, original.current);
      if (!cancel) setError("Text cannot be empty. Previous text restored.");
    }
    setEditing(false);
    if (restoreFocus)
      requestAnimationFrame(() => view.current?.focus({ preventScroll: true }));
  };
  useLayoutEffect(() => {
    if (!editing || !input.current) return;
    input.current.style.height = "0px";
    input.current.style.height = `${input.current.scrollHeight}px`;
  }, [editing, value]);
  return (
    <Tag
      id={id}
      aria-label={Tag === "h2" || Tag === "h3" ? value : undefined}
      className={`${className} ${styles.inlineText}`}
      data-media-field={field}
    >
      {editing ? (
        <textarea
          ref={input}
          autoFocus
          className={styles.inlineInput}
          aria-label={`Edit ${label}`}
          aria-describedby="media-inline-help"
          value={value}
          maxLength={2000}
          rows={1}
          disabled={disabled}
          onChange={(event) => onChange(field, event.target.value)}
          onClick={(event) => event.stopPropagation()}
          onBlur={() => finish()}
          onKeyDown={(event) => {
            if (event.nativeEvent.isComposing) return;
            if (event.key === "Escape") {
              event.preventDefault();
              event.stopPropagation();
              finish(true, true);
            } else if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              finish(false, true);
            }
          }}
        />
      ) : (
        <span
          ref={view}
          className={styles.inlineView}
          role="button"
          tabIndex={disabled ? -1 : 0}
          aria-disabled={disabled || undefined}
          aria-label={`Edit ${label}`}
          aria-describedby="media-inline-help"
          title="Double-click to edit"
          onClick={() => onSelect?.()}
          onDoubleClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            begin();
          }}
          onPointerUp={(event) => {
            if (event.pointerType === "touch") begin();
          }}
          onKeyDown={(event) => {
            if (["Enter", " ", "F2"].includes(event.key)) {
              event.preventDefault();
              event.stopPropagation();
              begin();
            }
          }}
        >
          {value}
        </span>
      )}
      {error && (
        <span className={styles.inlineError} role="status">
          {error}
        </span>
      )}
    </Tag>
  );
}
