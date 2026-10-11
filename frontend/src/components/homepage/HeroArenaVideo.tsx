"use client";

import Image from "next/image";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import styles from "./hero-arena-video.module.css";

export function HomepageBackdrop() {
  const pathname = usePathname();
  return ["/", "/login", "/register"].includes(pathname) ? (
    <HeroArenaVideo auth={pathname !== "/"} />
  ) : null;
}

export function HeroArenaVideo({ auth = false }: { auth?: boolean }) {
  const root = useRef<HTMLDivElement>(null);
  const video = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const element = root.current;
    const player = video.current;
    if (!element || !player) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)");
    const connection = (
      navigator as Navigator & {
        connection?: {
          saveData?: boolean;
          addEventListener?: (type: string, listener: () => void) => void;
          removeEventListener?: (type: string, listener: () => void) => void;
        };
      }
    ).connection;
    let visible = true;
    let disposed = false;
    let frame: number | null = null;
    let targetX = 0,
      targetY = 0,
      currentX = 0,
      currentY = 0;
    const update = () => {
      const enabled = !reduced.matches && !connection?.saveData;
      if (!enabled) {
        player.pause();
        player.removeAttribute("src");
        player.load();
        element.dataset.ready = "false";
        element.style.setProperty("--hero-x", "0px");
        element.style.setProperty("--hero-y", "0px");
        return;
      }
      if (!player.getAttribute("src")) {
        player.src = player.canPlayType('video/webm; codecs="vp9"')
          ? "/sporthub/hero/arena-loop.webm?v=2"
          : "/sporthub/hero/arena-loop.mp4?v=2";
      }
      if (visible && !document.hidden) {
        void player.play().catch(() => {
          // Keep the poster if the browser blocks autoplay.
        });
      } else player.pause();
    };
    const onReady = () => {
      if (!disposed) element.dataset.ready = "true";
    };
    const onError = () => {
      if (
        !disposed &&
        player.getAttribute("src")?.includes("arena-loop.webm")
      ) {
        player.src = "/sporthub/hero/arena-loop.mp4?v=2";
        update();
      } else element.dataset.ready = "false";
    };
    const tick = () => {
      if (disposed || reduced.matches || !visible || document.hidden) {
        frame = null;
        return;
      }
      currentX += (targetX - currentX) * 0.08;
      currentY += (targetY - currentY) * 0.08;
      element.style.setProperty("--hero-x", `${currentX.toFixed(2)}px`);
      element.style.setProperty("--hero-y", `${currentY.toFixed(2)}px`);
      if (Math.abs(targetX - currentX) + Math.abs(targetY - currentY) > 0.1) {
        frame = window.requestAnimationFrame(tick);
      } else frame = null;
    };
    const move = (event: PointerEvent) => {
      if (
        reduced.matches ||
        !finePointer.matches ||
        event.pointerType !== "mouse"
      )
        return;
      const bounds = element.getBoundingClientRect();
      targetX = ((event.clientX - bounds.left) / bounds.width - 0.5) * -22;
      targetY = ((event.clientY - bounds.top) / bounds.height - 0.5) * -14;
      if (frame === null) frame = window.requestAnimationFrame(tick);
    };
    const reset = () => {
      targetX = 0;
      targetY = 0;
      if (frame === null) frame = window.requestAnimationFrame(tick);
    };
    const hero = element.parentElement;
    hero?.addEventListener("pointermove", move);
    hero?.addEventListener("pointerleave", reset);
    const observer = new IntersectionObserver(
      ([entry]) => {
        visible = entry.isIntersecting;
        update();
      },
      { threshold: 0.01 },
    );
    observer.observe(element);
    player.addEventListener("playing", onReady);
    player.addEventListener("error", onError);
    reduced.addEventListener("change", update);
    connection?.addEventListener?.("change", update);
    document.addEventListener("visibilitychange", update);
    update();
    return () => {
      disposed = true;
      observer.disconnect();
      player.pause();
      player.removeEventListener("playing", onReady);
      player.removeEventListener("error", onError);
      reduced.removeEventListener("change", update);
      connection?.removeEventListener?.("change", update);
      document.removeEventListener("visibilitychange", update);
      hero?.removeEventListener("pointermove", move);
      hero?.removeEventListener("pointerleave", reset);
      if (frame !== null) window.cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <div
      ref={root}
      className={`${styles.scene} ${auth ? styles.authScene : ""}`}
    >
      <div className={styles.depth}>
        <Image
          className={styles.poster}
          src="/sporthub/hero/arena-poster-v2.jpg"
          alt=""
          fill
          priority
          sizes="100vw"
        />
        <video
          ref={video}
          className={styles.video}
          muted
          loop
          playsInline
          preload="none"
          aria-hidden="true"
        />
      </div>
    </div>
  );
}
