"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { SPORT_LOADING_ASSETS, SportLoader } from "./SportLoader";
import { RequestActivity } from "./RequestActivity";
import styles from "./startup-experience.module.css";

type Phase = "loading" | "complete" | "revealing" | "ready";

/** Only critical entry resources are measured. Page/API requests retain their own loaders. */
export function StartupExperience({ children }: { children: ReactNode }) {
  const [phase, setPhase] = useState<Phase>("loading");
  const [progress, setProgress] = useState(0);
  const content = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const reduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    const controller = new AbortController();
    let active = true;
    let frame = 0;
    let settled = 0;
    let displayed = 0;
    let last = performance.now();
    const started = last;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const previousOverflow = document.body.style.overflow;
    const node = content.current;
    let released = false;
    if (node) node.inert = true;
    document.body.style.overflow = "hidden";

    function release() {
      if (released) return;
      released = true;
      if (node) node.inert = false;
      document.body.style.overflow = previousOverflow;
    }
    function finish() {
      if (!active) return;
      release();
      setPhase("ready");
    }
    function complete() {
      setProgress(100);
      setPhase("complete");
      timers.push(
        setTimeout(
          () => {
            if (!active) return;
            release();
            setPhase("revealing");
            // Match the curtain duration, with a timer fallback for background tabs.
            timers.push(setTimeout(finish, reduced ? 80 : 1550));
          },
          reduced ? 0 : 180,
        ),
      );
    }
    const readyImage = async (image: HTMLImageElement) => {
      if (image.complete) {
        if (image.naturalWidth) await image.decode().catch(() => undefined);
        return;
      }
      await new Promise<void>((resolve) => {
        const done = () => resolve();
        image.addEventListener("load", done, {
          once: true,
          signal: controller.signal,
        });
        image.addEventListener("error", done, {
          once: true,
          signal: controller.signal,
        });
        controller.signal.addEventListener("abort", done, { once: true });
      });
      if (image.naturalWidth) await image.decode().catch(() => undefined);
    };
    const tasks: Promise<unknown>[] = SPORT_LOADING_ASSETS.map((src) => {
      const image = new window.Image();
      image.src = src;
      return readyImage(image);
    });
    tasks.push(document.fonts.ready);
    tasks.push(
      document.readyState !== "loading"
        ? Promise.resolve()
        : new Promise<void>((resolve) => {
            document.addEventListener("DOMContentLoaded", () => resolve(), {
              once: true,
              signal: controller.signal,
            });
          }),
    );
    const poster =
      window.location.pathname === "/"
        ? document.querySelector<HTMLImageElement>("[data-hero-scene] img")
        : null;
    if (poster) tasks.push(readyImage(poster));
    // A broken image/font must never leave the application behind a blocking curtain.
    const deadline = new Promise<void>((resolve) => {
      timers.push(setTimeout(resolve, 8000));
    });
    tasks.forEach((task) => {
      void Promise.race([task, deadline])
        .catch(() => undefined)
        .then(() => {
          if (active) settled += 1;
        });
    });
    const tick = (now: number) => {
      if (!active) return;
      const target = (settled / tasks.length) * 100;
      const elapsed = Math.min(now - last, 64);
      last = now;
      displayed += (target - displayed) * (1 - Math.exp(-elapsed / 110));
      setProgress(Math.min(99, Math.floor(displayed)));
      if (
        settled === tasks.length &&
        (reduced || now - started >= 650) &&
        displayed >= 99
      ) {
        complete();
      } else {
        frame = requestAnimationFrame(tick);
      }
    };
    frame = requestAnimationFrame(tick);
    return () => {
      active = false;
      cancelAnimationFrame(frame);
      controller.abort();
      timers.forEach(clearTimeout);
      release();
    };
  }, []);

  return (
    <div className={styles.experience} data-startup-phase={phase}>
      <div className={styles.content} ref={content} data-startup-content>
        {children}
      </div>
      <RequestActivity />
      {phase !== "ready" && (
        <div
          className={styles.curtain}
          data-startup-loader
          aria-label="SportHub is loading"
          aria-hidden={phase === "revealing" || undefined}
        >
          <div className={styles.brand}>
            SPORT<span>HUB</span>
          </div>
          <div className={styles.stage}>
            <SportLoader size="splash" decorative />
          </div>
          <div className={styles.readout}>
            <div
              className={styles.progress}
              role="progressbar"
              aria-label="Loading SportHub"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={progress}
            >
              <span className={styles.number}>
                {progress}
                <span>%</span>
              </span>
              <div className={styles.track}>
                <span style={{ transform: `scaleX(${progress / 100})` }} />
              </div>
            </div>
            <p>
              {progress === 100
                ? "Ready. Let’s move."
                : "Getting ready to move."}
            </p>
          </div>
        </div>
      )}
      <noscript>
        <style>{`[data-startup-loader]{display:none!important}[data-startup-content]{visibility:visible!important}[data-startup-phase]{--hero-animation-state:running!important;--startup-object-y:0px!important;--startup-scene-y:0px!important;--startup-scene-scale:1!important}`}</style>
      </noscript>
    </div>
  );
}
