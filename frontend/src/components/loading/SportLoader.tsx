import Image from "next/image";
import styles from "./sport-loader.module.css";

export const SPORT_LOADING_ASSETS = [
  "/sporthub/hero/objects/basketball-3d.webp",
  "/sporthub/hero/objects/shuttlecock-3d.webp",
  "/sporthub/hero/objects/medicine-ball-3d.webp",
] as const;

export function SportLoader({
  size = "section",
  label = "Loading…",
  decorative = false,
}: {
  size?: "inline" | "section" | "splash";
  label?: string;
  decorative?: boolean;
}) {
  return (
    <span
      className={`${styles.loader} ${styles[size]}`}
      role={decorative ? undefined : "status"}
      aria-label={decorative ? undefined : label}
      aria-hidden={decorative || undefined}
      data-sport-loader={size}
    >
      <span className={styles.objects} aria-hidden="true">
        {SPORT_LOADING_ASSETS.map((src, index) => (
          <span className={styles.object} key={src}>
            <Image
              src={src}
              width={1024}
              height={1024}
              alt=""
              unoptimized
              loading="eager"
              fetchPriority={size === "splash" ? "high" : "auto"}
              className={styles.asset}
              data-loading-object={index}
            />
          </span>
        ))}
      </span>
      {size === "section" && <span className={styles.label}>{label}</span>}
    </span>
  );
}
