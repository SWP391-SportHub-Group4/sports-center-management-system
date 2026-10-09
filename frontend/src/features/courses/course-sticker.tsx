"use client";

import { CourtIcon } from "@/components/brand/CourtIcon";
import { useLanguage } from "@/lib/language";
import styles from "./course-sticker.module.css";

/** A small vector character: no downloaded imagery or animation runtime. */
export function CourseSticker({
  sport,
  compact = false,
}: {
  sport: string;
  compact?: boolean;
}) {
  const { language } = useLanguage();
  const normalized = sport
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  const icon = /badminton|cau long/.test(normalized)
    ? "badminton"
    : /basketball|bong ro/.test(normalized)
      ? "basketball"
      : /gym|fitness/.test(normalized)
        ? "gym"
        : "user";

  return (
    <figure
      className={`${styles.stage} ${compact ? styles.compact : ""}`}
      aria-label={language === "vi" ? `Sticker ${sport}` : `${sport} sticker`}
    >
      <div className={styles.scene} aria-hidden="true">
        <span className={styles.spark} />
        <span className={styles.sparkSmall} />
        <span className={styles.shadow} />
        <div className={styles.character}>
          <span className={styles.arm} />
          <span className={styles.body}>
            <span className={styles.eyes}>
              <i />
              <i />
            </span>
            <span className={styles.smile} />
          </span>
          <span className={styles.foot} />
          <span className={styles.footRight} />
        </div>
        <span className={styles.sport}>
          <CourtIcon name={icon} size={48} />
        </span>
      </div>
      <figcaption>{sport}</figcaption>
    </figure>
  );
}
