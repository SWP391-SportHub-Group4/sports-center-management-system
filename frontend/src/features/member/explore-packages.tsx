"use client";

import { useState, type CSSProperties, type ReactNode } from "react";
import Link from "next/link";
import {
  isRetiredActivityPackage,
  parseMembershipCatalog,
} from "@/features/membership";
import { api } from "@/lib/apiClient";
import { addDaysIso, formatDate, formatMoney, todayIso } from "@/lib/format";
import { useLanguage } from "@/lib/language";
import { hasService } from "@/lib/sports";
import { useApi } from "@/lib/useApi";
import type {
  CourseDto,
  CourtRateDto,
  MemberPackageDto,
  MembershipPackageDto,
  Paged,
  RoomTypeDto,
  SportDto,
} from "@/lib/types";
import {
  emblemForSport,
  membershipEnd,
  monthsOf,
  sportLabel,
  type ServiceKind,
} from "./service-kinds";
import { KindTile, TypeFilter, type FilterValue } from "./service-ui";
import { useStartCheckout } from "./use-start-checkout";
import styles from "./explore-packages.module.css";

const WEEKDAY = {
  vi: ["", "T2", "T3", "T4", "T5", "T6", "T7", "CN"],
  en: ["", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
};

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/gi, "d")
    .toLowerCase();
}

export function ExplorePackages({
  filter,
  onFilter,
  sportId,
}: {
  filter: FilterValue;
  onFilter: (next: FilterValue) => void;
  sportId: number | null;
}) {
  const { language } = useLanguage();
  const vi = language === "vi";
  const tx = (v: string, e: string) => (vi ? v : e);
  const [query, setQuery] = useState("");
  const checkout = useStartCheckout();

  const owned = useApi(
    async (signal) =>
      (
        await api.get<MemberPackageDto[]>("/api/members/me/packages", {
          signal,
        })
      ).filter((row) => !isRetiredActivityPackage(row.packageName)),
    [],
  );
  const catalog = useApi(
    async (signal) =>
      parseMembershipCatalog(
        await api.get<unknown>("/api/membership-packages", { signal }),
      ),
    [],
  );
  const courses = useApi(
    async (signal) =>
      (
        await api.get<Paged<CourseDto>>("/api/classes", {
          query: { page: 1, pageSize: 100 },
          anonymous: true,
          signal,
        })
      ).items,
    [],
  );
  const sports = useApi(
    (signal) => api.get<SportDto[]>("/api/sports", { anonymous: true, signal }),
    [],
  );
  const rates = useApi(
    (signal) =>
      api.get<CourtRateDto[]>("/api/court-rates", { signal }).catch(() => []),
    [],
  );
  const roomTypes = useApi(
    (signal) =>
      api.get<RoomTypeDto[]>("/api/room-types", { signal }).catch(() => []),
    [],
  );
  const needle = normalize(query.trim());
  const match = (...parts: (string | null | undefined)[]) =>
    !needle || normalize(parts.filter(Boolean).join(" ")).includes(needle);

  const gymPlans = (catalog.data ?? [])
    .filter((p) => p.isActive)
    .sort((a, b) => a.durationDays - b.durationDays);
  const baseMonthly =
    gymPlans.find((p) => p.durationDays >= 28 && p.durationDays <= 31)?.price ??
    null;
  const classRows = (courses.data ?? []).filter(
    (c) =>
      c.status === "PUBLISHED" &&
      c.availableSeats > 0 &&
      (!sportId || c.sportId === sportId),
  );
  const courtSports = (sports.data ?? []).filter(
    (s) => s.isActive && hasService(s, "COURT_RENTAL"),
  );

  // Gói dài hạn xếp tăng dần theo thời hạn; vé 1 ngày luôn đứng cuối nên gói mới thêm vào trước nó.
  const gymVisible = gymPlans
    .filter((p) => match(p.name, p.description, "gym"))
    .sort(
      (a, b) =>
        Number(a.durationDays === 1) - Number(b.durationDays === 1) ||
        a.durationDays - b.durationDays,
    );
  const classVisible = classRows.filter((c) =>
    match(c.name, c.sportName, c.coachName, c.roomName),
  );
  const courtVisible = courtSports.filter((s) =>
    match(s.name, "thuê sân court"),
  );
  const counts: Partial<Record<FilterValue, number>> = {
    all: gymVisible.length + classVisible.length + courtVisible.length,
    gym: gymVisible.length,
    class: classVisible.length,
    court: courtVisible.length,
  };
  const show = (kind: ServiceKind) => filter === "all" || filter === kind;

  const pendingPlan = (packageId: number) =>
    owned.data?.find(
      (o) =>
        o.packageId === packageId &&
        o.status.toUpperCase() === "PENDING_PAYMENT",
    );
  const activePlan = (packageId: number) =>
    owned.data?.find(
      (o) => o.packageId === packageId && o.status.toUpperCase() === "ACTIVE",
    );
  const today = todayIso();
  const latestEnd = (owned.data ?? [])
    .filter(
      (o) =>
        o.status.toUpperCase() === "ACTIVE" && o.endDate.slice(0, 10) >= today,
    )
    .map((o) => o.endDate.slice(0, 10))
    .sort()
    .pop();
  const membershipStart = latestEnd ? addDaysIso(latestEnd, 1) : today;

  const loadingAll = catalog.loading && courses.loading && sports.loading;
  const nothing = !loadingAll && counts.all === 0;
  let order = 0;

  return (
    <div className={styles.page}>
      <div className={styles.toolbar}>
        <TypeFilter
          value={filter}
          onChange={onFilter}
          counts={counts}
          vi={vi}
          label={tx("Lọc theo loại gói", "Filter by package type")}
        />
        <label className={styles.search}>
          <span className="sr-only">{tx("Tìm gói", "Search packages")}</span>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={tx(
              "Tìm gói, môn, huấn luyện viên…",
              "Search packages, sports, coaches…",
            )}
          />
        </label>
      </div>

      {nothing && (
        <p className={styles.none} role="status">
          {tx(
            "Không có gói nào khớp. Thử bỏ bộ lọc hoặc đổi từ khóa.",
            "No packages match. Try clearing the filter or the keyword.",
          )}
        </p>
      )}

      {show("gym") &&
        (gymVisible.length > 0 || catalog.loading || catalog.error) && (
          <Section kind="gym" emblem="gym" title="Gym Membership">
            {catalog.loading && !catalog.data ? (
              <p className={styles.note} role="status">
                {tx("Đang tải gói Gym…", "Loading Gym packages…")}
              </p>
            ) : catalog.error ? (
              <Retry
                message={tx(
                  "Chưa tải được gói Gym.",
                  "Could not load Gym packages.",
                )}
                onRetry={catalog.reload}
                label={tx("Tải lại", "Reload")}
              />
            ) : (
              <div
                className={styles.tiers}
                role="region"
                aria-label={tx("Các gói Gym", "Gym plans")}
                tabIndex={0}
              >
                {gymVisible.map((p) => (
                  <GymTier
                    key={p.packageId}
                    plan={p}
                    baseMonthly={baseMonthly}
                    pending={!!pendingPlan(p.packageId)}
                    active={activePlan(p.packageId)}
                    start={membershipStart}
                    busy={checkout.busyId === `gym:${p.packageId}`}
                    error={
                      checkout.error?.id === `gym:${p.packageId}`
                        ? checkout.error.message
                        : null
                    }
                    index={order++}
                    onChoose={() =>
                      checkout.start(`gym:${p.packageId}`, {
                        kind: "membership",
                        body: { packageId: p.packageId, allowStacking: false },
                      })
                    }
                  />
                ))}
              </div>
            )}
          </Section>
        )}

      {show("class") &&
        (classVisible.length > 0 || courses.loading || courses.error) && (
          <Section
            kind="class"
            emblem="whistle"
            title={tx("Lớp nhóm", "Group classes")}
          >
            {courses.loading && !courses.data ? (
              <p className={styles.note} role="status">
                {tx("Đang tải lớp đang mở…", "Loading open classes…")}
              </p>
            ) : courses.error ? (
              <Retry
                message={tx(
                  "Chưa tải được danh sách lớp.",
                  "Could not load classes.",
                )}
                onRetry={courses.reload}
                label={tx("Tải lại", "Reload")}
              />
            ) : (
              <ul className={styles.rows}>
                {classVisible.map((c) => (
                  <ClassRow
                    key={c.classId}
                    course={c}
                    busy={checkout.busyId === `class:${c.classId}`}
                    error={
                      checkout.error?.id === `class:${c.classId}`
                        ? checkout.error.message
                        : null
                    }
                    index={order++}
                    onChoose={() =>
                      checkout.start(`class:${c.classId}`, {
                        kind: "class",
                        body: { classId: c.classId },
                      })
                    }
                  />
                ))}
              </ul>
            )}
          </Section>
        )}

      {show("court") && courtVisible.length > 0 && (
        <Section
          kind="court"
          emblem="court"
          title={tx("Thuê sân", "Court rental")}
        >
          <div className={styles.courts}>
            {courtVisible.map((s) => (
              <CourtOffer
                key={s.sportId}
                sport={s}
                rates={rates.data ?? []}
                roomTypes={roomTypes.data ?? []}
                index={order++}
              />
            ))}
          </div>
        </Section>
      )}
    </div>
  );
}

function Section({
  kind,
  emblem,
  title,
  children,
}: {
  kind: ServiceKind;
  emblem: Parameters<typeof KindTile>[0]["emblem"];
  title: string;
  children: ReactNode;
}) {
  return (
    <section className={styles.section} aria-label={title}>
      <header className={styles.sectionHead}>
        <KindTile kind={kind} emblem={emblem} size={32} />
        <h2>{title}</h2>
      </header>
      {children}
    </section>
  );
}

function Retry({
  message,
  onRetry,
  label,
}: {
  message: string;
  onRetry: () => void;
  label: string;
}) {
  return (
    <div className={styles.retry} role="alert">
      <span>{message}</span>
      <button type="button" className="btn btn--secondary" onClick={onRetry}>
        {label}
      </button>
    </div>
  );
}

function GymTier({
  plan,
  baseMonthly,
  pending,
  active,
  start,
  busy,
  error,
  index,
  onChoose,
}: {
  plan: MembershipPackageDto;
  baseMonthly: number | null;
  pending: boolean;
  active?: MemberPackageDto;
  /** Ngày bắt đầu của gói này: hôm nay, hoặc ngay sau EndDate Membership đang dùng. */
  start: string;
  busy: boolean;
  error: string | null;
  index: number;
  onChoose: () => void;
}) {
  const { language } = useLanguage();
  const vi = language === "vi";
  const tx = (v: string, e: string) => (vi ? v : e);
  const dayPass = plan.durationDays === 1;
  const months = monthsOf(plan.durationDays);
  const original = !dayPass && baseMonthly ? baseMonthly * months : 0;
  const saving = original > plan.price ? original - plan.price : 0;
  return (
    <article
      className={styles.tier}
      style={{ "--i": Math.min(index, 8) } as CSSProperties}
    >
      <h3 className={styles.planName}>{plan.name}</h3>
      <p className={styles.months}>
        <strong>{dayPass ? 1 : months}</strong>
        <span>
          {dayPass
            ? tx("ngày", "day")
            : tx("tháng", months === 1 ? "month" : "months")}
        </span>
      </p>
      <p className={styles.price}>
        <strong>{formatMoney(plan.price)}</strong>
        {saving > 0 && <s>{formatMoney(original)}</s>}
      </p>
      <p className={styles.meta}>
        {dayPass ? (
          tx("Chỉ dùng trong hôm nay", "Valid today only")
        ) : (
          <>
            {tx("Đến", "Until")} {formatDate(membershipEnd(start, months))}
            {" · "}≈ {formatMoney(Math.round(plan.price / months))}
            {tx("/tháng", "/month")}
          </>
        )}
      </p>
      <p className={styles.tags}>
        {saving > 0 && (
          <span className={styles.save}>
            {tx("Tiết kiệm", "Save")} {formatMoney(saving)}
          </span>
        )}
        {active && (
          <span className={styles.current}>
            {active.isUsable
              ? tx("Đang dùng", "In use")
              : tx("Đã mua", "Purchased")}
            {" · "}
            {tx("đến", "until")} {formatDate(active.endDate)}
          </span>
        )}
      </p>
      {pending ? (
        <button type="button" className={styles.cta} disabled>
          {tx("Đang chờ thanh toán", "Awaiting payment")}
        </button>
      ) : (
        <button
          type="button"
          className={styles.cta}
          disabled={busy}
          onClick={onChoose}
        >
          {busy
            ? tx("Đang chuyển…", "Redirecting…")
            : active
              ? tx("Gia hạn gói", "Renew plan")
              : tx("Chọn gói", "Choose plan")}
        </button>
      )}
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
    </article>
  );
}

function ClassRow({
  course,
  busy,
  error,
  index,
  onChoose,
}: {
  course: CourseDto;
  busy: boolean;
  error: string | null;
  index: number;
  onChoose: () => void;
}) {
  const { language } = useLanguage();
  const vi = language === "vi";
  const tx = (v: string, e: string) => (vi ? v : e);
  const days = WEEKDAY[vi ? "vi" : "en"];
  const slots = course.scheduleRules.map(
    (r) => `${days[r.dayOfWeek] ?? ""} ${r.startTimeLocal.slice(0, 5)}`,
  );
  const sport = sportLabel(course.sportName, vi);
  const low = course.availableSeats <= 3;
  return (
    <li
      className={styles.row}
      style={{ "--i": Math.min(index, 8) } as CSSProperties}
    >
      <KindTile
        kind="class"
        emblem={emblemForSport(course.sportName)}
        size={44}
        delay={index * 160}
      />
      <div className={styles.rowMain}>
        <h3>{course.name}</h3>
        <p className={styles.meta}>
          {sport}
          {" · "}
          {course.numSessions} {tx("buổi", "sessions")}
          {" · "}
          {tx("khai giảng", "starts")} {formatDate(course.startDate)}
        </p>
        {course.coachName && (
          <p className={styles.coachLine}>
            <span>
              {tx("Giảng viên", "Coach")}: <strong>{course.coachName}</strong>
            </span>
            {course.coachId && (
              <Link href={`/coaches/${course.coachId}`}>
                {tx("Xem hồ sơ Coach", "View Coach Profile")}
              </Link>
            )}
          </p>
        )}
        <p className={styles.slots}>
          {slots.map((s) => (
            <span key={s}>{s}</span>
          ))}
          <em data-low={low ? "" : undefined}>
            {course.availableSeats} {tx("chỗ trống", "seats left")}
          </em>
        </p>
      </div>
      <div className={styles.rowBuy}>
        <p className={styles.price}>
          <strong>{formatMoney(course.price)}</strong>
        </p>
        <button
          type="button"
          className={styles.cta}
          disabled={busy}
          onClick={onChoose}
        >
          {busy ? tx("Đang chuyển…", "Redirecting…") : tx("Chọn gói", "Select")}
        </button>
      </div>
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
    </li>
  );
}

function CourtOffer({
  sport,
  rates,
  roomTypes,
  index,
}: {
  sport: SportDto;
  rates: CourtRateDto[];
  roomTypes: RoomTypeDto[];
  index: number;
}) {
  const { language } = useLanguage();
  const vi = language === "vi";
  const tx = (v: string, e: string) => (vi ? v : e);
  const typeIds = new Set(
    roomTypes
      .filter((t) => t.sportIds.includes(sport.sportId))
      .map((t) => t.roomTypeId),
  );
  const prices = rates
    .filter(
      (r) =>
        r.isActive &&
        (r.sportId === sport.sportId ||
          (r.sportId === null && typeIds.has(r.roomTypeId))),
    )
    .map((r) => r.pricePerHour);
  const from = prices.length ? Math.min(...prices) : null;
  const to = prices.length ? Math.max(...prices) : null;
  const name = sportLabel(sport.name, vi);
  return (
    <article
      className={styles.court}
      style={{ "--i": Math.min(index, 8) } as CSSProperties}
    >
      <KindTile
        kind="court"
        emblem={emblemForSport(sport.name, "court")}
        size={44}
        delay={index * 160}
      />
      <h3>{tx(`Sân ${name}`, `${name} court`)}</h3>
      <p className={styles.price}>
        {from === null ? (
          <span className={styles.meta}>
            {tx("Xem giá khi chọn giờ", "Price shown when you pick a slot")}
          </span>
        ) : (
          <>
            <small>{tx("từ", "from")}</small>
            <strong>{formatMoney(from)}</strong>
            <small>/{tx("giờ", "h")}</small>
          </>
        )}
      </p>
      <p className={styles.meta}>
        {to !== null && to !== from
          ? tx(
              `Tới ${formatMoney(to)}/giờ tùy khung giờ`,
              `Up to ${formatMoney(to)}/h by time slot`,
            )
          : tx("Đặt 1–4 giờ mỗi lần", "Book 1–4 hours at a time")}
      </p>
      <Link
        className={styles.cta}
        href={`/member/services?section=courts&view=explore&sport=${sport.sportId}`}
      >
        {tx("Chọn gói", "Select")}
      </Link>
    </article>
  );
}
