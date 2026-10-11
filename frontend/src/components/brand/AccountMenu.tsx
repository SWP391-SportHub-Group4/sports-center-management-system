"use client";
import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { CourtIcon, type CourtIconName } from "./CourtIcon";
import s from "./brand.module.css";
import { UserAvatar } from "@/components/UserAvatar";

export function AccountMenu({
  name,
  subtitle,
  links,
  logoutLabel,
  onSignOut,
  tone = "default",
  avatarUrl,
}: {
  name: string;
  subtitle: string;
  links: { href: string; label: string; icon: CourtIconName }[];
  logoutLabel: string;
  onSignOut: () => void;
  tone?: "default" | "inverse";
  avatarUrl?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const id = useId();
  useEffect(() => {
    if (!open) return;
    const dismiss = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        trigger.current?.focus();
      }
    };
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", dismiss);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);
  return (
    <div
      className={`${s.account} ${tone === "inverse" ? s.accountInverse : ""}`}
      ref={root}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
    >
      <button
        className={s.accountTrigger}
        ref={trigger}
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen(!open)}
      >
        <UserAvatar name={name} src={avatarUrl} className={s.avatar} />
        <span className={s.accountName}>{name}</span>
        <CourtIcon name="chevron" size={16} />
      </button>
      {open && (
        <div className={s.accountPanel} id={id}>
          <div className={s.identity}>
            <strong>{name}</strong>
            <small>{subtitle}</small>
          </div>
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              onClick={() => setOpen(false)}
            >
              <CourtIcon name={link.icon} size={20} />
              {link.label}
            </Link>
          ))}
          <button
            onClick={() => {
              setOpen(false);
              onSignOut();
            }}
          >
            <CourtIcon name="logout" size={20} />
            {logoutLabel}
          </button>
        </div>
      )}
    </div>
  );
}
