import type { CSSProperties } from "react";
import type { EmblemKind } from "./service-kinds";
import styles from "./service-emblem.module.css";

function Art({ kind }: { kind: EmblemKind }) {
  switch (kind) {
    case "gym":
      return (
        <>
          <ellipse className={styles.shadow} cx="32" cy="54" rx="16" ry="2.5" />
          <g className={styles.lift}>
            <path d="M12 32h40" />
            <rect
              x="12"
              y="22"
              width="5"
              height="20"
              rx="1.5"
              className={styles.fill}
            />
            <rect x="18.5" y="25" width="4" height="14" rx="1.5" />
            <rect
              x="47"
              y="22"
              width="5"
              height="20"
              rx="1.5"
              className={styles.fill}
            />
            <rect x="41.5" y="25" width="4" height="14" rx="1.5" />
            <path d="M8 29v6M56 29v6" />
          </g>
        </>
      );
    case "badminton":
      return (
        <>
          <g className={styles.shuttle}>
            <circle cx="22" cy="43" r="5" className={styles.fill} />
            <path d="M25 40L40 17M19 39l6-22M29 45L48 31" />
            <path d="M25.5 17.5l14.5-1M39 17.5l8.5 13" />
          </g>
          <path d="M44 48c6-3 10-9 11-15" className={styles.trail} />
        </>
      );
    case "basketball":
      return (
        <>
          <ellipse className={styles.shadow} cx="32" cy="55" rx="14" ry="2.5" />
          <g className={styles.ball}>
            <circle cx="32" cy="30" r="15" />
            <path d="M17 30h30M32 15v30" />
            <path d="M21.5 19.5c5 3.5 5 17.5 0 21M42.5 19.5c-5 3.5-5 17.5 0 21" />
          </g>
        </>
      );
    case "court":
      return (
        <>
          <rect x="8" y="14" width="48" height="36" rx="3" />
          <path d="M32 14v36M8 26h10v12H8M56 26H46v12h10" />
          <circle cx="32" cy="32" r="5" />
          <g className={styles.rally}>
            <circle cx="14" cy="32" r="3.2" className={styles.fill} />
          </g>
        </>
      );
    default:
      return (
        <g className={styles.whistle}>
          <path d="M14 30h20a11 11 0 1 1 0 22h-9a11 11 0 0 1-11-11z" />
          <path d="M14 30v-5h14" />
          <circle cx="37" cy="41" r="3.5" className={styles.accent} />
          <path d="M50 20c4-2 7-6 7-10" />
        </g>
      );
  }
}

export function ServiceEmblem({
  kind,
  size = 56,
  delay = 0,
}: {
  kind: EmblemKind;
  size?: number;
  delay?: number;
}) {
  return (
    <svg
      className={styles.emblem}
      viewBox="0 0 64 64"
      width={size}
      height={size}
      aria-hidden="true"
      focusable="false"
      style={{ "--emblem-delay": `${delay}ms` } as CSSProperties}
    >
      <Art kind={kind} />
    </svg>
  );
}
