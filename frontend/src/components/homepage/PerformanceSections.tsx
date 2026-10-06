"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, type PointerEvent } from "react";
import { CourtIcon } from "@/components/brand/CourtIcon";
import { buttonClass } from "@/components/primitives/Button";
import { api } from "@/lib/apiClient";
import { useApi } from "@/lib/useApi";
import type {
  CourseDto,
  MembershipPackageDto,
  Paged,
  SportDto,
} from "@/lib/types";
import { InteractiveArenaTour } from "./InteractiveArenaTour";
import styles from "./performance-sections.module.css";

type Language = "en" | "vi";

const copy = {
  en: {
    title: "Every session\nhas a purpose.",
    lead: "Badminton, basketball and athletic conditioning. Find your court, explore the arena and check current class availability.",
    courses: "Explore the arena",
    gymPlans: "Membership plans",
    activePrograms: "Active programs",
    publishedCourses: "Published courses",
    unavailable: "Unavailable",
    aiAlt:
      "Badminton, basketball and strength athletes sharing an indoor sports court",
  },
  vi: {
    title: "Mỗi buổi tập\nđều có mục tiêu.",
    lead: "Cầu lông, bóng rổ và thể lực vận động viên. Chọn khu vực, xem sơ đồ và kiểm tra lịch học còn chỗ.",
    courses: "Khám phá tổ hợp",
    gymPlans: "Gói Membership",
    activePrograms: "Môn đang hoạt động",
    publishedCourses: "Khóa học đã mở",
    unavailable: "Chưa tải được",
    aiAlt:
      "Vận động viên cầu lông, bóng rổ và thể lực cùng tập trong nhà thi đấu",
  },
} satisfies Record<Language, Record<string, string>>;

function AnimatedNumber({
  value,
  locale,
}: {
  value: number;
  locale: Language;
}) {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const formatter = new Intl.NumberFormat(
      locale === "vi" ? "vi-VN" : "en-US",
    );
    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    if (reduceMotion) {
      element.textContent = formatter.format(value);
      return;
    }

    element.textContent = formatter.format(0);
    let frame = 0;
    let startedAt = 0;
    const duration = 720;
    const animate = (time: number) => {
      if (!startedAt) startedAt = time;
      const progress = Math.min((time - startedAt) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 4);
      element.textContent = formatter.format(Math.round(value * eased));
      if (progress < 1) frame = window.requestAnimationFrame(animate);
    };

    frame = window.requestAnimationFrame(animate);
    return () => window.cancelAnimationFrame(frame);
  }, [locale, value]);

  return (
    <span ref={ref}>
      {value.toLocaleString(locale === "vi" ? "vi-VN" : "en-US")}
    </span>
  );
}

function MagneticExploreLink({ label }: { label: string }) {
  const ref = useRef<HTMLAnchorElement>(null);
  const target = useRef({ x: 0, y: 0 });
  const current = useRef({ x: 0, y: 0 });
  const frame = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (frame.current !== null) window.cancelAnimationFrame(frame.current);
    },
    [],
  );

  const tick = () => {
    const node = ref.current;
    if (!node) return;
    current.current.x += (target.current.x - current.current.x) * 0.2;
    current.current.y += (target.current.y - current.current.y) * 0.2;
    node.style.transform = `translate3d(${current.current.x.toFixed(2)}px, ${current.current.y.toFixed(2)}px, 0)`;

    const settled =
      Math.abs(target.current.x - current.current.x) < 0.08 &&
      Math.abs(target.current.y - current.current.y) < 0.08;
    if (settled) {
      current.current = { ...target.current };
      node.style.transform = `translate3d(${target.current.x}px, ${target.current.y}px, 0)`;
      frame.current = null;
      return;
    }
    frame.current = window.requestAnimationFrame(tick);
  };

  const move = (event: PointerEvent<HTMLAnchorElement>) => {
    if (
      event.pointerType !== "mouse" ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    )
      return;

    const bounds = event.currentTarget.getBoundingClientRect();
    target.current = {
      x: (event.clientX - bounds.left - bounds.width / 2) * 0.12,
      y: (event.clientY - bounds.top - bounds.height / 2) * 0.12,
    };
    if (frame.current === null)
      frame.current = window.requestAnimationFrame(tick);
  };

  const reset = () => {
    target.current = { x: 0, y: 0 };
    if (frame.current === null)
      frame.current = window.requestAnimationFrame(tick);
  };

  return (
    <Link
      ref={ref}
      href="#activities"
      className={`${buttonClass({ size: "lg" })} ${styles.primaryCta}`}
      onPointerMove={move}
      onPointerLeave={reset}
    >
      {label}
      <CourtIcon name="arrow" size={18} />
    </Link>
  );
}

export function PerformanceSections({ language }: { language: Language }) {
  const t = copy[language];
  const sportsState = useApi(
    (signal) => api.get<SportDto[]>("/api/sports", { anonymous: true, signal }),
    [],
  );
  const coursesState = useApi(
    (signal) =>
      api.get<Paged<CourseDto>>("/api/classes", {
        query: { page: 1, pageSize: 100 },
        anonymous: true,
        signal,
      }),
    [],
  );
  const packagesState = useApi(
    (signal) =>
      api.get<MembershipPackageDto[]>("/api/membership-packages/public", {
        anonymous: true,
        signal,
      }),
    [],
  );

  const programs =
    sportsState.data
      ?.filter(
        (sport) =>
          sport.isActive &&
          (sport.operationType === "GROUP_COURSE" ||
            (sport.operationType === "WALK_IN" &&
              /gym|fitness|conditioning|thể lực/i.test(sport.name))),
      )
      .sort((a, b) => a.sortOrder - b.sortOrder) ?? [];
  const courses = coursesState.data?.items ?? [];
  const courseCount = coursesState.data?.totalCount ?? 0;
  return (
    <>
      <section className={styles.hero} aria-labelledby="performance-title">
        <div className={styles.heroCopy}>
          <p className={styles.heroKicker}>
            <span>
              {language === "vi"
                ? "SPORT HUB · HIỆU SUẤT"
                : "SPORTHUB · PERFORMANCE"}
            </span>
            <span className={styles.kickerRule} aria-hidden="true" />
          </p>
          <h1 id="performance-title">{t.title}</h1>
          <p className={styles.heroLead}>{t.lead}</p>
          <div className={styles.heroActions}>
            <MagneticExploreLink label={t.courses} />
            <Link href="#pricing" className={styles.secondaryCta}>
              {t.gymPlans}
              <CourtIcon name="diagonal" size={16} />
            </Link>
          </div>
        </div>

        <div className={styles.heroImage}>
          <Image
            src="/sporthub/court-volt/hero-community.png"
            alt={t.aiAlt}
            fill
            priority
            sizes="(max-width: 767px) 100vw, 58vw"
          />
          <span className={styles.imageFrame} aria-hidden="true" />
          <span className={styles.imageGlint} aria-hidden="true" />
        </div>

        <div
          className={styles.heroStats}
          role="group"
          aria-label={
            language === "vi" ? "Thống kê danh mục" : "Catalog statistics"
          }
        >
          <div className={styles.heroStat}>
            <span className={styles.statLabel}>{t.activePrograms}</span>
            {sportsState.loading ? (
              <span className={styles.statSkeleton} aria-hidden="true" />
            ) : sportsState.error ? (
              <span className={styles.statError}>{t.unavailable}</span>
            ) : (
              <strong>
                <AnimatedNumber value={programs.length} locale={language} />
              </strong>
            )}
          </div>
          <div className={styles.heroStat}>
            <span className={styles.statLabel}>{t.publishedCourses}</span>
            {coursesState.loading ? (
              <span className={styles.statSkeleton} aria-hidden="true" />
            ) : coursesState.error ? (
              <span className={styles.statError}>{t.unavailable}</span>
            ) : (
              <strong>
                <AnimatedNumber value={courseCount} locale={language} />
              </strong>
            )}
          </div>
        </div>
      </section>

      <InteractiveArenaTour
        language={language}
        sports={programs}
        courses={courses}
        memberships={packagesState.data}
        loading={sportsState.loading || coursesState.loading}
        hasError={Boolean(sportsState.error || coursesState.error)}
        onRetry={() => {
          if (sportsState.error) sportsState.reload();
          if (coursesState.error) coursesState.reload();
          if (packagesState.error) packagesState.reload();
        }}
      />
    </>
  );
}
