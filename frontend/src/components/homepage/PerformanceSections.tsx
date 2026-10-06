"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, type PointerEvent } from "react";
import { CourtIcon, type CourtIconName } from "@/components/brand/CourtIcon";
import { buttonClass } from "@/components/primitives/Button";
import { api } from "@/lib/apiClient";
import { formatDate, formatMoney } from "@/lib/format";
import { useApi } from "@/lib/useApi";
import type {
  CourseDto,
  MembershipPackageDto,
  Paged,
  SportDto,
} from "@/lib/types";
import styles from "./performance-sections.module.css";

type Language = "en" | "vi";

const copy = {
  en: {
    title: "Every session\nhas a purpose.",
    lead: "Gym, Badminton and Basketball. Compare courses, schedules and available places before you enroll.",
    courses: "Explore programs",
    gymPlans: "Gym memberships",
    activePrograms: "Active programs",
    publishedCourses: "Published courses",
    sectionTitle: "Choose your training",
    sectionLead:
      "Explore active programs, published schedules and current enrollment places.",
    loading: "Loading current programs",
    loadProgramsError: "Programs could not be loaded.",
    loadCoursesError: "Course availability could not be loaded.",
    retry: "Retry",
    unavailable: "Unavailable",
    noPrograms: "No programs are available right now.",
    noCourses: "No published courses for this sport right now.",
    available: "places available",
    full: "Enrollment full",
    membership: "Gym access",
    viewPlans: "Compare memberships",
    sessions: "sessions",
    aiAlt: "Athlete training in a performance gym",
    plansCount: "active plans",
  },
  vi: {
    title: "Mỗi buổi tập\nđều có mục tiêu.",
    lead: "Gym, Cầu lông và Bóng rổ. Xem khóa học, lịch tập và số chỗ còn trước khi ghi danh.",
    courses: "Khám phá môn tập",
    gymPlans: "Gói Membership Gym",
    activePrograms: "Môn đang hoạt động",
    publishedCourses: "Khóa học đã mở",
    sectionTitle: "Chọn chương trình tập",
    sectionLead:
      "Xem các môn đang hoạt động, lịch học đã công bố và số chỗ ghi danh hiện có.",
    loading: "Đang tải chương trình hiện tại",
    loadProgramsError: "Chưa tải được danh sách môn.",
    loadCoursesError: "Chưa tải được lịch và tình trạng ghi danh.",
    retry: "Tải lại",
    unavailable: "Chưa tải được",
    noPrograms: "Hiện chưa có chương trình nào đang hoạt động.",
    noCourses: "Môn này hiện chưa có khóa học được công bố.",
    available: "chỗ còn",
    full: "Đã đủ chỗ",
    membership: "Gói tập Gym",
    viewPlans: "So sánh gói tập",
    sessions: "buổi",
    aiAlt: "Vận động viên tập luyện trong phòng Gym",
    plansCount: "gói đang mở bán",
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

function programIcon(name: string): CourtIconName | null {
  const normalized = name.toLocaleLowerCase();
  if (normalized.includes("gym") || normalized.includes("fitness"))
    return "gym";
  if (normalized.includes("badminton") || normalized.includes("cầu lông"))
    return "badminton";
  if (normalized.includes("basketball") || normalized.includes("bóng rổ"))
    return "basketball";
  return null;
}

function programImage(name: string): string | null {
  const normalized = name.toLocaleLowerCase();
  if (normalized.includes("gym") || normalized.includes("fitness"))
    return "/sporthub/court-volt/program-gym.png";
  if (normalized.includes("badminton") || normalized.includes("cầu lông"))
    return "/sporthub/court-volt/course-badminton.png";
  if (normalized.includes("basketball") || normalized.includes("bóng rổ"))
    return "/sporthub/court-volt/course-basketball.png";
  return null;
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
              sport.name.toLocaleLowerCase().includes("gym"))),
      )
      .sort((a, b) => a.sortOrder - b.sortOrder) ?? [];
  const courses = coursesState.data?.items ?? [];
  const courseCount = coursesState.data?.totalCount ?? 0;
  const activeGymPlans =
    packagesState.data?.filter(
      (packageItem) =>
        packageItem.isActive &&
        packageItem.name.toLocaleLowerCase().includes("gym"),
    ) ?? [];

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
            src="/sporthub/court-volt/hero-performance.png"
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

      <section
        id="activities"
        className={styles.programSection}
        aria-labelledby="program-title"
        aria-busy={sportsState.loading || coursesState.loading}
      >
        <header className={styles.sectionHeading}>
          <p className={styles.sectionKicker}>
            {language === "vi"
              ? "DANH MỤC ĐANG HOẠT ĐỘNG"
              : "CURRENT OFFERINGS"}
          </p>
          <h2 id="program-title">{t.sectionTitle}</h2>
          <p>{t.sectionLead}</p>
        </header>

        {(sportsState.error || coursesState.error) && (
          <div className={styles.dataError} role="alert">
            <p>
              {sportsState.error ? t.loadProgramsError : t.loadCoursesError}
            </p>
            <button
              type="button"
              className={styles.retryButton}
              onClick={() => {
                if (sportsState.error) sportsState.reload();
                if (coursesState.error) coursesState.reload();
              }}
            >
              {t.retry}
            </button>
          </div>
        )}

        {sportsState.loading || coursesState.loading ? (
          <div className={styles.programGrid}>
            {[0, 1, 2].map((item) => (
              <div
                className={styles.programSkeleton}
                key={item}
                aria-hidden="true"
              >
                <span />
                <span />
                <span />
              </div>
            ))}
            <span className="sr-only" role="status">
              {t.loading}
            </span>
          </div>
        ) : programs.length ? (
          <div className={styles.programGrid}>
            {programs.map((sport, index) => {
              const sportCourses = courses.filter(
                (course) => course.sportId === sport.sportId,
              );
              const availablePlaces = sportCourses.reduce(
                (total, course) => total + Math.max(course.availableSeats, 0),
                0,
              );
              const icon = programIcon(sport.name);
              const image = programImage(sport.name);
              const isGym = sport.name.toLocaleLowerCase().includes("gym");

              return (
                <article
                  className={`${styles.programCard} ${index === 0 ? styles.featuredCard : ""}`}
                  key={sport.sportId}
                  onPointerMove={(event) => {
                    if (event.pointerType !== "mouse") return;
                    const bounds = event.currentTarget.getBoundingClientRect();
                    event.currentTarget.style.setProperty(
                      "--pointer-x",
                      `${((event.clientX - bounds.left) / bounds.width) * 100}%`,
                    );
                    event.currentTarget.style.setProperty(
                      "--pointer-y",
                      `${((event.clientY - bounds.top) / bounds.height) * 100}%`,
                    );
                  }}
                >
                  {image && (
                    <Image
                      className={styles.programPhoto}
                      src={image}
                      alt=""
                      fill
                      sizes="(max-width: 767px) 100vw, (max-width: 1199px) 50vw, 58vw"
                      aria-hidden="true"
                    />
                  )}
                  <div className={styles.cardTopline}>
                    {icon ? (
                      <CourtIcon name={icon} size={27} />
                    ) : (
                      <span className={styles.programMark} aria-hidden="true">
                        {sport.name.slice(0, 1)}
                      </span>
                    )}
                    {sport.operationType === "GROUP_COURSE" && (
                      <span
                        className={`${styles.availability} ${sportCourses.length && availablePlaces === 0 ? styles.availabilityFull : ""}`}
                      >
                        {coursesState.error
                          ? t.loadCoursesError
                          : sportCourses.length
                            ? availablePlaces
                              ? `${availablePlaces} ${t.available}`
                              : t.full
                            : t.noCourses}
                      </span>
                    )}
                    {isGym && activeGymPlans.length > 0 && (
                      <span className={styles.availability}>
                        {activeGymPlans.length} {t.plansCount}
                      </span>
                    )}
                  </div>

                  <h3>{sport.name}</h3>
                  {sport.description && (
                    <p className={styles.programDescription}>
                      {sport.description}
                    </p>
                  )}

                  {sport.operationType === "GROUP_COURSE" ? (
                    sportCourses.length ? (
                      <div className={styles.courseList}>
                        {sportCourses.slice(0, 2).map((course) => (
                          <Link
                            className={styles.courseRow}
                            href={`/courses/${course.classId}`}
                            key={course.classId}
                          >
                            <span className={styles.courseDetails}>
                              <strong>{course.name}</strong>
                              <span>
                                {formatDate(course.startDate)} ·{" "}
                                {course.numSessions} {t.sessions}
                              </span>
                            </span>
                            <span className={styles.coursePrice}>
                              {formatMoney(course.price)}
                              <CourtIcon name="diagonal" size={16} />
                            </span>
                          </Link>
                        ))}
                      </div>
                    ) : (
                      <p className={styles.emptyCourse}>
                        {coursesState.error ? t.loadCoursesError : t.noCourses}
                      </p>
                    )
                  ) : (
                    <p className={styles.gymDescriptor}>{t.membership}</p>
                  )}

                  {isGym && (
                    <Link className={styles.programLink} href="#pricing">
                      {t.viewPlans}
                      <CourtIcon name="arrow" size={17} />
                    </Link>
                  )}
                </article>
              );
            })}
          </div>
        ) : !sportsState.error ? (
          <div className={styles.emptyPrograms} role="status">
            <p>{t.noPrograms}</p>
          </div>
        ) : null}
      </section>
    </>
  );
}
