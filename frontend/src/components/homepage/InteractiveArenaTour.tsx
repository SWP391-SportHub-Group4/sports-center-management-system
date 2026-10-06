"use client";

import Image from "next/image";
import Link from "next/link";
import { Activity, ArrowUpRight, MapPin, type LucideIcon } from "lucide-react";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { api } from "@/lib/apiClient";
import type {
  CourseDto,
  MembershipPackageDto,
  Paged,
  SportDto,
} from "@/lib/types";
import styles from "./interactive-arena-tour.module.css";

type Language = "en" | "vi";
type ZoneId = "badminton" | "basketball" | "conditioning";

const zoneOrder: ZoneId[] = ["badminton", "basketball", "conditioning"];

const copy = {
  en: {
    kicker: "COURT & VOLT · ARENA TOUR",
    title: "Three disciplines.\nOne connected arena.",
    lead: "Move through the floor plan to find your court, see the performance details and check the latest class availability.",
    mapLabel: "INTERACTIVE FLOOR PLAN",
    mapHelp: "Select a zone on the map or use the switcher.",
    live: "LIVE SCHEDULE",
    liveDescription: "Availability refreshes every minute",
    conditioningStatus: "PERFORMANCE PROGRAM",
    planDescription: "Current membership plans",
    liveClasses: "PUBLISHED CLASSES",
    openPlaces: "OPEN PLACES",
    switcherLabel: "Switch arena zone",
    selectedSuffix: "selected",
    plans: "ACTIVE PLANS",
    access: "ACCESS",
    court: "COURT STANDARD",
    lighting: "LIGHTING",
    floor: "PLAYING FLOOR",
    height: "CLEAR HEIGHT",
    focus: "PERFORMANCE TEST",
    method: "TRAINING METHOD",
    viewDetails: "View class details",
    plansCta: "Explore membership plans",
    noClass: "No published classes right now",
    noPlaces: "All current classes are full",
    loading: "Loading current availability",
    error: "Live schedule unavailable",
    retry: "Retry schedule",
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
    kicker: "COURT & VOLT · KHÁM PHÁ TỔ HỢP",
    title: "Ba bộ môn.\nMột đấu trường kết nối.",
    lead: "Chọn khu vực trên sơ đồ để xem không gian, tiêu chuẩn vận hành và lịch học mới nhất.",
    mapLabel: "SƠ ĐỒ MẶT BẰNG TƯƠNG TÁC",
    mapHelp: "Chọn một khu vực trên sơ đồ hoặc dùng thanh chuyển nhanh.",
    live: "LỊCH HỌC TRỰC TIẾP",
    liveDescription: "Số chỗ được làm mới mỗi phút",
    conditioningStatus: "CHƯƠNG TRÌNH THỂ LỰC",
    planDescription: "Các gói Membership hiện có",
    liveClasses: "LỚP ĐÃ CÔNG BỐ",
    openPlaces: "CHỖ CÒN",
    switcherLabel: "Chọn khu vực",
    selectedSuffix: "đang chọn",
    plans: "GÓI ĐANG MỞ",
    access: "HÌNH THỨC TẬP",
    court: "TIÊU CHUẨN SÂN",
    lighting: "ÁNH SÁNG",
    floor: "MẶT SÀN",
    height: "ĐỘ CAO THÔNG THỦY",
    focus: "ĐÁNH GIÁ HIỆU NĂNG",
    method: "PHƯƠNG PHÁP TẬP",
    viewDetails: "Xem lịch và đăng ký",
    plansCta: "Khám phá gói tập",
    noClass: "Hiện chưa có lớp được công bố",
    noPlaces: "Các lớp hiện tại đã đủ chỗ",
    loading: "Đang tải tình trạng chỗ",
    error: "Chưa tải được lịch trực tiếp",
    retry: "Tải lại lịch",
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
  memberships: MembershipPackageDto[] | null;
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
    value,
  );
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
  memberships,
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
    let requestInFlight = false;

    const refresh = () => {
      if (document.visibilityState !== "visible" || requestInFlight) return;
      requestInFlight = true;
      void api
        .get<Paged<CourseDto>>("/api/classes", {
          query: { page: 1, pageSize: 100 },
          anonymous: true,
        })
        .then((result) => {
          if (active) {
            setFreshCourses(result.items);
            setRefreshFailed(false);
          }
        })
        .catch(() => {
          if (active) setRefreshFailed(true);
        })
        .finally(() => {
          requestInFlight = false;
        });
    };

    const interval = window.setInterval(refresh, 60_000);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      active = false;
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, []);

  const sourceCourses = freshCourses ?? courses;
  const selected = text.zones[activeZone];
  const selectedSport = sportForZone(activeZone, sports);
  const publishedCourses = sourceCourses.filter(
    (course) =>
      course.status === "PUBLISHED" &&
      selectedSport !== undefined &&
      course.sportId === selectedSport.sportId,
  );
  const openPlaces = publishedCourses.reduce(
    (total, course) => total + Math.max(course.availableSeats, 0),
    0,
  );
  const activePlans = (memberships ?? []).filter(
    (plan) =>
      plan.isActive && /gym|fitness|conditioning|thể lực/i.test(plan.name),
  ).length;
  const firstCourse = publishedCourses.find(
    (course) => course.availableSeats > 0,
  );
  const scheduleUnavailable = hasError || refreshFailed;
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
            {
              label: text.plans,
              value:
                memberships === null ? "—" : formatCount(activePlans, language),
            },
            { label: text.access, value: "GYM + PT" },
          ];

  const courseHref = firstCourse ? `/courses/${firstCourse.classId}` : null;
  const ctaHref = activeZone === "conditioning" ? "#pricing" : courseHref;
  const ctaLabel =
    activeZone === "conditioning" ? text.plansCta : text.viewDetails;
  const scheduleFallback = scheduleUnavailable
    ? text.error
    : publishedCourses.length
      ? text.noPlaces
      : text.noClass;

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
      data-zone={activeZone}
      aria-labelledby="arena-tour-title"
      aria-busy={loading}
    >
      <header className={styles.tourHeader}>
        <div>
          <p className={styles.tourKicker}>{text.kicker}</p>
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
              <span>LEVEL 01 / 01</span>
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
                      aria-label={`${zoneText.label} ${text.selectedSuffix}`}
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
            <div className={styles.featureFooter}>
              <p>
                {activeZone === "conditioning"
                  ? text.planDescription
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
