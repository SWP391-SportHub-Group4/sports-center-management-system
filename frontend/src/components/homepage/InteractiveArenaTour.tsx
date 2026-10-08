"use client";

import Image from "next/image";
import Link from "next/link";
import { Activity, ArrowRight, MapPin } from "lucide-react";
import { useRef, useState, type KeyboardEvent } from "react";
import { useAuth } from "@/lib/auth";
import styles from "./interactive-arena-tour.module.css";

type Language = "en" | "vi";
type ZoneId = "badminton" | "basketball" | "conditioning";

const zoneOrder: ZoneId[] = ["badminton", "basketball", "conditioning"];

const copy = {
  en: {
    title: "Three disciplines.\nOne connected arena.",
    lead: "SportHub brings court sports, Gym and personal coaching into one training space. Find your rhythm with a class, an individual workout or a game with friends.",
    mapLabel: "FLOOR PLAN",
    mapZones: "SPORT ZONES",
    mapHelp: "Select a sport above or explore a zone on the map.",
    zoneLabel: "SPORT ZONE",
    switcherLabel: "Choose a sport",
    court: "COURT STANDARD",
    lighting: "LIGHTING",
    floor: "PLAYING FLOOR",
    height: "CLEAR HEIGHT",
    focus: "TRAINING FOCUS",
    method: "TRAINING METHOD",
    formats: "TRAINING FORMATS",
    formatsValue: "Gym · Personal training",
    exploreMore: "Explore more",
    exploreDescription: "Explore classes, schedules and member benefits.",
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
    lead: "SportHub kết nối thể thao sân đấu, Gym và huấn luyện cá nhân trong cùng một không gian. Chọn lớp học, buổi tập riêng hoặc trận đấu cùng bạn bè phù hợp với bạn.",
    mapLabel: "SƠ ĐỒ MẶT BẰNG",
    mapZones: "CÁC KHU THỂ THAO",
    mapHelp: "Chọn môn ở phía trên hoặc khám phá trực tiếp trên sơ đồ.",
    zoneLabel: "KHU THỂ THAO",
    switcherLabel: "Chọn môn thể thao",
    court: "TIÊU CHUẨN SÂN",
    lighting: "ÁNH SÁNG",
    floor: "MẶT SÀN",
    height: "ĐỘ CAO THÔNG THỦY",
    focus: "TRỌNG TÂM RÈN LUYỆN",
    method: "PHƯƠNG PHÁP TẬP",
    formats: "HÌNH THỨC TẬP",
    formatsValue: "Gym · Huấn luyện cá nhân",
    exploreMore: "Khám phá thêm",
    exploreDescription: "Xem lớp học, lịch tập và quyền lợi hội viên.",
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

const hotspotClass: Record<ZoneId, string> = {
  badminton: styles.hotspotBadminton,
  basketball: styles.hotspotBasketball,
  conditioning: styles.hotspotConditioning,
};

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

export function InteractiveArenaTour({ language }: { language: Language }) {
  const text = copy[language];
  const { user, loading: authLoading } = useAuth();
  const memberCatalogPath = "/member/discover";
  const memberCatalogHref =
    user?.role === "Member"
      ? memberCatalogPath
      : `/login?next=${encodeURIComponent(memberCatalogPath)}`;
  const [activeZone, setActiveZone] = useState<ZoneId>("badminton");
  const tabRefs = useRef<Record<ZoneId, HTMLButtonElement | null>>({
    badminton: null,
    basketball: null,
    conditioning: null,
  });

  const selected = text.zones[activeZone];
  const metrics: Array<{ label: string; value: string }> =
    activeZone === "badminton"
      ? [
          { label: text.court, value: selected.specOne },
          { label: text.lighting, value: selected.specTwo },
        ]
      : activeZone === "basketball"
        ? [
            { label: text.floor, value: selected.specOne },
            { label: text.height, value: selected.specTwo },
          ]
        : [
            { label: text.focus, value: selected.specOne },
            { label: text.method, value: selected.specTwo },
            { label: text.formats, value: text.formatsValue },
          ];

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
    >
      <header className={styles.tourHeader}>
        <div>
          <h2 id="arena-tour-title">{text.title}</h2>
        </div>
        <p className={styles.tourLead}>{text.lead}</p>
      </header>

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
                {text.zoneLabel}
              </span>
            </div>
            <p className={styles.photoTitle}>{selected.title}</p>
          </div>

          <div className={styles.featureBody}>
            <p className={styles.featureDescription}>{selected.description}</p>
            <div className={styles.metricGrid}>
              {metrics.map((metric) => {
                return (
                  <div className={styles.metric} key={metric.label}>
                    <span className={styles.metricLabel}>{metric.label}</span>
                    <strong>{metric.value}</strong>
                  </div>
                );
              })}
            </div>
            <div className={styles.featureFooter}>
              <p>{text.exploreDescription}</p>
              <Link
                className={styles.memberCta}
                href={memberCatalogHref}
                aria-disabled={authLoading}
                tabIndex={authLoading ? -1 : undefined}
                onClick={(event) => {
                  if (authLoading) event.preventDefault();
                }}
              >
                {text.exploreMore}
                <ArrowRight size={18} strokeWidth={2.2} aria-hidden="true" />
              </Link>
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
