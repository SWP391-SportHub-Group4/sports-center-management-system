"use client";

import { useEffect, useRef, type ReactNode } from "react";
import styles from "./landing-motion.module.css";
import { SportsScrollTrail } from "./SportsScrollTrail";

/** Native scrolling stays in charge. One scheduled frame updates decorative layers. */
export function LandingMotion({
  children,
  className,
  language,
}: {
  children: ReactNode;
  className: string;
  language: string;
}) {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const node = root.current;
    if (!node) return;
    const reduced = matchMedia("(prefers-reduced-motion: reduce)");
    const hero = node.querySelector<HTMLElement>('[data-home-section="top"]');
    let frame = 0;
    const paint = () => {
      frame = 0;
      if (document.hidden) return;
      const extent = document.documentElement.scrollHeight - innerHeight;
      node.style.setProperty(
        "--home-progress",
        String(extent > 0 ? Math.min(1, scrollY / extent) : 0),
      );
      const journey = Math.min(
        1,
        Math.max(0, scrollY / (hero?.offsetHeight || innerHeight)),
      );
      const progress = reduced.matches ? 0 : journey;
      node.style.setProperty("--section-shade", String(journey * 0.64));
      node.style.setProperty(
        "--hero-travel",
        `${(progress * -48).toFixed(2)}px`,
      );
      node.style.setProperty("--hero-presence", String(1 - progress * 0.75));
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(paint);
    };
    const observer = new ResizeObserver(schedule);
    observer.observe(node);
    addEventListener("scroll", schedule, { passive: true });
    addEventListener("resize", schedule);
    document.addEventListener("visibilitychange", schedule);
    reduced.addEventListener("change", schedule);
    paint();
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      removeEventListener("scroll", schedule);
      removeEventListener("resize", schedule);
      document.removeEventListener("visibilitychange", schedule);
      reduced.removeEventListener("change", schedule);
    };
  }, []);
  return (
    <div
      ref={root}
      id="top"
      className={`${className} ${styles.motion}`}
      lang={language}
      data-theme="arena-cinema"
    >
      <span className={styles.progress} aria-hidden="true" />
      <span className={styles.handoff} aria-hidden="true" />
      <SportsScrollTrail />
      {children}
    </div>
  );
}
