"use client";

import Image from "next/image";
import Link from "next/link";
import { Activity, ArrowUpRight, MapPin, type LucideIcon } from "lucide-react";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { api } from "@/lib/apiClient";
import type { CourseDto, Paged, SportDto } from "@/lib/types";
import styles from "./interactive-arena-tour.module.css";

type Language = "en" | "vi";
type ZoneId = "badminton" | "basketball" | "conditioning";

const zoneOrder: ZoneId[] = ["badminton", "basketball", "conditioning"];

function isCourseDto(value: unknown): value is CourseDto {
  if (!value || typeof value !== "object") return false;
  const course = value as Partial<CourseDto>;
  return (
    Number.isFinite(course.classId) &&
    Number.isFinite(course.sportId) &&
    typeof course.name === "string" &&
    typeof course.status === "string" &&
    Number.isFinite(course.availableSeats) &&
    Number.isFinite(course.numSessions) &&
    Number.isFinite(course.price) &&
    typeof course.startDate === "string"
  );
}

const copy = {
  en: {
    title: "Three disciplines.\nOne connected arena.",
    lead: "Select a zone to compare standards and find an open class.",
    mapLabel: "FLOOR PLAN",
    mapZones: "SPORT ZONES",
    mapHelp: "Choose a sport above or select a zone on the map.",
    live: "CLASS AVAILABILITY",
    liveDescription: "Updates automatically every minute",
    conditioningStatus: "STRENGTH & CONDITIONING",
    liveClasses: "CLASSES LISTED",
    openPlaces: "PLACES AVAILABLE",
    switcherLabel: "Choose a sport",
    openCourses: "Classes open for enrollment",
    classSessions: "sessions",
    placesLeft: "places left",
    weeklySchedule: "Weekly",
    scheduleInDetails: "See full schedule in class details",
    classLoading: "Loading classes and available places…",
    classEmptyHint: "Choose a different sport above or on the map.",
    showMoreClasses: "Show {count} more classes",
    staleSchedule:
      "We couldn't update available places. These results may be out of date; open a class to check its current status.",
    formats: "TRAINING FORMATS",
    formatsValue: "Gym · Personal training",
    court: "COURT STANDARD",
    lighting: "LIGHTING",
    floor: "PLAYING FLOOR",
    height: "CLEAR HEIGHT",
    focus: "TRAINING FOCUS",
    method: "TRAINING METHOD",
    viewDetails: "View class details",
    programsCta: "Explore training options",
    noClass: "No classes are open for enrollment in this sport right now",
    noPlaces: "All listed classes are full",
    loading: "Loading class availability",
    error: "We couldn't load class availability",
    retry: "Try loading classes again",
    selectedAnnouncement: "Selected arena zone",
    mapAlt:
      "Interactive floor plan with badminton courts on the left, basketball court in the center and conditioning lanes on the right.",
    zones: {
      badminton: {
        label: "Badminton",
        short: "BADMINTON",
        title: "Badminton courts",
        description:
          "Quick reactions, crisp rallies and a tournament-ready teal court with non-glare lighting.",
        image: "/sporthub/court-volt/course-badminton.png",
        imageAlt: "Badminton player moving into a fast rally on a teal court",
        specOne: "BWF",
        specTwo: "500+ lx",
      },
      basketball: {
        label: "Basketball",
        short: "BASKETBALL",
        title: "Hardwood court",
        description:
          "A full-court setting for team play, fast transitions and confident finishes under a high arena roof.",
        image: "/sporthub/court-volt/course-basketball.png",
        imageAlt: "Basketball players working through a hardwood court drill",
        specOne: "FIBA MAPLE",
        specTwo: "12 m",
      },
      conditioning: {
        label: "Conditioning",
        short: "CONDITIONING",
        title: "Athletic conditioning",
        description:
          "Build speed and movement quality with strength work, Olympic lifting and VO₂ Max-focused conditioning.",
        image: "/sporthub/court-volt/conditioning-speed-track.png",
        imageAlt: "Athlete sprinting through a speed test on an indoor track",
        specOne: "VO₂ MAX",
        specTwo: "OLYMPIC LIFT",
      },
    },
  },
  vi: {
    title: "Ba bộ môn.\nMột đấu trường kết nối.",
    lead: "Chọn khu để xem tiêu chuẩn và tìm lớp đang nhận đăng ký.",
    mapLabel: "SƠ ĐỒ MẶT BẰNG",
    mapZones: "CÁC KHU THỂ THAO",
    mapHelp: "Chọn môn ở phía trên hoặc chọn khu ngay trên sơ đồ.",
    live: "TÌNH TRẠNG ĐĂNG KÝ",
    liveDescription: "Tự động cập nhật mỗi phút",
    conditioningStatus: "RÈN THỂ LỰC",
    liveClasses: "LỚP ĐƯỢC CÔNG BỐ",
    openPlaces: "CHỖ CÒN",
    switcherLabel: "Chọn môn thể thao",
    openCourses: "Lớp đang mở đăng ký",
    classSessions: "buổi",
    placesLeft: "chỗ còn",
    weeklySchedule: "Hằng tuần",
    scheduleInDetails: "Xem lịch đầy đủ trong chi tiết lớp",
    classLoading: "Đang tải lớp và số chỗ còn…",
    classEmptyHint: "Chọn môn khác ở phía trên hoặc trên sơ đồ.",
    showMoreClasses: "Xem thêm {count} lớp",
    staleSchedule:
      "Chưa cập nhật được số chỗ còn. Dữ liệu có thể đã cũ; hãy mở lớp để xem tình trạng mới nhất.",
    formats: "HÌNH THỨC TẬP",
    formatsValue: "Gym · Huấn luyện cá nhân",
    court: "TIÊU CHUẨN SÂN",
    lighting: "ÁNH SÁNG",
    floor: "MẶT SÀN",
    height: "ĐỘ CAO THÔNG THỦY",
    focus: "TRỌNG TÂM RÈN LUYỆN",
    method: "PHƯƠNG PHÁP TẬP",
    viewDetails: "Xem lịch và đăng ký",
    programsCta: "Khám phá các hình thức tập",
    noClass: "Môn này hiện chưa có lớp đang nhận đăng ký",
    noPlaces: "Các lớp được công bố hiện đã kín chỗ",
    loading: "Đang tải tình trạng đăng ký lớp",
    error: "Chưa tải được tình trạng đăng ký lớp",
    retry: "Thử tải lại danh sách lớp",
    selectedAnnouncement: "Khu vực đang chọn",
    mapAlt:
      "Sơ đồ mặt bằng tương tác gồm sân cầu lông bên trái, sân bóng rổ ở giữa và làn thể lực bên phải.",
    zones: {
      badminton: {
        label: "Cầu lông",
        short: "CẦU LÔNG",
        title: "Cụm sân cầu lông",
        description:
          "Tốc độ phản xạ, những pha cầu liền mạch và mặt sân xanh theo chuẩn thi đấu cùng hệ đèn hạn chế chói.",
        image: "/sporthub/court-volt/course-badminton.png",
        imageAlt:
          "Vận động viên cầu lông di chuyển trong pha cầu nhanh trên sân xanh",
        specOne: "BWF",
        specTwo: "500+ lux",
      },
      basketball: {
        label: "Bóng rổ",
        short: "BÓNG RỔ",
        title: "Sân bóng rổ hardwood",
        description:
          "Không gian thi đấu toàn sân cho phối hợp đồng đội, chuyển trạng thái nhanh và những pha lên rổ dứt khoát.",
        image: "/sporthub/court-volt/course-basketball.png",
        imageAlt: "Đội bóng rổ luyện tập phối hợp trên sàn gỗ",
        specOne: "GỖ MAPLE",
        specTwo: "12 m",
      },
      conditioning: {
        label: "Thể lực",
        short: "THỂ LỰC",
        title: "Tối ưu hiệu năng vận động",
        description:
          "Phát triển tốc độ và chất lượng chuyển động với rèn sức mạnh, cử tạ Olympic và chương trình hướng tới VO₂ Max.",
        image: "/sporthub/court-volt/conditioning-speed-track.png",
        imageAlt:
          "Vận động viên chạy bài kiểm tra tốc độ trên đường chạy trong nhà",
        specOne: "VO₂ MAX",
        specTwo: "CỬ TẠ OLYMPIC",
      },
    },
  },
} as const;

type TourProps = {
  language: Language;
  sports: SportDto[];
  courses: CourseDto[];
  loading: boolean;
  hasError: boolean;
  onRetry: () => void;
};

function sportForZone(zone: ZoneId, sports: SportDto[]) {
  const patterns: Record<ZoneId, RegExp> = {
    badminton: /badminton|cầu\s*lông/i,
    basketball: /basketball|bóng\s*rổ/i,
    conditioning: /gym|fitness|conditioning|thể\s*lực/i,
  };
  return sports.find((sport) => patterns[zone].test(sport.name));
}

const hotspotClass: Record<ZoneId, string> = {
  badminton: styles.hotspotBadminton,
  basketball: styles.hotspotBasketball,
  conditioning: styles.hotspotConditioning,
};

function formatCount(value: number, language: Language) {
  return new Intl.NumberFormat(language === "vi" ? "vi-VN" : "en-US").format(
    Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0,
  );
}

function formatCourseStart(course: CourseDto, language: Language) {
  const hasTime = Boolean(course.firstSessionStartUtc);
  const value = hasTime
    ? new Date(course.firstSessionStartUtc!)
    : new Date(`${course.startDate}T00:00:00+07:00`);

  if (Number.isNaN(value.getTime())) return course.startDate;

  return new Intl.DateTimeFormat(language === "vi" ? "vi-VN" : "en-US", {
    dateStyle: "medium",
    ...(hasTime ? { timeStyle: "short" as const } : {}),
    timeZone: "Asia/Ho_Chi_Minh",
  }).format(value);
}

function formatWeeklySchedule(course: CourseDto, language: Language) {
  if (course.numSessions <= 1) return null;

  const rules = Array.isArray(course.scheduleRules)
    ? course.scheduleRules.filter(
        (rule) =>
          Number.isInteger(rule?.dayOfWeek) &&
          rule.dayOfWeek >= 0 &&
          rule.dayOfWeek <= 6 &&
          typeof rule.startTimeLocal === "string" &&
          /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(rule.startTimeLocal),
      )
    : [];

  if (!rules.length) return copy[language].scheduleInDetails;

  const locale = language === "vi" ? "vi-VN" : "en-US";
  const timeGroups = new Map<string, number[]>();

  for (const rule of rules) {
    const days = timeGroups.get(rule.startTimeLocal) ?? [];
    if (!days.includes(rule.dayOfWeek)) days.push(rule.dayOfWeek);
    timeGroups.set(rule.startTimeLocal, days);
  }

  const schedule = [...timeGroups.entries()]
    .sort(([timeA], [timeB]) => timeA.localeCompare(timeB))
    .map(([time, days]) => {
      const [hour, minute] = time.split(":").map(Number);
      const localClock = new Date(Date.UTC(2023, 0, 1, hour, minute));
      const formattedTime = new Intl.DateTimeFormat(locale, {
        hour: "numeric",
        minute: "2-digit",
        timeZone: "UTC",
      }).format(localClock);
      const formattedDays = [...days]
        .sort((a, b) => a - b)
        .map((day) =>
          new Intl.DateTimeFormat(locale, {
            weekday: "short",
            timeZone: "UTC",
          }).format(new Date(Date.UTC(2023, 0, 1 + day))),
        )
        .join(", ");

      return `${formattedDays} · ${formattedTime}`;
    });

  return `${copy[language].weeklySchedule}: ${schedule.join(" / ")}`;
}

function formatCoursePrice(value: number, language: Language) {
  return new Intl.NumberFormat(language === "vi" ? "vi-VN" : "en-US", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(value);
}

function ZoneFloorPlan({
  label,
  onSelect,
}: {
  label: string;
  onSelect: (zone: ZoneId) => void;
}) {
  return (
    <svg
      className={styles.floorPlan}
      viewBox="0 0 900 520"
      role="img"
      aria-labelledby="arena-map-title"
      focusable="false"
    >
      <title id="arena-map-title">{label}</title>
      <defs>
        <pattern
          id="arena-grid"
          width="24"
          height="24"
          patternUnits="userSpaceOnUse"
        >
          <path d="M 24 0 L 0 0 0 24" className={styles.gridLine} />
        </pattern>
        <linearGradient id="arena-depth" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" className={styles.depthTop} />
          <stop offset="1" className={styles.depthBottom} />
        </linearGradient>
      </defs>

      <path
        d="M58 64 839 64 868 91 868 432 837 462 58 462 32 435 32 91Z"
        className={styles.floorExtrusion}
      />
      <path
        d="M58 38 839 38 868 65 868 406 837 436 58 436 32 409 32 65Z"
        fill="url(#arena-depth)"
        className={styles.floorPlate}
      />
      <path
        d="M58 38 839 38 868 65 868 406 837 436 58 436 32 409 32 65Z"
        fill="url(#arena-grid)"
        className={styles.floorGrid}
      />
      <path d="M317 65v344M583 65v344" className={styles.zoneDivider} />

      <g
        className={styles.mapZone}
        data-zone="badminton"
        onPointerEnter={(event) => {
          if (event.pointerType === "mouse") onSelect("badminton");
        }}
        onClick={() => onSelect("badminton")}
      >
        <rect
          x="55"
          y="84"
          width="250"
          height="322"
          rx="10"
          className={styles.zoneSurface}
        />
        <rect
          x="75"
          y="101"
          width="210"
          height="285"
          className={styles.courtLine}
        />
        <path
          d="M75 243.5h210M180 101v285M92 101v285M268 101v285M75 164h210M75 323h210"
          className={styles.courtLine}
        />
        <path d="M180 225v37" className={styles.netLine} />
      </g>

      <g
        className={styles.mapZone}
        data-zone="basketball"
        onPointerEnter={(event) => {
          if (event.pointerType === "mouse") onSelect("basketball");
        }}
        onClick={() => onSelect("basketball")}
      >
        <rect
          x="325"
          y="84"
          width="250"
          height="322"
          rx="10"
          className={styles.zoneSurface}
        />
        <rect
          x="345"
          y="101"
          width="210"
          height="285"
          className={styles.courtLine}
        />
        <path
          d="M450 101v285M345 243.5h210M345 172h38v143h-38M555 172h-38v143h38"
          className={styles.courtLine}
        />
        <path
          d="M383 174a67 67 0 0 0 0 139M517 174a67 67 0 0 1 0 139"
          className={styles.courtArc}
        />
        <circle cx="450" cy="243.5" r="34" className={styles.courtArc} />
        <circle cx="383" cy="243.5" r="5" className={styles.hoopMark} />
        <circle cx="517" cy="243.5" r="5" className={styles.hoopMark} />
      </g>

      <g
        className={styles.mapZone}
        data-zone="conditioning"
        onPointerEnter={(event) => {
          if (event.pointerType === "mouse") onSelect("conditioning");
        }}
        onClick={() => onSelect("conditioning")}
      >
        <rect
          x="595"
          y="84"
          width="250"
          height="322"
          rx="10"
          className={styles.zoneSurface}
        />
        <rect
          x="620"
          y="101"
          width="200"
          height="285"
          rx="48"
          className={styles.trackLine}
        />
        <path
          d="M660 102v283M780 102v283M620 172h200M620 315h200"
          className={styles.trackLine}
        />
        <path d="M660 243h120" className={styles.trackDash} />
        <circle cx="660" cy="142" r="9" className={styles.stationMark} />
        <circle cx="780" cy="345" r="9" className={styles.stationMark} />
      </g>
    </svg>
  );
}

export function InteractiveArenaTour({
  language,
  sports,
  courses,
  loading,
  hasError,
  onRetry,
}: TourProps) {
  const text = copy[language];
  const [activeZone, setActiveZone] = useState<ZoneId>("badminton");
  const [freshCourses, setFreshCourses] = useState<CourseDto[] | null>(null);
  const [refreshFailed, setRefreshFailed] = useState(false);
  const tabRefs = useRef<Record<ZoneId, HTMLButtonElement | null>>({
    badminton: null,
    basketball: null,
    conditioning: null,
  });

  useEffect(() => {
    let active = true;
    let controller: AbortController | null = null;
    let timeout: number | null = null;

    const refresh = () => {
      if (document.visibilityState !== "visible" || controller) return;
      controller = new AbortController();
      const requestController = controller;
      timeout = window.setTimeout(() => requestController.abort(), 15_000);
      void api
        .get<Paged<CourseDto>>("/api/classes", {
          query: { page: 1, pageSize: 100 },
          anonymous: true,
          signal: requestController.signal,
        })
        .then((result) => {
          if (active) {
            if (!Array.isArray(result?.items))
              throw new Error("Invalid class response");
            setFreshCourses(result.items.filter(isCourseDto));
            setRefreshFailed(false);
          }
        })
        .catch(() => {
          if (active) setRefreshFailed(true);
        })
        .finally(() => {
          if (timeout !== null) window.clearTimeout(timeout);
          timeout = null;
          if (controller === requestController) controller = null;
        });
    };

    const interval = window.setInterval(refresh, 60_000);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      active = false;
      controller?.abort();
      if (timeout !== null) window.clearTimeout(timeout);
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, []);

  const sourceCourses = (freshCourses ?? courses).filter(isCourseDto);
  const selected = text.zones[activeZone];
  const selectedSport = sportForZone(activeZone, sports);
  const publishedCourses = sourceCourses.filter(
    (course) =>
      course.status === "PUBLISHED" &&
      selectedSport !== undefined &&
      course.sportId === selectedSport.sportId,
  );
  const availableCourses = publishedCourses
    .filter((course) => course.availableSeats > 0)
    .sort((a, b) => {
      const aStart = a.firstSessionStartUtc ?? a.startDate;
      const bStart = b.firstSessionStartUtc ?? b.startDate;
      return new Date(aStart).getTime() - new Date(bStart).getTime();
    });
  const openPlaces = publishedCourses.reduce(
    (total, course) => total + Math.max(0, Math.trunc(course.availableSeats)),
    0,
  );
  const firstCourse = availableCourses[0];
  const scheduleUnavailable = hasError;
  const metrics: Array<{ label: string; value: string; icon?: LucideIcon }> =
    activeZone === "badminton"
      ? [
          { label: text.court, value: selected.specOne },
          { label: text.lighting, value: selected.specTwo },
          {
            label: text.liveClasses,
            value:
              loading || scheduleUnavailable
                ? "—"
                : formatCount(publishedCourses.length, language),
            icon: Activity,
          },
          {
            label: text.openPlaces,
            value:
              loading || scheduleUnavailable
                ? "—"
                : formatCount(openPlaces, language),
          },
        ]
      : activeZone === "basketball"
        ? [
            { label: text.floor, value: selected.specOne },
            { label: text.height, value: selected.specTwo },
            {
              label: text.liveClasses,
              value:
                loading || scheduleUnavailable
                  ? "—"
                  : formatCount(publishedCourses.length, language),
              icon: Activity,
            },
            {
              label: text.openPlaces,
              value:
                loading || scheduleUnavailable
                  ? "—"
                  : formatCount(openPlaces, language),
            },
          ]
        : [
            { label: text.focus, value: selected.specOne },
            { label: text.method, value: selected.specTwo },
            { label: text.conditioningStatus, value: selected.label },
            { label: text.formats, value: text.formatsValue },
          ];

  const courseHref = firstCourse ? `/courses/${firstCourse.classId}` : null;
  const ctaHref = activeZone === "conditioning" ? "#programs" : courseHref;
  const ctaLabel =
    activeZone === "conditioning" ? text.programsCta : text.viewDetails;
  const scheduleFallback = scheduleUnavailable
    ? text.error
    : publishedCourses.length
      ? text.noPlaces
      : text.noClass;
  const renderCourseLink = (course: CourseDto) => {
    const weeklySchedule = formatWeeklySchedule(course, language);

    return (
      <Link
        className={styles.courseRow}
        href={`/courses/${course.classId}`}
        key={course.classId}
      >
        <span className={styles.courseName}>
          <strong>{course.name}</strong>
          <span>
            {formatCourseStart(course, language)} · {course.numSessions}{" "}
            {text.classSessions}
          </span>
          {weeklySchedule && (
            <span className={styles.courseSchedule}>{weeklySchedule}</span>
          )}
        </span>
        <span className={styles.courseFacts}>
          <strong>{formatCoursePrice(course.price, language)}</strong>
          <span>
            {formatCount(course.availableSeats, language)} {text.placesLeft}
          </span>
        </span>
        <ArrowUpRight size={16} aria-hidden="true" />
      </Link>
    );
  };

  const handleTabKeyDown = (
    event: KeyboardEvent<HTMLButtonElement>,
    currentZone: ZoneId,
  ) => {
    const currentIndex = zoneOrder.indexOf(currentZone);
    const nextIndex =
      event.key === "ArrowRight"
        ? (currentIndex + 1) % zoneOrder.length
        : event.key === "ArrowLeft"
          ? (currentIndex - 1 + zoneOrder.length) % zoneOrder.length
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? zoneOrder.length - 1
              : -1;

    if (nextIndex < 0) return;
    event.preventDefault();
    const nextZone = zoneOrder[nextIndex];
    setActiveZone(nextZone);
    tabRefs.current[nextZone]?.focus();
  };

  return (
    <section
      id="activities"
      className={styles.tour}
      data-theme="light"
      data-zone={activeZone}
      aria-labelledby="arena-tour-title"
      aria-busy={loading}
    >
      <header className={styles.tourHeader}>
        <div>
          <h2 id="arena-tour-title">{text.title}</h2>
        </div>
        <p className={styles.tourLead}>{text.lead}</p>
      </header>

      {hasError && (
        <div className={styles.dataError} role="alert">
          <span>{text.error}</span>
          <button type="button" onClick={onRetry}>
            {text.retry}
          </button>
        </div>
      )}

      <div className={styles.tourGrid}>
        <div className={styles.mapColumn}>
          <div
            className={styles.zoneTabs}
            role="tablist"
            aria-label={text.switcherLabel}
          >
            {zoneOrder.map((zone) => {
              const zoneText = text.zones[zone];
              const Icon = zone === "conditioning" ? Activity : MapPin;
              return (
                <button
                  key={zone}
                  ref={(node) => {
                    tabRefs.current[zone] = node;
                  }}
                  id={`arena-tab-${zone}`}
                  className={styles.zoneTab}
                  type="button"
                  role="tab"
                  aria-selected={activeZone === zone}
                  aria-controls="arena-feature-panel"
                  tabIndex={activeZone === zone ? 0 : -1}
                  onClick={() => setActiveZone(zone)}
                  onPointerEnter={(event) => {
                    if (event.pointerType === "mouse") setActiveZone(zone);
                  }}
                  onFocus={() => setActiveZone(zone)}
                  onKeyDown={(event) => handleTabKeyDown(event, zone)}
                >
                  <Icon size={16} strokeWidth={1.8} aria-hidden="true" />
                  {zoneText.label}
                </button>
              );
            })}
          </div>

          <div className={styles.mapShell}>
            <div className={styles.mapHeading}>
              <span>{text.mapLabel}</span>
              <span>{text.mapZones}</span>
            </div>
            <div className={styles.mapCanvas} data-zone={activeZone}>
              <ZoneFloorPlan label={text.mapAlt} onSelect={setActiveZone} />
              <div className={styles.hotspots}>
                {zoneOrder.map((zone, index) => {
                  const zoneText = text.zones[zone];
                  return (
                    <button
                      key={zone}
                      type="button"
                      className={`${styles.hotspot} ${hotspotClass[zone]} ${activeZone === zone ? styles.hotspotActive : ""}`}
                      aria-label={zoneText.label}
                      aria-pressed={activeZone === zone}
                      aria-controls="arena-feature-panel"
                      onClick={() => setActiveZone(zone)}
                      onPointerEnter={(event) => {
                        if (event.pointerType === "mouse") setActiveZone(zone);
                      }}
                      onFocus={() => setActiveZone(zone)}
                    >
                      <span
                        className={styles.hotspotPulse}
                        aria-hidden="true"
                      />
                      <span className={styles.hotspotCore} aria-hidden="true">
                        <MapPin size={17} strokeWidth={2} />
                      </span>
                      <span className={styles.hotspotLabel}>
                        <small>0{index + 1}</small> {zoneText.short}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
            <p className={styles.mapHelp}>{text.mapHelp}</p>
          </div>
        </div>

        <article
          className={styles.featurePanel}
          id="arena-feature-panel"
          role="tabpanel"
          aria-labelledby={`arena-tab-${activeZone}`}
          tabIndex={0}
          data-zone={activeZone}
        >
          <div className={styles.featurePhoto} key={activeZone}>
            <Image
              src={selected.image}
              alt={selected.imageAlt}
              fill
              sizes="(max-width: 1023px) 100vw, 46vw"
              priority={false}
            />
            <div className={styles.featurePhotoScrim} aria-hidden="true" />
            <div className={styles.photoTopline}>
              <span>ZONE 0{zoneOrder.indexOf(activeZone) + 1}</span>
              <span className={styles.photoLive}>
                <span aria-hidden="true" />
                {activeZone === "conditioning"
                  ? text.conditioningStatus
                  : text.live}
              </span>
            </div>
            <p className={styles.photoTitle}>{selected.title}</p>
          </div>

          <div className={styles.featureBody}>
            <p className={styles.featureDescription}>{selected.description}</p>
            <div className={styles.metricGrid}>
              {metrics.map((metric) => {
                const MetricIcon = metric.icon;
                return (
                  <div className={styles.metric} key={metric.label}>
                    <span className={styles.metricLabel}>
                      {MetricIcon && (
                        <MetricIcon
                          size={13}
                          strokeWidth={2}
                          aria-hidden="true"
                        />
                      )}
                      {metric.label}
                    </span>
                    <strong>{metric.value}</strong>
                  </div>
                );
              })}
            </div>
            {activeZone !== "conditioning" && (
              <div className={styles.courseOfferings}>
                <div className={styles.courseOfferingsHeading}>
                  <h3>{text.openCourses}</h3>
                  {!loading &&
                    !scheduleUnavailable &&
                    availableCourses.length > 0 && (
                      <span>
                        {formatCount(availableCourses.length, language)}
                      </span>
                    )}
                </div>
                {loading ? (
                  <p className={styles.courseEmpty} role="status">
                    {text.classLoading}
                  </p>
                ) : scheduleUnavailable ? (
                  <p className={styles.courseEmpty} role="status">
                    {text.error}
                  </p>
                ) : availableCourses.length ? (
                  <>
                    <div className={styles.courseList}>
                      {availableCourses.slice(0, 2).map(renderCourseLink)}
                    </div>
                    {availableCourses.length > 2 && (
                      <details className={styles.moreCourses}>
                        <summary>
                          {text.showMoreClasses.replace(
                            "{count}",
                            formatCount(availableCourses.length - 2, language),
                          )}
                        </summary>
                        <div className={styles.courseList}>
                          {availableCourses.slice(2).map(renderCourseLink)}
                        </div>
                      </details>
                    )}
                  </>
                ) : (
                  <p className={styles.courseEmpty} role="status">
                    {publishedCourses.length ? text.noPlaces : text.noClass}{" "}
                    <span>{text.classEmptyHint}</span>
                  </p>
                )}
                {refreshFailed && !scheduleUnavailable && (
                  <p className={styles.staleSchedule} role="status">
                    {text.staleSchedule}
                  </p>
                )}
              </div>
            )}
            <div className={styles.featureFooter}>
              <p>
                {activeZone === "conditioning"
                  ? text.formatsValue
                  : loading
                    ? text.loading
                    : scheduleUnavailable
                      ? text.error
                      : publishedCourses.length
                        ? openPlaces > 0
                          ? text.liveDescription
                          : text.noPlaces
                        : text.noClass}
              </p>
              {ctaHref ? (
                <Link className={styles.featureCta} href={ctaHref}>
                  {ctaLabel}
                  <ArrowUpRight
                    size={17}
                    strokeWidth={1.8}
                    aria-hidden="true"
                  />
                </Link>
              ) : (
                <span className={styles.featureCtaDisabled}>
                  {scheduleFallback}
                </span>
              )}
            </div>
          </div>
        </article>
      </div>
      <p className="sr-only" aria-live="polite" aria-atomic="true">
        {text.selectedAnnouncement}: {selected.label}
      </p>
    </section>
  );
}
