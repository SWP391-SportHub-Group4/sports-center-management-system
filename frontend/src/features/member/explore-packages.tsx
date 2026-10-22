"use client";

import { isCourseOpenForRegistration } from "@/features/courses";
import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import Link from "next/link";
import { CoachProfilePreview } from "@/components/CoachProfilePreview";
import {
  isRetiredActivityPackage,
  parseMembershipCatalog,
  membershipPurchaseState,
  useMembershipDay,
} from "@/features/membership";
import { Dialog } from "@/components/ui";
import { CheckoutPanel, type PurchaseIntent } from "@/features/payments";
import { api } from "@/lib/apiClient";
import { addDaysIso, formatDate, formatMoney } from "@/lib/format";
import { useLanguage } from "@/lib/language";
import { hasService } from "@/lib/sports";
import { useApi } from "@/lib/useApi";
import type {
  CourseDto,
  CourseEnrollmentDto,
  CourtRateDto,
  MemberPackageDto,
  MembershipPackageDto,
  Paged,
  RoomTypeDto,
  SportDto,
  UserAdminDto,
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

/** Lễ tân bán thay Member: cùng giao diện Explore nhưng đọc dữ liệu của Member đó và thanh toán ngay tại quầy. */
type StaffSale = { title: string; intent: PurchaseIntent; price: number };

export function ExplorePackages({
  filter,
  onFilter,
  sportId,
  staffMember,
  initialPlanId = null,
  onBookCourt,
}: {
  filter: FilterValue;
  onFilter: (next: FilterValue) => void;
  sportId: number | null;
  /** Có giá trị = chế độ quầy: bán thay Member này. */
  staffMember?: UserAdminDto;
  initialPlanId?: number | null;
  onBookCourt?: (sportId: number) => void;
}) {
  const { language, t } = useLanguage();
  const vi = language === "vi";
  const tx = (v: string, e: string) => (vi ? v : e);
  const [query, setQuery] = useState("");
  const checkout = useStartCheckout();
  const staffMemberId = staffMember?.userId;
  const [staffSale, setStaffSale] = useState<StaffSale | null>(null);
  const staffEnrollments = useApi(
    async (signal) => {
      if (!staffMemberId) return [];
      const rows: CourseEnrollmentDto[] = [];
      for (let page = 1; ; page++) {
        const result = await api.get<Paged<CourseEnrollmentDto>>(
          `/api/members/${staffMemberId}/enrollments`,
          { signal, query: { page, pageSize: 50 } },
        );
        rows.push(...result.items);
        if (!result.items.length || rows.length >= result.totalCount)
          return rows;
      }
    },
    [staffMemberId],
  );
  const enrolledClassIds = new Set(
    (staffEnrollments.data ?? [])
      .filter((row) => row.status === "CONFIRMED")
      .map((row) => row.classId),
  );

  const owned = useApi(
    async (signal) =>
      (
        await api.get<MemberPackageDto[]>(
          staffMemberId
            ? `/api/members/${staffMemberId}/packages`
            : "/api/members/me/packages",
          { signal },
        )
      ).filter((row) => !isRetiredActivityPackage(row.packageName)),
    [staffMemberId],
  );
  const today = useMembershipDay(owned.reload);
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
      ).items.filter((c) => isCourseOpenForRegistration(c, Date.now())),
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
  // Từ hồ sơ hội viên bấm "gia hạn" -> mở sẵn hộp thanh toán của gói đó (một lần).
  const [planOpened, setPlanOpened] = useState(false);
  useEffect(() => {
    if (!staffMember || !initialPlanId || planOpened || !catalog.data) return;
    const plan = catalog.data.find(
      (p) => p.packageId === initialPlanId && p.isActive,
    );
    if (!plan) return;
    /* eslint-disable react-hooks/set-state-in-effect */
    setPlanOpened(true);
    setStaffSale({
      title: plan.name,
      price: plan.price,
      intent: {
        kind: "membership",
        body: {
          packageId: plan.packageId,
          targetMemberId: staffMember.userId,
          allowStacking: false,
        },
      },
    });
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [staffMember, initialPlanId, planOpened, catalog.data]);
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
    (c) => !sportId || c.sportId === sportId,
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
            ) : owned.error ? (
              <Retry
                message={tx(
                  "Chưa tải được các gói đã mua.",
                  "Could not load your purchased plans.",
                )}
                onRetry={owned.reload}
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
                    ownership={membershipPurchaseState(
                      owned.data ?? [],
                      p.packageId,
                      today,
                    )}
                    ownershipLoading={owned.loading}
                    today={today}
                    start={membershipStart}
                    busy={checkout.busyId === `gym:${p.packageId}`}
                    error={
                      checkout.error?.id === `gym:${p.packageId}`
                        ? checkout.error.message
                        : null
                    }
                    index={order++}
                    onChoose={() =>
                      staffMember
                        ? setStaffSale({
                            title: p.name,
                            price: p.price,
                            intent: {
                              kind: "membership",
                              body: {
                                packageId: p.packageId,
                                targetMemberId: staffMember.userId,
                                allowStacking: false,
                              },
                            },
                          })
                        : checkout.start(`gym:${p.packageId}`, {
                            kind: "membership",
                            body: {
                              packageId: p.packageId,
                              allowStacking: false,
                            },
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
                    unavailableReason={
                      staffMember
                        ? enrolledClassIds.has(c.classId)
                          ? tx("Đã đăng ký", "Already enrolled")
                          : staffEnrollments.error
                            ? tx("Không thể kiểm tra ghi danh", "Cannot check enrollment")
                            : !staffEnrollments.data
                              ? tx("Đang kiểm tra ghi danh", "Checking enrollment")
                              : null
                        : null
                    }
                    busy={checkout.busyId === `class:${c.classId}`}
                    error={
                      checkout.error?.id === `class:${c.classId}`
                        ? checkout.error.message
                        : null
                    }
                    index={order++}
                    onChoose={() =>
                      staffMember &&
                      (enrolledClassIds.has(c.classId) ||
                        !staffEnrollments.data)
                        ? undefined
                        : staffMember
                          ? setStaffSale({
                              title: c.name,
                              price: c.price,
                              intent: {
                                kind: "class",
                                body: {
                                  classId: c.classId,
                                  targetMemberId: staffMember.userId,
                                },
                              },
                            })
                          : checkout.start(`class:${c.classId}`, {
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
                onBook={onBookCourt}
              />
            ))}
          </div>
        </Section>
      )}
      {staffMember && staffSale && (
        <Dialog
          title={`${staffSale.title} · ${staffMember.fullName || staffMember.email}`}
          size="lg"
          className={styles.counterDialog}
          onClose={() => setStaffSale(null)}
        >
          <CheckoutPanel
            key={staffSale.title}
            memberId={staffMember.userId}
            review={{
              title:
                staffSale.intent.kind === "membership"
                  ? t.operations.purchaseReview
                  : tx(
                      "Kiểm tra trước khi thanh toán",
                      "Review before payment",
                    ),
              submitLabel: t.operations.createInvoice,
              items: [
                {
                  label: t.operations.member,
                  value: staffMember.fullName || staffMember.email,
                },
                { label: t.operations.email, value: staffMember.email },
                { label: t.operations.name, value: staffSale.title },
                {
                  label: t.operations.price,
                  value: formatMoney(staffSale.price),
                },
              ],
            }}
            intent={staffSale.intent}
            onChange={() => {
              owned.reload();
              courses.reload();
              staffEnrollments.reload();
            }}
          />
        </Dialog>
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
  ownership,
  ownershipLoading,
  today,
  start,
  busy,
  error,
  index,
  onChoose,
}: {
  plan: MembershipPackageDto;
  baseMonthly: number | null;
  ownership: ReturnType<typeof membershipPurchaseState>;
  ownershipLoading: boolean;
  today: string;
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
  const { active, pending, previouslyPurchased } = ownership;
  const dayPassOwned =
    dayPass && !!active && active.startDate.slice(0, 10) <= today;
  const months = monthsOf(plan.durationDays);
  const original =
    plan.originalPrice ?? (!dayPass && baseMonthly ? baseMonthly * months : 0);
  const saving = original > plan.price ? original - plan.price : 0;
  return (
    <article
      className={styles.tier}
      style={{ "--i": Math.min(index, 8) } as CSSProperties}
    >
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
        {saving > 0 && (
          <s
            aria-label={`${tx("Giá gốc", "Original price")}: ${formatMoney(original)}`}
          >
            {formatMoney(original)}
          </s>
        )}
      </p>
      <p className={styles.meta}>
        {dayPass ? (
          tx("Có hiệu lực 24 giờ", "Valid for 24 hours")
        ) : (
          <>
            {tx("Đến", "Until")} {formatDate(membershipEnd(start, months))}
            {" · "}≈ {formatMoney(Math.round(plan.price / months))}
            {tx("/tháng", "/month")}
          </>
        )}
      </p>
      <button
        type="button"
        className={styles.cta}
        disabled={busy || ownershipLoading || dayPassOwned}
        onClick={onChoose}
      >
        {ownershipLoading
          ? tx("Đang tải…", "Loading…")
          : dayPassOwned
            ? tx("Đã mua", "Purchased")
            : busy
              ? tx("Đang chuyển…", "Redirecting…")
              : pending
                ? tx("Tiếp tục thanh toán", "Continue payment")
                : previouslyPurchased
                  ? tx("Gia hạn gói", "Renew plan")
                  : tx("Chọn gói", "Choose plan")}
      </button>
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
  unavailableReason,
  busy,
  error,
  index,
  onChoose,
}: {
  course: CourseDto;
  unavailableReason: string | null;
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
    (r) =>
      `${days[r.dayOfWeek] ?? ""} ${r.startTimeLocal.slice(0, 5)}${
        r.endTimeLocal ? `–${r.endTimeLocal.slice(0, 5)}` : ""
      }`,
  );
  const sport = sportLabel(course.sportName, vi);
  const low = course.availableSeats <= 3;
  const progressPct = Math.min(
    100,
    Math.round(
      ((course.sessionsPassed ?? 0) / (course.numSessions || 1)) * 100,
    ),
  );
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
        {course.sessionsPassed ? (
          <div className={styles.progress} data-testid="course-progress">
            <div className={styles.progressHead}>
              <span>
                {tx("Đã học", "Held")}{" "}
                <strong>
                  {course.sessionsPassed}/{course.numSessions}
                </strong>{" "}
                {tx("buổi", "sessions")}
              </span>
              <strong>{progressPct}%</strong>
            </div>
            <div
              className={styles.progressTrack}
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={progressPct}
              aria-label={tx("Tiến độ khóa học", "Course progress")}
            >
              <div
                className={styles.progressFill}
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </div>
        ) : null}
        {course.coachName && (
          <p className={styles.coachLine}>
            <span>
              {tx("Giảng viên", "Coach")}:{" "}
              {course.coachId ? (
                <CoachProfilePreview
                  coachId={course.coachId}
                  name={course.coachName}
                  sport={course.sportName}
                />
              ) : (
                <strong>{course.coachName}</strong>
              )}
            </span>
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
          disabled={busy || !!unavailableReason}
          onClick={onChoose}
        >
          {unavailableReason ||
            (busy
              ? tx("Đang chuyển…", "Redirecting…")
              : tx("Chọn gói", "Select"))}
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
  onBook,
}: {
  sport: SportDto;
  rates: CourtRateDto[];
  roomTypes: RoomTypeDto[];
  index: number;
  onBook?: (sportId: number) => void;
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
      {onBook ? (
        <button
          type="button"
          className={styles.cta}
          onClick={() => onBook(sport.sportId)}
        >
          {tx("Chọn gói", "Select")}
        </button>
      ) : (
        <Link
          className={styles.cta}
          href={`/member/services?section=courts&view=explore&sport=${sport.sportId}`}
        >
          {tx("Chọn gói", "Select")}
        </Link>
      )}
    </article>
  );
}
