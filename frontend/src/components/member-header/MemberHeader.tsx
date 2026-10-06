"use client";

/**
 * Member header (Tailwind v4 version).
 *
 * Needs Tailwind v4 and this token mapping in your global CSS, which points
 * the utilities at the tokens the project already defines:
 *
 *   @import "tailwindcss";
 *   @theme inline {
 *     --color-surface: var(--bg-surface);
 *     --color-sunken: var(--bg-surface-sunken);
 *     --color-line: var(--border-subtle);
 *     --color-ink: var(--text-strong);
 *     --color-muted: var(--text-muted);
 *     --color-brand: var(--court-600);
 *     --color-danger: var(--danger-text);
 *   }
 *
 * Presentational: auth, i18n and routing data come in as props, so MemberShell
 * keeps ownership of them.
 */

import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { IconClose, IconHeartbeat, IconLogout, IconMenu, IconSettings } from "../icons";

export interface MemberNavItem {
  href: string;
  label: string;
  active: boolean;
}

export interface MemberHeaderProps {
  nav: MemberNavItem[];
  user: { name: string; email: string };
  language: "en" | "vi";
  onToggleLanguage: () => void;
  onLogout: () => void;
  /** Slot for <NotificationBell />. */
  bell: ReactNode;
  /** Optional slot for the check-in QR button, rendered before the language switch. */
  codeSlot?: ReactNode;
  labels: {
    openNav: string;
    closeNav: string;
    myAccount: string;
    fitnessProfile: string;
    logout: string;
    roleLine: string;
  };
}

const focusRing =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand";

export function MemberHeader({
  nav,
  user,
  language,
  onToggleLanguage,
  onLogout,
  bell,
  codeSlot,
  labels,
}: MemberHeaderProps) {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const drawerCloseRef = useRef<HTMLButtonElement>(null);

  const initial = (user.name || user.email).charAt(0).toUpperCase();

  // Scrolled state: IntersectionObserver on a 1px sentinel, no scroll listener.
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => setScrolled(!entry.isIntersecting),
      { threshold: 0 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // Avatar menu: outside click + Escape.
  useEffect(() => {
    if (!menuOpen) return;
    const onPointer = (e: PointerEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMenuOpen(false);
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  // Drawer: Escape, body scroll lock, focus the close button on open.
  useEffect(() => {
    if (!drawerOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setDrawerOpen(false);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    drawerCloseRef.current?.focus();
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      document.removeEventListener("keydown", onKey);
    };
  }, [drawerOpen]);

  const closeDrawer = () => setDrawerOpen(false);

  return (
    <>
      <div ref={sentinelRef} aria-hidden className="-mb-px h-px" />

      <header
        data-scrolled={scrolled}
        className={[
          "sticky top-0 z-40 border-b bg-surface transition-[border-color,box-shadow] duration-200",
          "motion-reduce:transition-none",
          scrolled
            ? "border-line shadow-[0_1px_0_rgb(9_14_15/0.03),0_6px_16px_-8px_rgb(9_14_15/0.12)]"
            : "border-transparent",
        ].join(" ")}
      >
        <div className="mx-auto grid h-16 max-w-[1440px] grid-cols-[auto_1fr_auto] items-center gap-4 px-4 sm:px-6">
          {/* Left: logo + badge */}
          <Link
            href="/member"
            className={`flex items-center gap-2.5 rounded-md ${focusRing}`}
          >
            <span className="font-(family-name:--font-display) text-xl font-bold uppercase leading-none tracking-wide text-ink">
              Sport<span className="text-brand">Hub</span>
            </span>
            <span className="hidden rounded-sm border border-line px-1.5 py-0.5 text-[11px] font-semibold uppercase leading-none tracking-wider text-muted min-[480px]:inline-block">
              Member
            </span>
          </Link>

          {/* Center: primary nav, single line from xl; below that it lives in the drawer */}
          <nav
            aria-label="Member"
            className="hidden items-stretch justify-center gap-1 self-stretch xl:flex"
          >
            {nav.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                aria-current={item.active ? "page" : undefined}
                className={[
                  "relative flex items-center whitespace-nowrap px-3 text-[13px] font-medium transition-colors",
                  "after:absolute after:inset-x-3 after:bottom-0 after:h-0.5 after:rounded-full after:transition-colors",
                  focusRing,
                  item.active
                    ? "text-ink after:bg-brand"
                    : "text-muted after:bg-transparent hover:text-ink",
                ].join(" ")}
              >
                {item.label}
              </Link>
            ))}
          </nav>
          {/* Keeps the actions right-aligned when the nav is hidden */}
          <div className="xl:hidden" />

          {/* Right: actions */}
          <div className="col-start-3 row-start-1 flex items-center gap-1 sm:gap-2">
            {codeSlot}

            <button
              type="button"
              onClick={onToggleLanguage}
              aria-label={
                language === "en" ? "Chuyển sang Tiếng Việt" : "Switch to English"
              }
              className={`hidden h-9 min-w-9 items-center justify-center rounded-md px-2 text-xs font-semibold tracking-wider text-muted transition-colors hover:bg-sunken hover:text-ink sm:inline-flex ${focusRing}`}
            >
              {language === "en" ? "EN" : "VI"}
            </button>

            {bell}

            {/* Avatar + menu */}
            <div ref={menuRef} className="relative">
              <button
                type="button"
                onClick={() => setMenuOpen((v) => !v)}
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                aria-label={user.name || user.email}
                className={`grid size-9 place-items-center rounded-full bg-ink text-[13px] font-semibold text-surface transition-transform active:scale-[0.97] ${focusRing}`}
              >
                {initial}
              </button>

              {menuOpen && (
                <div
                  role="menu"
                  className="absolute right-0 top-[calc(100%+8px)] w-60 overflow-hidden rounded-lg border border-line bg-surface py-1.5 shadow-[0_12px_28px_-12px_rgb(9_14_15/0.25)]"
                >
                  <div className="border-b border-line px-4 pb-3 pt-2">
                    <p className="truncate text-sm font-semibold text-ink">
                      {user.name || user.email}
                    </p>
                    <p className="mt-0.5 text-xs text-muted">{labels.roleLine}</p>
                  </div>
                  <Link
                    role="menuitem"
                    href="/account"
                    onClick={() => setMenuOpen(false)}
                    className="flex items-center gap-2.5 px-4 py-2.5 text-[13px] text-muted hover:bg-sunken hover:text-ink"
                  >
                    <IconSettings size={15} />
                    {labels.myAccount}
                  </Link>
                  <Link
                    role="menuitem"
                    href="/member/profile"
                    onClick={() => setMenuOpen(false)}
                    className="flex items-center gap-2.5 px-4 py-2.5 text-[13px] text-muted hover:bg-sunken hover:text-ink"
                  >
                    <IconHeartbeat size={15} />
                    {labels.fitnessProfile}
                  </Link>
                  <div className="my-1.5 h-px bg-line" />
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setMenuOpen(false);
                      onLogout();
                    }}
                    className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-[13px] text-danger hover:bg-sunken"
                  >
                    <IconLogout size={15} />
                    {labels.logout}
                  </button>
                </div>
              )}
            </div>

            {/* Hamburger: below xl */}
            <button
              type="button"
              onClick={() => setDrawerOpen(true)}
              aria-label={labels.openNav}
              aria-expanded={drawerOpen}
              aria-controls="member-drawer"
              className={`grid size-9 place-items-center rounded-md text-ink transition-colors hover:bg-sunken xl:hidden ${focusRing}`}
            >
              <IconMenu size={20} />
            </button>
          </div>
        </div>
      </header>

      {/* Drawer */}
      <div
        id="member-drawer"
        aria-hidden={!drawerOpen}
        className={`fixed inset-0 z-50 xl:hidden ${drawerOpen ? "" : "pointer-events-none"}`}
      >
        <div
          onClick={closeDrawer}
          className={`absolute inset-0 bg-ink/40 transition-opacity duration-200 motion-reduce:transition-none ${drawerOpen ? "opacity-100" : "opacity-0"}`}
        />
        <aside
          role="dialog"
          aria-modal="true"
          aria-label="Member"
          inert={!drawerOpen}
          className={[
            "absolute inset-y-0 right-0 flex w-[min(320px,86vw)] flex-col bg-surface shadow-[-12px_0_32px_-16px_rgb(9_14_15/0.3)]",
            "transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none",
            drawerOpen ? "translate-x-0" : "translate-x-full",
          ].join(" ")}
        >
          <div className="flex h-16 items-center justify-between border-b border-line px-4">
            <span className="font-(family-name:--font-display) text-xl font-bold uppercase leading-none tracking-wide text-ink">
              Sport<span className="text-brand">Hub</span>
            </span>
            <button
              ref={drawerCloseRef}
              type="button"
              onClick={closeDrawer}
              aria-label={labels.closeNav}
              className={`grid size-10 place-items-center rounded-md text-muted hover:bg-sunken hover:text-ink ${focusRing}`}
            >
              <IconClose size={20} />
            </button>
          </div>

          <nav aria-label="Member" className="flex-1 overflow-y-auto px-2 py-3">
            {nav.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={closeDrawer}
                aria-current={item.active ? "page" : undefined}
                className={[
                  "flex min-h-11 items-center border-l-2 px-3 text-[15px] transition-colors",
                  focusRing,
                  item.active
                    ? "border-brand font-semibold text-ink"
                    : "border-transparent text-muted hover:bg-sunken hover:text-ink",
                ].join(" ")}
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="space-y-1 border-t border-line px-2 py-3">
            <Link
              href="/member/profile"
              onClick={closeDrawer}
              className="flex min-h-11 items-center gap-2.5 px-3 text-sm text-muted hover:bg-sunken hover:text-ink"
            >
              <IconHeartbeat size={16} />
              {labels.fitnessProfile}
            </Link>
            <Link
              href="/account"
              onClick={closeDrawer}
              className="flex min-h-11 items-center gap-2.5 px-3 text-sm text-muted hover:bg-sunken hover:text-ink"
            >
              <IconSettings size={16} />
              {labels.myAccount}
            </Link>
            <button
              type="button"
              onClick={onToggleLanguage}
              className="flex min-h-11 w-full items-center justify-between px-3 text-sm text-muted hover:bg-sunken hover:text-ink sm:hidden"
            >
              <span>{language === "en" ? "Language" : "Ngôn ngữ"}</span>
              <span className="text-xs font-semibold tracking-wider text-ink">
                {language === "en" ? "EN" : "VI"}
              </span>
            </button>
            <button
              type="button"
              onClick={() => {
                closeDrawer();
                onLogout();
              }}
              className="flex min-h-11 w-full items-center gap-2.5 px-3 text-left text-sm text-danger hover:bg-sunken"
            >
              <IconLogout size={16} />
              {labels.logout}
            </button>
          </div>
        </aside>
      </div>
    </>
  );
}
