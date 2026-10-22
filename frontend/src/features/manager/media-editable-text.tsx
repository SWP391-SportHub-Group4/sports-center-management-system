"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./media-editor.module.css";
import { useLandingValues } from "@/components/homepage/landing-content-context";

export function MediaEditableText({
  field,
  label,
  value,
  as = "span",
  id,
  disabled,
  onChange,
  onSelect,
}: {
  field: string;
  label: string;
  value: string;
  as?: "h2" | "h3" | "p" | "span" | "small" | "figcaption";
  id?: string;
  disabled: boolean;
  onChange: (field: string, value: string | undefined) => void;
  onSelect?: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const original = useRef(value);
  const values = useLandingValues();
  const originalOverride = useRef<string | undefined>(undefined);
  const input = useRef<HTMLTextAreaElement>(null);
  const cancelled = useRef(false);
  useEffect(() => {
    if (!editing || !input.current) return;
    input.current.style.height = "0px";
    input.current.style.height = `${input.current.scrollHeight}px`;
  }, [editing, value]);
  useEffect(() => {
    if (editing) {
      input.current?.focus();
      input.current?.select();
    }
  }, [editing]);
  function begin() {
    if (disabled || editing) return;
    original.current = value;
    originalOverride.current = values[field];
    cancelled.current = false;
    setEditing(true);
  }
  function finish() {
    if (cancelled.current) return;
    onChange(
      field,
      !value.trim() || value === original.current
        ? originalOverride.current
        : value.replace(/\r\n?/g, "\n").trim(),
    );
    setEditing(false);
  }
  const Tag = as;
  return (
    <Tag
      id={id}
      className={styles.editableText}
      data-media-field={field}
      data-editing={editing || undefined}
      tabIndex={disabled || editing ? undefined : 0}
      title={disabled ? undefined : `Double-click to edit: ${label}`}
      onClick={() => {
        if (!editing) onSelect?.();
      }}
      onDoubleClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        begin();
      }}
      onKeyDown={(event) => {
        if (!editing && (event.key === "Enter" || event.key === "F2")) {
          event.preventDefault();
          event.stopPropagation();
          begin();
        }
      }}
    >
      {editing ? (
        <textarea
          ref={input}
          aria-label={label}
          title="Enter to finish. Shift+Enter for a new line. Escape to undo."
          className={styles.inlineTextInput}
          value={value}
          maxLength={2000}
          rows={1}
          disabled={disabled}
          onChange={(event) => onChange(field, event.target.value)}
          onClick={(event) => event.stopPropagation()}
          onDoubleClick={(event) => event.stopPropagation()}
          onBlur={finish}
          onKeyDown={(event) => {
            event.stopPropagation();
            if (event.nativeEvent.isComposing) return;
            if (event.key === "Escape") {
              event.preventDefault();
              cancelled.current = true;
              onChange(field, originalOverride.current);
              setEditing(false);
            } else if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              finish();
            }
          }}
        />
      ) : (
        value
      )}
    </Tag>
  );
}
