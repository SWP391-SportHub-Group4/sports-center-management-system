"use client";

import { useEffect, useRef, type CSSProperties } from "react";
import styles from "./sports-scroll-trail.module.css";
import Image from "next/image";

type Point = readonly [number, number];
const HERO: Point[] = [
  [90, 240],
  [355, 330],
  [330, 640],
  [145, 780],
  [110, 760],
  [325, 780],
  [300, 850],
];
const COMPACT_HERO: Point[] = [
  [80, 230],
  [380, 100],
  [350, 410],
  [160, 660],
  ...HERO.slice(4),
];
const OFFSETS = [0, 0.18, 0.47];
const ASSETS = [
  "basketball-3d.webp",
  "shuttlecock-3d.webp",
  "medicine-ball-3d.webp",
];
const RAIL: Point[] = [
  [310, 238],
  [352, 120],
  [286, 440],
  [324, 498],
  [350, 554],
  [292, 704],
  [324, 838],
];
const pathData = (points: Point[]) =>
  `M${points[0].join(" ")} C${points
    .slice(1, 4)
    .map((p) => p.join(" "))
    .join(" ")} C${points
    .slice(4)
    .map((p) => p.join(" "))
    .join(" ")}`;
function onCurve(points: Point[], progress: number): Point {
  const segment = progress < 0.5 ? 0 : 3;
  const t = progress < 0.5 ? progress * 2 : (progress - 0.5) * 2;
  const u = 1 - t;
  const coordinate = (axis: 0 | 1) =>
    u ** 3 * points[segment][axis] +
    3 * u ** 2 * t * points[segment + 1][axis] +
    3 * u * t ** 2 * points[segment + 2][axis] +
    t ** 3 * points[segment + 3][axis];
  return [coordinate(0), coordinate(1)];
}

/** Decorative geometry follows native scroll, without a timer or a React render per frame. */
export function SportsScrollTrail() {
  const root = useRef<HTMLDivElement>(null);
  const line = useRef<SVGPathElement>(null);
  const objects = useRef<Array<HTMLDivElement | null>>([]);
  const responses = useRef<Array<HTMLDivElement | null>>([]);
  useEffect(() => {
    const element = root.current;
    if (!element) return;
    const preference = matchMedia("(prefers-reduced-motion: reduce)");
    const compact = matchMedia("(max-width: 1023px)");
    const pointer = matchMedia("(hover: hover) and (pointer: fine)");
    const page = element.closest<HTMLElement>("#top");
    const hero = page?.querySelector<HTMLElement>('[data-home-section="top"]');
    let width = element.clientWidth,
      height = element.clientHeight;
    let sizes: number[] = [];
    let areaHeight = height - 215;
    let left = 0;
    let maxScroll = 1;
    const centers: Point[] = [];
    const targets = ASSETS.map(() => ({ x: 0, y: 0, lift: 0 }));
    const poses = ASSETS.map(() => ({ x: 0, y: 0, lift: 0 }));
    const measure = () => {
      width = element.clientWidth;
      height = element.clientHeight;
      left = element.getBoundingClientRect().left;
      maxScroll = Math.max(
        1,
        document.documentElement.scrollHeight - innerHeight,
      );
      sizes = objects.current.map((object) => object?.clientWidth ?? 1);
      const copy = page?.querySelector("h1")?.parentElement;
      areaHeight = compact.matches
        ? Math.max(
            100,
            Math.min(height * 0.46, (copy?.offsetTop ?? height * 0.55) - 112),
          )
        : Math.max(100, height - 215);
      element.style.setProperty("--hero-band", `${areaHeight}px`);
    };
    measure();
    let frame = 0;
    let lastTime = 0;
    const reset = () => {
      targets.forEach((target) => {
        target.x = target.y = target.lift = 0;
      });
      schedule();
    };
    const paint = (time: number) => {
      frame = 0;
      if (document.hidden) {
        lastTime = 0;
        return;
      }
      const smoothing =
        1 - Math.exp(-Math.min(64, time - (lastTime || time - 16)) / 90);
      lastTime = time;
      const progress = preference.matches
        ? 0
        : Math.min(1, Math.max(0, scrollY / maxScroll));
      const fold = preference.matches
        ? 0
        : Math.min(1, scrollY / (innerHeight * 0.75));
      const ease = fold * fold * (3 - 2 * fold);
      const interactive = pointer.matches && !preference.matches && fold < 0.18;
      const points = (compact.matches ? COMPACT_HERO : HERO).map((point, i) => {
        const y =
          (((compact.matches ? 80 : 110) + (point[1] / 900) * areaHeight) /
            height) *
          900;
        return [
          point[0] + (RAIL[i][0] - point[0]) * ease,
          y + (RAIL[i][1] - y) * ease,
        ] as Point;
      });
      line.current?.setAttribute("d", pathData(points));
      element.style.setProperty(
        "--trail-line",
        String(preference.matches ? 0 : Math.min(1, scrollY / 140)),
      );
      let moving = false;
      objects.current.forEach((object, i) => {
        if (!object) return;
        const p = onCurve(points, Math.min(1, progress * 0.53 + OFFSETS[i]));
        const x = (p[0] / 360) * width;
        const y = (p[1] / 900) * height;
        centers[i] = [left + x, y];
        object.style.transform = `translate3d(${x.toFixed(2)}px, ${y.toFixed(2)}px, 0)`;
        const heroScale = compact.matches ? Math.min(1, areaHeight / 260) : 1;
        const railScale = (i === 0 ? 34 : 28) / Math.max(1, sizes[i]);
        object.style.setProperty(
          "--trail-scale",
          String(heroScale + (railScale - heroScale) * ease),
        );
        object.style.setProperty(
          "--roll",
          `${(progress * (i === 1 ? 660 : 1440) + [0, 12, -12][i]).toFixed(2)}deg`,
        );
        const target = targets[i];
        const pose = poses[i];
        if (!interactive) target.x = target.y = target.lift = 0;
        for (const key of ["x", "y", "lift"] as const) {
          const remaining = target[key] - pose[key];
          pose[key] = preference.matches
            ? 0
            : Math.abs(remaining) < 0.001
              ? target[key]
              : pose[key] + remaining * smoothing;
          if (Math.abs(target[key] - pose[key]) >= 0.001) moving = true;
        }
        const response = responses.current[i];
        response?.style.setProperty("--hover-x", String(pose.x));
        response?.style.setProperty("--hover-y", String(pose.y));
        response?.style.setProperty("--hover-lift", String(pose.lift));
      });
      if (moving) frame = requestAnimationFrame(paint);
      else lastTime = 0;
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(paint);
    };
    const move = (event: PointerEvent) => {
      if (
        event.pointerType !== "mouse" ||
        !pointer.matches ||
        preference.matches ||
        scrollY >= innerHeight * 0.135
      )
        return;
      let nearest = -1;
      let distance = 1;
      centers.forEach((center, i) => {
        const radius = sizes[i] * 0.52;
        const next = Math.hypot(
          (event.clientX - center[0]) / radius,
          (event.clientY - center[1]) / radius,
        );
        if (next < distance) {
          distance = next;
          nearest = i;
        }
      });
      targets.forEach((target, i) => {
        target.lift = i === nearest ? 1 : 0;
        target.x =
          i === nearest
            ? Math.max(
                -1,
                Math.min(1, (event.clientX - centers[i][0]) / (sizes[i] * 0.5)),
              )
            : 0;
        target.y =
          i === nearest
            ? Math.max(
                -1,
                Math.min(1, (event.clientY - centers[i][1]) / (sizes[i] * 0.5)),
              )
            : 0;
      });
      schedule();
    };
    const resize = new ResizeObserver(() => {
      measure();
      schedule();
    });
    resize.observe(element);
    if (page) resize.observe(page);
    const copy = hero?.querySelector("h1")?.parentElement;
    if (copy) resize.observe(copy);
    hero?.addEventListener("pointermove", move);
    hero?.addEventListener("pointerleave", reset);
    hero?.addEventListener("pointercancel", reset);
    addEventListener("blur", reset);
    addEventListener("scroll", schedule, { passive: true });
    document.addEventListener("visibilitychange", schedule);
    preference.addEventListener("change", schedule);
    pointer.addEventListener("change", schedule);
    paint(performance.now());
    return () => {
      cancelAnimationFrame(frame);
      resize.disconnect();
      hero?.removeEventListener("pointermove", move);
      hero?.removeEventListener("pointerleave", reset);
      hero?.removeEventListener("pointercancel", reset);
      removeEventListener("blur", reset);
      removeEventListener("scroll", schedule);
      document.removeEventListener("visibilitychange", schedule);
      preference.removeEventListener("change", schedule);
      pointer.removeEventListener("change", schedule);
    };
  }, []);
  return (
    <div
      ref={root}
      className={styles.trail}
      aria-hidden="true"
      data-sports-trail
    >
      <svg
        className={styles.route}
        viewBox="0 0 360 900"
        preserveAspectRatio="none"
      >
        <path ref={line} d={pathData(HERO)} />
      </svg>
      {[0, 1, 2].map((kind) => (
        <div
          key={kind}
          ref={(node) => {
            objects.current[kind] = node;
          }}
          className={styles.object}
          data-sport-object={kind}
          style={
            {
              "--initial-x": onCurve(HERO, OFFSETS[kind])[0] / 360,
              "--initial-y": onCurve(HERO, OFFSETS[kind])[1] / 900,
              "--compact-x": onCurve(COMPACT_HERO, OFFSETS[kind])[0] / 360,
              "--compact-y": onCurve(COMPACT_HERO, OFFSETS[kind])[1] / 900,
            } as CSSProperties
          }
        >
          <div className={styles.roll}>
            <div
              className={styles.response}
              ref={(node) => {
                responses.current[kind] = node;
              }}
              data-sport-response
            >
              <div
                className={styles.entrance}
                style={{ animationDelay: `${170 + kind * 110}ms` }}
              >
                <Image
                  src={`/sporthub/hero/objects/${ASSETS[kind]}`}
                  width={1024}
                  height={1024}
                  alt=""
                  priority={kind === 0}
                  loading={kind === 0 ? undefined : "eager"}
                  unoptimized
                  draggable={false}
                  className={styles.asset}
                />
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
