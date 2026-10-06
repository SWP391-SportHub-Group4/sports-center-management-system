"use client";

import { useEffect, useState } from "react";
import { Dumbbell, Grid2X2, UsersRound, type LucideIcon } from "lucide-react";
import styles from "./homepage-stats.module.css";

type Language = "en" | "vi";

const stats: Array<{
  value: number;
  suffix: string;
  icon: LucideIcon;
  en: { label: string; detail: string };
  vi: { label: string; detail: string };
}> = [
  {
    value: 24,
    suffix: "+",
    icon: Dumbbell,
    en: { label: "Professional coaches", detail: "Here to help you progress" },
    vi: {
      label: "Huấn luyện viên chuyên nghiệp",
      detail: "Đồng hành cùng tiến bộ",
    },
  },
  {
    value: 12,
    suffix: "",
    icon: Grid2X2,
    en: { label: "Courts & training zones", detail: "Space for every discipline" },
    vi: { label: "Sân và khu tập", detail: "Không gian cho mọi bộ môn" },
  },
  {
    value: 1200,
    suffix: "+",
    icon: UsersRound,
    en: { label: "Members", detail: "Growing stronger together" },
    vi: { label: "Hội viên", detail: "Cùng nhau khỏe hơn mỗi ngày" },
  },
];

function CountUp({ value, language }: { value: number; language: Language }) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    let frame = 0;
    let startTime: number | undefined;
    const duration = 1250;

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setCount(value);
      return;
    }

    const animate = (now: number) => {
      startTime ??= now;
      const progress = Math.min((now - startTime) / duration, 1);
      const eased = 1 - (1 - progress) ** 4;
      setCount(Math.round(value * eased));
      if (progress < 1) frame = window.requestAnimationFrame(animate);
    };

    frame = window.requestAnimationFrame(animate);
    return () => window.cancelAnimationFrame(frame);
  }, [value]);

  return new Intl.NumberFormat(language === "vi" ? "vi-VN" : "en-US").format(
    count,
  );
}

export function HomepageStats({ language }: { language: Language }) {
  const vi = language === "vi";

  return (
    <section className={styles.section} aria-labelledby="homepage-stats-title">
      <header className={styles.heading}>
        <div>
          <p className={styles.kicker}>
            {vi ? "SPORTHUB QUA NHỮNG CON SỐ" : "SPORTHUB AT A GLANCE"}
          </p>
          <h2 id="homepage-stats-title">
            {vi ? "Cùng nhau tiến bộ" : "A stronger community"}
          </h2>
        </div>
        <p className={styles.note}>
          {vi ? "Số liệu minh họa" : "Illustrative figures"}
        </p>
      </header>

      <div className={styles.grid}>
        {stats.map((stat) => {
          const Icon = stat.icon;
          const copy = vi ? stat.vi : stat.en;
          const formattedValue = new Intl.NumberFormat(
            vi ? "vi-VN" : "en-US",
          ).format(stat.value);

          return (
            <article className={styles.card} key={copy.label}>
              <span className={styles.icon} aria-hidden="true">
                <Icon size={20} strokeWidth={1.8} />
              </span>
              <div className={styles.cardCopy}>
                <p className={styles.value}>
                  <span aria-hidden="true">
                    <CountUp value={stat.value} language={language} />
                    {stat.suffix}
                  </span>
                  <span className="sr-only">
                    {formattedValue}
                    {stat.suffix}
                  </span>
                </p>
                <h3>{copy.label}</h3>
                <p className={styles.detail}>{copy.detail}</p>
              </div>
              <span className={styles.rule} aria-hidden="true" />
            </article>
          );
        })}
      </div>
    </section>
  );
}
