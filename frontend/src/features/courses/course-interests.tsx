"use client";
import Link from "next/link";
import { useLanguage } from "@/lib/language";
import { thresholdCopy } from "./threshold-copy";
import styles from "./threshold.module.css";

export function CourseInterests({ manager = false }: { manager?: boolean }) {
  const { language } = useLanguage();
  const copy = thresholdCopy[language];
  return (
    <section className={styles.page}>
      <header>
        <h2>{copy.interests}</h2>
        <p>{manager ? copy.managerIntro : copy.interestsIntro}</p>
      </header>
      <div className={styles.notice} role="status">
        <strong>{copy.unavailable}</strong>
        <p>{copy.interestsBlocked}</p>
      </div>
      <Link href={manager ? "/manager/classes" : "/member/services"}>
        {manager ? copy.back : copy.explore}
      </Link>
    </section>
  );
}
