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

function isSportDto(value: unknown): value is SportDto {
  if (!value || typeof value !== "object") return false;
  const sport = value as Partial<SportDto>;
  return (
    Number.isFinite(sport.sportId) &&
    typeof sport.name === "string" &&
    typeof sport.operationType === "string" &&
    typeof sport.isActive === "boolean" &&
    Number.isFinite(sport.sortOrder)
  );
}

const copy = {
  en: {
    title: "Every session\nhas a purpose.",
    lead: "Compare sports, class dates, prices and open places.",
    courses: "Find a class",
    gymPlans: "Membership plans",
    aiAlt:
      "Badminton, basketball and strength athletes sharing an indoor sports court",
  },
  vi: {
    title: "Mỗi buổi tập\nđều có mục tiêu.",
    lead: "So sánh môn tập, lịch khai giảng, học phí và chỗ còn.",
    courses: "Tìm lớp học",
    gymPlans: "Gói Membership",
    aiAlt:
      "Vận động viên cầu lông, bóng rổ và thể lực cùng tập trong nhà thi đấu",
  },
} satisfies Record<Language, Record<string, string>>;

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
    (Array.isArray(sportsState.data) ? sportsState.data : [])
      .filter(isSportDto)
      .filter(
        (sport) =>
          sport.isActive &&
          (sport.operationType === "GROUP_COURSE" ||
            (sport.operationType === "WALK_IN" &&
              /gym|fitness|conditioning|thể lực/i.test(sport.name))),
      )
      .sort((a, b) => a.sortOrder - b.sortOrder) ?? [];
  const courseItems = coursesState.data?.items;
  const courses = Array.isArray(courseItems) ? courseItems : [];
  return (
    <>
      <section className={styles.hero} aria-labelledby="performance-title">
        <div className={styles.heroCopy}>
          <h1 id="performance-title">{t.title}</h1>
          <p className={styles.heroLead}>{t.lead}</p>
          <nav
            className={styles.heroActions}
            aria-label={
              language === "vi" ? "Chọn cách bắt đầu" : "Choose how to start"
            }
          >
            <MagneticExploreLink label={t.courses} />
            <Link href="#pricing" className={styles.secondaryCta}>
              {t.gymPlans}
              <CourtIcon name="diagonal" size={16} />
            </Link>
          </nav>
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
