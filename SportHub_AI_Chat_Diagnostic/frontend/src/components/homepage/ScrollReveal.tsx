"use client";

import { useEffect, useRef, type ReactNode } from "react";
import styles from "./scroll-reveal.module.css";

/** Content stays visible without JS. Observe once; never subscribe to scroll frames. */
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
    const configure = () => {
      observer?.disconnect();
      node.removeAttribute("data-pending");
      if (
        preference.matches ||
        node.getBoundingClientRect().top < window.innerHeight
      )
        return;
      node.dataset.pending = "true";
      observer = new IntersectionObserver(
        ([entry]) => {
          if (!entry.isIntersecting) return;
          node.removeAttribute("data-pending");
          observer?.disconnect();
        },
        { rootMargin: "0px 0px -32px 0px", threshold: 0 },
      );
      observer.observe(node);
    };
    configure();
    preference.addEventListener("change", configure);
    return () => {
      observer?.disconnect();
      preference.removeEventListener("change", configure);
    };
  }, []);

  return (
    <div ref={ref} className={styles.reveal} data-home-section={section}>
      {children}
    </div>
  );
}
