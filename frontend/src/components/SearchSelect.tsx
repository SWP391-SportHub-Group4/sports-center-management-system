"use client";

import { useId, useState } from "react";
import { useLanguage } from "@/lib/language";
import styles from "./SearchSelect.module.css";

const normalize = (text: string) =>
  text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/gi, "d")
    .toLowerCase()
    .trim();

export function SearchSelect({
  items,
  value,
  onChange,
  required = false,
  label,
  placeholder,
}: {
  items: { value: string; label: string }[];
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  label: string;
  placeholder: string;
}) {
  const { t } = useLanguage();
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState<string | null>(null);
  const [active, setActive] = useState(-1);
  const selected = items.find((room) => String(room.value) === value);
  const matches = items.filter((room) =>
    normalize(room.label).includes(normalize(query ?? "")),
  );
  const options = [
    { value: "", label: "—" },
    ...matches.map((room) => ({
      value: String(room.value),
      label: room.label,
    })),
  ];
  const activeIndex = active >= 0 && active < options.length ? active : -1;

  function choose(value: string) {
    onChange(value);
    setQuery(null);
    setOpen(false);
    setActive(-1);
  }

  return (
    <div className={styles.control}>
      <input
        type="text"
        role="combobox"
        aria-label={label}
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-activedescendant={
          open && activeIndex >= 0 ? `${listId}-${activeIndex}` : undefined
        }
        autoComplete="off"
        required={required}
        placeholder={placeholder}
        value={query ?? selected?.label ?? ""}
        onFocus={() => {
          setOpen(true);
          setActive(-1);
        }}
        onClick={() => setOpen(true)}
        onBlur={() => {
          setOpen(false);
          setQuery(null);
          setActive(-1);
        }}
        onChange={(event) => {
          setQuery(event.target.value);
          setOpen(true);
          setActive(-1);
        }}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            setOpen(true);
            const next =
              event.key === "ArrowDown"
                ? (activeIndex + 1) % options.length
                : (activeIndex <= 0 ? options.length : activeIndex) - 1;
            setActive(next);
            document
              .getElementById(`${listId}-${next}`)
              ?.scrollIntoView({ block: "nearest" });
          } else if (event.key === "Enter" && open) {
            event.preventDefault();
            if (activeIndex >= 0) choose(options[activeIndex].value);
            else if (query?.trim() && matches.length === 1)
              choose(String(matches[0].value));
          } else if (event.key === "Escape" && open) {
            event.preventDefault();
            event.stopPropagation();
            setOpen(false);
            setQuery(null);
            setActive(-1);
          }
        }}
      />
      {open && (
        <div className={styles.panel}>
          <ul id={listId} role="listbox" aria-label={label}>
            {options.map((room, index) => (
              <li
                key={room.value}
                id={`${listId}-${index}`}
                role="option"
                aria-selected={value === room.value}
                data-active={activeIndex === index}
                onMouseDown={(event) => event.preventDefault()}
                onMouseMove={() => setActive(index)}
                onClick={(event) => {
                  event.preventDefault();
                  choose(room.value);
                }}
              >
                {room.label}
              </li>
            ))}
          </ul>
          {!matches.length && <p role="status">{t.common.noData}</p>}
        </div>
      )}
    </div>
  );
}
