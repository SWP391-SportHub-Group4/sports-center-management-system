"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useLanguage, type Language } from "@/lib/language";
import styles from "./LanguageSwitcher.module.css";

function Flag({ language }: { language: Language }) {
  return (
    <svg
      className={styles.flag}
      viewBox="0 0 60 40"
      aria-hidden="true"
      focusable="false"
    >
      {language === "en" ? (
        <g transform="scale(1 1.333333)">
          <path fill="#012169" d="M0 0h60v30H0z" />
          <path stroke="#fff" strokeWidth="6" d="m0 0 60 30M60 0 0 30" />
          <path
            fill="#c8102e"
            d="M0 0h4.472L30 12.764V15zm60 0v2.236L34.472 15H30zM0 30v-2.236L25.528 15H30zm60 0h-4.472L30 17.236V15z"
          />
          <path stroke="#fff" strokeWidth="10" d="M30 0v30M0 15h60" />
          <path stroke="#c8102e" strokeWidth="6" d="M30 0v30M0 15h60" />
        </g>
      ) : (
        <>
          <path fill="#da251d" d="M0 0h60v40H0z" />
          <path
            fill="#ffff00"
            d="m30 8 2.7 8.3h8.7l-7 5.1 2.7 8.3-7.1-5.1-7.1 5.1 2.7-8.3-7-5.1h8.7z"
          />
        </>
      )}
    </svg>
  );
}

/** Compact flag selector; the native popover escapes header/drawer clipping. */
export function LanguageSwitcher({ onSelect }: { onSelect?: () => void }) {
  const { language, setLanguage, t } = useLanguage();
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const alternative: Language = language === "en" ? "vi" : "en";

  const positionMenu = useCallback(() => {
    if (!trigger.current || !menu.current) return;
    const rect = trigger.current.getBoundingClientRect();
    const width = Math.max(rect.width, 80);
    menu.current.style.width = `${width}px`;
    menu.current.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - width - 8))}px`;
    const height = menu.current.offsetHeight;
    menu.current.style.top = `${rect.bottom + height > window.innerHeight - 8 ? rect.top - height : rect.bottom}px`;
  }, []);

  function showMenu() {
    menu.current?.showPopover();
    positionMenu();
    menu.current?.querySelector<HTMLButtonElement>("button")?.focus();
  }

  useEffect(() => {
    if (!open) return;
    window.addEventListener("resize", positionMenu);
    window.addEventListener("scroll", positionMenu, true);
    return () => {
      window.removeEventListener("resize", positionMenu);
      window.removeEventListener("scroll", positionMenu, true);
    };
  }, [open, positionMenu]);

  return (
    <div className={styles.root}>
      <button
        ref={trigger}
        type="button"
        className={styles.trigger}
        data-testid="language-switcher-trigger"
        aria-label={t.navigation.languageSelector}
        aria-haspopup="menu"
        aria-controls={menuId}
        aria-expanded={open}
        onClick={() => (open ? menu.current?.hidePopover() : showMenu())}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            showMenu();
          }
        }}
      >
        <Flag language={language} />
        <span>{language.toUpperCase()}</span>
        <svg
          className={styles.arrow}
          width="10"
          height="10"
          viewBox="0 0 20 20"
          fill="none"
          aria-hidden="true"
        >
          <path d="m5 7.5 5 5 5-5" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      </button>
      <div
        ref={menu}
        id={menuId}
        popover="auto"
        className={styles.menu}
        role="menu"
        aria-label={t.navigation.languageSelector}
        onToggle={(event) => {
          const isOpen = (event.nativeEvent as ToggleEvent).newState === "open";
          setOpen(isOpen);
          if (!isOpen && menu.current?.contains(document.activeElement)) {
            trigger.current?.focus();
          }
        }}
        onKeyDownCapture={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            menu.current?.hidePopover();
            trigger.current?.focus();
          }
          if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
            event.preventDefault();
            menu.current?.querySelector<HTMLButtonElement>("button")?.focus();
          }
          if (event.key === "Tab") {
            menu.current?.hidePopover();
            trigger.current?.focus();
          }
        }}
      >
        <button
          type="button"
          role="menuitem"
          className={styles.option}
          lang={alternative === "en" ? "en" : "vi"}
          aria-label={alternative === "en" ? "English (EN)" : "Tiếng Việt (VI)"}
          title={
            alternative === "en"
              ? t.navigation.languageToggleToEn
              : t.navigation.languageToggleToVi
          }
          onClick={() => {
            menu.current?.hidePopover();
            setLanguage(alternative);
            trigger.current?.focus();
            onSelect?.();
          }}
        >
          <Flag language={alternative} />
          <span>{alternative.toUpperCase()}</span>
        </button>
      </div>
    </div>
  );
}
