"use client";

import { useEffect, useRef, type ReactNode } from "react";
import styles from "./scroll-reveal.module.css";

/** Reveal selected elements, never hide an entire section or its controls. */
export function ScrollReveal({
  children,
  section,
}: {
  children: ReactNode;
  section?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node || !("IntersectionObserver" in window)) return;
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    let observer: IntersectionObserver | undefined;
    const visibility = new IntersectionObserver(([entry]) => {
      node.dataset.offscreen = String(!entry.isIntersecting);
    });
    visibility.observe(node);
    const configure = () => {
      observer?.disconnect();
      const targets = [...node.querySelectorAll<HTMLElement>("[data-motion]")];
      targets.forEach((target) =>
        target.removeAttribute("data-motion-pending"),
      );
      if (preference.matches) return;
      observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (!entry.isIntersecting) return;
            entry.target.removeAttribute("data-motion-pending");
            observer?.unobserve(entry.target);
          });
        },
        { rootMargin: "0px 0px -56px 0px", threshold: 0 },
      );
      targets.forEach((target) => {
        if (target.getBoundingClientRect().top < window.innerHeight) return;
        target.dataset.motionPending = "true";
        observer?.observe(target);
      });
    };
    configure();
    preference.addEventListener("change", configure);
    return () => {
      observer?.disconnect();
      visibility.disconnect();
      delete node.dataset.offscreen;
      preference.removeEventListener("change", configure);
    };
  }, []);

  return (
    <div ref={ref} className={styles.reveal} data-home-section={section}>
      {children}
    </div>
  );
}
