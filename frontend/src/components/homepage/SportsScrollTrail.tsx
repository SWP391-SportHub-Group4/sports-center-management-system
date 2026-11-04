"use client";

import { useEffect, useRef, type CSSProperties } from "react";
import styles from "./sports-scroll-trail.module.css";
import Image from "next/image";

type Point = readonly [number, number];
const HERO: Point[] = [
  [170, 385],
  [285, 100],
  [320, 280],
  [220, 705],
  [110, 760],
  [325, 780],
  [300, 850],
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
  useEffect(() => {
    const element = root.current;
    if (!element) return;
    const preference = matchMedia("(prefers-reduced-motion: reduce)");
    const compact = matchMedia("(max-width: 767px)");
    const page = element.closest<HTMLElement>("#top");
    let width = element.clientWidth,
      height = element.clientHeight;
    let sizes: number[] = [];
    let areaHeight = height * 0.4;
    const measure = () => {
      width = element.clientWidth;
      height = element.clientHeight;
      sizes = objects.current.map((object) => object?.clientWidth ?? 1);
      const copy = page?.querySelector("h1")?.parentElement;
      areaHeight = Math.max(
        100,
        Math.min(height * 0.46, (copy?.offsetTop ?? height * 0.55) - 112),
      );
    };
    measure();
    let frame = 0;
    const paint = () => {
      frame = 0;
      if (document.hidden) return;
      const max = Math.max(
        1,
        document.documentElement.scrollHeight - innerHeight,
      );
      const progress = preference.matches
        ? 0
        : Math.min(1, Math.max(0, scrollY / max));
      const fold = preference.matches
        ? 0
        : Math.min(1, scrollY / (innerHeight * 0.75));
      const ease = fold * fold * (3 - 2 * fold);
      const points = HERO.map((point, i) => {
        const y = compact.matches
          ? ((80 + (point[1] / 900) * areaHeight) / height) * 900
          : point[1];
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
      objects.current.forEach((object, i) => {
        if (!object) return;
        const p = onCurve(points, Math.min(1, progress * 0.53 + OFFSETS[i]));
        object.style.transform = `translate3d(${((p[0] / 360) * width).toFixed(2)}px, ${((p[1] / 900) * height).toFixed(2)}px, 0)`;
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
      });
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(paint);
    };
    const resize = new ResizeObserver(() => {
      measure();
      schedule();
    });
    resize.observe(element);
    if (page) resize.observe(page);
    addEventListener("scroll", schedule, { passive: true });
    document.addEventListener("visibilitychange", schedule);
    preference.addEventListener("change", schedule);
    paint();
    return () => {
      cancelAnimationFrame(frame);
      resize.disconnect();
      removeEventListener("scroll", schedule);
      document.removeEventListener("visibilitychange", schedule);
      preference.removeEventListener("change", schedule);
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
            } as CSSProperties
          }
        >
          <div className={styles.roll}>
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
      ))}
    </div>
  );
}
