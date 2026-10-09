"use client";

import Link from "next/link";
import { useEffect, useRef, type PointerEvent } from "react";
import { CourtIcon } from "@/components/brand/CourtIcon";
import { buttonClass } from "@/components/primitives/Button";
import { HOME_BY_ROLE, useAuth } from "@/lib/auth";
import styles from "./performance-sections.module.css";

type Language = "en" | "vi";

const copy = {
  en: {
    title: "Every session\nhas a purpose.",
    lead: "Explore dedicated spaces for court sports and athletic training.",
    start: "Sign in to get started",
    enter: "Go to my space",
  },
  vi: {
    title: "Mỗi buổi tập\nđều có mục tiêu.",
    lead: "Khám phá không gian dành cho thể thao sân đấu và rèn luyện thể lực.",
    start: "Đăng nhập để bắt đầu",
    enter: "Vào không gian của tôi",
  },
} satisfies Record<Language, Record<string, string>>;

function MagneticAccountLink({
  label,
  href,
  disabled,
}: {
  label: string;
  href: string;
  disabled: boolean;
}) {
  const ref = useRef<HTMLAnchorElement>(null);
  const target = useRef({ x: 0, y: 0 });
  const current = useRef({ x: 0, y: 0 });
  const frame = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (frame.current !== null) window.cancelAnimationFrame(frame.current);
    },
    [],
  );

  const tick = () => {
    const node = ref.current;
    if (!node) return;
    current.current.x += (target.current.x - current.current.x) * 0.2;
    current.current.y += (target.current.y - current.current.y) * 0.2;
    node.style.transform = `translate3d(${current.current.x.toFixed(2)}px, ${current.current.y.toFixed(2)}px, 0)`;

    const settled =
      Math.abs(target.current.x - current.current.x) < 0.08 &&
      Math.abs(target.current.y - current.current.y) < 0.08;
    if (settled) {
      current.current = { ...target.current };
      node.style.transform = `translate3d(${target.current.x}px, ${target.current.y}px, 0)`;
      frame.current = null;
      return;
    }
    frame.current = window.requestAnimationFrame(tick);
  };

  const move = (event: PointerEvent<HTMLAnchorElement>) => {
    if (
      event.pointerType !== "mouse" ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    )
      return;

    const bounds = event.currentTarget.getBoundingClientRect();
    target.current = {
      x: (event.clientX - bounds.left - bounds.width / 2) * 0.12,
      y: (event.clientY - bounds.top - bounds.height / 2) * 0.12,
    };
    if (frame.current === null)
      frame.current = window.requestAnimationFrame(tick);
  };

  const reset = () => {
    target.current = { x: 0, y: 0 };
    if (frame.current === null)
      frame.current = window.requestAnimationFrame(tick);
  };

  return (
    <Link
      ref={ref}
      href={href}
      aria-disabled={disabled}
      tabIndex={disabled ? -1 : undefined}
      className={`${buttonClass({ size: "lg" })} ${styles.primaryCta}`}
      onPointerMove={disabled ? undefined : move}
      onPointerLeave={disabled ? undefined : reset}
      onClick={(event) => {
        if (disabled) event.preventDefault();
      }}
    >
      {label}
      <CourtIcon name="arrow" size={18} />
    </Link>
  );
}

export function PerformanceSections({ language }: { language: Language }) {
  const t = copy[language];
  const { user, loading: authLoading } = useAuth();
  const destination = user ? HOME_BY_ROLE[user.role] : "/login";

  return (
    <section
      data-home-section="top"
      className={styles.hero}
      aria-labelledby="performance-title"
    >
      <div className={styles.heroCopy}>
        <h1 id="performance-title" aria-label={t.title.replace("\n", " ")}>
          {t.title.split("\n").map((line, index) => (
            <span className={styles.titleLine} key={line}>
              <span style={{ animationDelay: `${160 + index * 130}ms` }}>
                {line}
              </span>
            </span>
          ))}
        </h1>
        <p className={styles.heroLead}>{t.lead}</p>
        <nav
          className={styles.heroActions}
          aria-label={
            language === "vi"
              ? "Bắt đầu với SportHub"
              : "Get started with SportHub"
          }
        >
          <MagneticAccountLink
            label={authLoading ? t.start : user ? t.enter : t.start}
            href={destination}
            disabled={authLoading}
          />
        </nav>
      </div>

      <div
        className={styles.disciplines}
        aria-label={language === "vi" ? "Các môn thể thao" : "Our sports"}
      >
        <span>{language === "vi" ? "Cầu lông" : "Badminton"}</span>
        <span>{language === "vi" ? "Bóng rổ" : "Basketball"}</span>
        <span>Gym</span>
      </div>
    </section>
  );
}
