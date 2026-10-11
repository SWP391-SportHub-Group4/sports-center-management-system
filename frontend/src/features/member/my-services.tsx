"use client";

import { useState, type CSSProperties, type ReactNode } from "react";
import Link from "next/link";
import { CourseInterests } from "@/features/courses";
import { isRetiredActivityPackage } from "@/features/membership";
import { rentalApi } from "@/features/rentals";
import { api } from "@/lib/apiClient";
import { formatDate, formatDateTime, formatNumber } from "@/lib/format";
import { useLanguage } from "@/lib/language";
import { useApi, useNow } from "@/lib/useApi";
import type {
  CourseEnrollmentDto,
  CourtRentalDto,
  GymCheckInDto,
  MemberPackageDto,
  Paged,
  PtEntitlementDto,
  SportDto,
  ThresholdResponseDto,
} from "@/lib/types";
import { memberEnrollments } from "./api";
import { ServiceEmblem } from "./service-emblem";
import {
  daysUntil,
  emblemForSport,
  monthsOf,
  SERVICE_KINDS,
  sportLabel,
  type EmblemKind,
  type ServiceKind,
} from "./service-kinds";
import {
  KindBadge,
  KindTile,
  TypeFilter,
  type FilterValue,
} from "./service-ui";
import styles from "./my-services.module.css";

type Tone = "active" | "soon" | "ended" | "pending";

interface Owned {
  id: string;
  kind: ServiceKind;
  emblem: EmblemKind;
  tone: Tone;
  rank: number;
  node: (index: number) => ReactNode;
}

const SOON_GYM_DAYS = 14;
const SOON_PT_SESSIONS = 2;
const SOON_CLASS_SESSIONS = 2;

function exploreHref(kind: ServiceKind, extra = "") {
  return `/member/services?view=explore&type=${kind}${extra}`;
}

export function MyServices({
  filter,
  onFilter,
  tab,
  onTab,
}: {
  filter: FilterValue;
  onFilter: (next: FilterValue) => void;
  tab: string;
  onTab: (next: string) => void;
}) {
  const { language } = useLanguage();
  const vi = language === "vi";
  const tx = (v: string, e: string) => (vi ? v : e);
  const now = useNow();

  const packages = useApi(
    async (signal) =>
      (
        await api.get<MemberPackageDto[]>("/api/members/me/packages", {
          signal,
        })
      ).filter((row) => !isRetiredActivityPackage(row.packageName)),
    [],
  );
  const entitlements = useApi(
    (signal) =>
      api.get<PtEntitlementDto[]>("/api/members/me/pt-entitlements", {
        signal,
      }),
    [],
  );
  const enrollments = useApi(memberEnrollments, []);
  const thresholds = useApi(
    (signal) =>
      api
        .get<ThresholdResponseDto[]>("/api/class-threshold-responses/mine", {
          signal,
        })
        .catch(() => [] as ThresholdResponseDto[]),
    [],
  );
  const rentals = useApi(
    (signal) =>
      rentalApi.mine(
        new Date(Date.now() - 7 * 86_400_000).toISOString(),
        new Date(Date.now() + 24 * 86_400_000).toISOString(),
        signal,
      ),
    [],
  );
  const sports = useApi(
    (signal) => api.get<SportDto[]>("/api/sports", { anonymous: true, signal }),
    [],
  );

  const sources = [packages, entitlements, enrollments, rentals];
  const loading = sources.some((s) => s.loading && s.data === null);
  const failed = sources.find((s) => s.error);

  const items: Owned[] = [];

  (packages.data ?? []).forEach((p) => {
    const status = p.status.toUpperCase();
    if (!["ACTIVE", "PENDING_PAYMENT", "EXPIRED"].includes(status)) return;
    const left = daysUntil(p.endDate, now);
    const ended = status === "EXPIRED" || (status === "ACTIVE" && !p.isUsable);
    const tone: Tone =
      status === "PENDING_PAYMENT"
        ? "pending"
        : ended
          ? "ended"
          : left <= SOON_GYM_DAYS
            ? "soon"
            : "active";
    items.push({
      id: `gym:${p.memberPackageId}`,
      kind: "gym",
      emblem: "gym",
      tone,
      rank: tone === "ended" ? 9e6 : left,
      node: (i) => (
        <GymCard
          key={p.memberPackageId}
          pkg={p}
          tone={tone}
          left={left}
          index={i}
        />
      ),
    });
  });

  (entitlements.data ?? []).forEach((e) => {
    const status = e.status.toUpperCase();
    if (status === "CANCELLED") return;
    const ended = ["EXHAUSTED", "EXPIRED"].includes(status);
    const tone: Tone =
      status === "PENDING_PAYMENT"
        ? "pending"
        : ended
          ? "ended"
          : e.remainingQuota <= SOON_PT_SESSIONS ||
              daysUntil(e.validityEndDate, now) <= SOON_GYM_DAYS
            ? "soon"
            : "active";
    items.push({
      id: `pt:${e.entitlementId}`,
      kind: "pt",
      emblem: "pt",
      tone,
      rank: tone === "ended" ? 9e6 : e.remainingQuota,
      node: (i) => (
        <PtCard key={e.entitlementId} row={e} tone={tone} index={i} />
      ),
    });
  });

  (enrollments.data ?? []).forEach((e) => {
    if (e.status !== "CONFIRMED") return;
    const done = e.completedSessions ?? 0;
    const finished =
      ["COMPLETED", "CANCELLED"].includes(e.classStatus) ||
      (!!e.lastSessionEndUtc && new Date(e.lastSessionEndUtc).getTime() <= now);
    const started =
      !!e.firstSessionStartUtc &&
      new Date(e.firstSessionStartUtc).getTime() <= now;
    const left = e.numSessions - done;
    const tone: Tone = finished
      ? "ended"
      : started && left <= SOON_CLASS_SESSIONS
        ? "soon"
        : "active";
    const pending = (thresholds.data ?? []).find(
      (r) =>
        r.classId === e.classId &&
        r.resolutionStatus === "PENDING" &&
        !r.choice &&
        new Date(r.deadlineUtc).getTime() > now,
    );
    items.push({
      id: `class:${e.enrollmentId}`,
      kind: "class",
      emblem: emblemForSport(e.sportName),
      tone,
      rank: tone === "ended" ? 9e6 : left,
      node: (i) => (
        <ClassCard
          key={e.enrollmentId}
          row={e}
          tone={tone}
          started={started}
          pendingResponseId={pending?.responseId}
          index={i}
        />
      ),
    });
  });

  (rentals.data ?? []).forEach((r) => {
    if (r.status === "CANCELLED") return;
    const over = new Date(r.endAtUtc).getTime() <= now;
    const tone: Tone =
      r.status === "PENDING_PAYMENT"
        ? "pending"
        : over || r.status === "COMPLETED"
          ? "ended"
          : "active";
    const sport = sports.data?.find((s) => s.sportId === r.sportId);
    items.push({
      id: `court:${r.courtRentalId}`,
      kind: "court",
      emblem: "court",
      tone,
      rank: tone === "ended" ? 9e6 : new Date(r.startAtUtc).getTime(),
      node: (i) => (
        <CourtCard
          key={r.courtRentalId}
          row={r}
          tone={tone}
          sportName={sport?.name}
          index={i}
        />
      ),
    });
  });

  const counts: Partial<Record<FilterValue, number>> = { all: items.length };
  SERVICE_KINDS.forEach((k) => {
    counts[k] = items.filter((it) => it.kind === k).length;
  });
  const visible = items.filter((it) => filter === "all" || it.kind === filter);
  const live = visible
    .filter((it) => it.tone !== "ended")
    .sort(
      (a, b) =>
        SERVICE_KINDS.indexOf(a.kind) - SERVICE_KINDS.indexOf(b.kind) ||
        a.rank - b.rank,
    );
  const ended = visible
    .filter((it) => it.tone === "ended")
    .sort((a, b) => a.id.localeCompare(b.id));

  if (tab === "interests")
    return (
      <div className={styles.page}>
        <button
          type="button"
          className="btn btn--quiet"
          onClick={() => onTab("")}
        >
          {tx("← Về dịch vụ của tôi", "← Back to my services")}
        </button>
        <CourseInterests />
      </div>
    );

  if (loading)
    return (
      <div className={styles.page} aria-busy="true">
        <p className={styles.status} role="status">
          {tx("Đang tải dịch vụ của bạn…", "Loading your services…")}
        </p>
      </div>
    );

  if (failed?.error && !items.length)
    return (
      <div className={styles.page}>
        <div className={styles.error} role="alert">
          <p>
            {tx(
              "Chưa tải được dịch vụ của bạn. Thử lại để xem gói đang sở hữu.",
              "We could not load your services. Try again to see what you own.",
            )}
          </p>
          <button
            type="button"
            className="btn btn--secondary"
            onClick={() => sources.forEach((s) => s.reload())}
          >
            {tx("Tải lại", "Reload")}
          </button>
        </div>
      </div>
    );

  if (!items.length)
    return (
      <div className={styles.page}>
        <section className={styles.empty} data-surface="inverse">
          <div className={styles.emptyArt} aria-hidden="true">
            <ServiceEmblem kind="basketball" size={72} delay={0} />
            <ServiceEmblem kind="gym" size={96} delay={400} />
            <ServiceEmblem kind="badminton" size={72} delay={800} />
          </div>
          <h2>{tx("Chưa có gói nào ở đây", "Nothing here yet")}</h2>
          <p>
            {tx(
              "Mua gói đầu tiên, nó sẽ xuất hiện tại đây cùng hạn dùng.",
              "Pick your first package and it shows up here with its expiry.",
            )}
          </p>
          <Link
            className={styles.emptyCta}
            href="/member/services?view=explore"
          >
            {tx("Khám phá gói dịch vụ", "Explore packages")}
          </Link>
        </section>
      </div>
    );

  let order = 0;
  return (
    <div className={styles.page}>
      <div className={styles.toolbar}>
        <TypeFilter
          value={filter}
          onChange={onFilter}
          counts={counts}
          vi={vi}
          label={tx("Lọc theo loại dịch vụ", "Filter by service type")}
        />
        <button
          type="button"
          className={styles.interests}
          onClick={() => onTab("interests")}
        >
          {tx("Nguyện vọng khóa sau", "Course interests")}
        </button>
      </div>

      {!visible.length ? (
        <section className={styles.emptyFilter}>
          <p>
            {tx(
              "Bạn chưa có dịch vụ nào thuộc loại này.",
              "You have no services of this type yet.",
            )}
          </p>
          <Link
            className="btn btn--secondary"
            href={
              filter === "all"
                ? "/member/services?view=explore"
                : exploreHref(filter)
            }
          >
            {tx("Khám phá gói dịch vụ", "Explore packages")}
          </Link>
        </section>
      ) : (
        <>
          {live.length > 0 && (
            <div className={styles.list}>
              {live.map((row) => row.node(order++))}
            </div>
          )}
          {ended.length > 0 && (
            <details className={styles.endedBox}>
              <summary>
                {tx("Đã hết hạn", "Ended")}
                <span className={styles.groupCount}>{ended.length}</span>
              </summary>
              <div className={styles.list}>
                {ended.map((row) => row.node(order++))}
              </div>
            </details>
          )}
        </>
      )}
    </div>
  );
}

const TONE_TEXT: Record<Tone, { vi: string; en: string }> = {
  active: { vi: "Đang hoạt động", en: "Active" },
  soon: { vi: "Sắp hết hạn", en: "Expiring soon" },
  ended: { vi: "Đã hết", en: "Ended" },
  pending: { vi: "Chờ thanh toán", en: "Awaiting payment" },
};

function Shell({
  kind,
  emblem,
  tone,
  index,
  title,
  subtitle,
  statusText,
  metric,
  actions,
  panel,
}: {
  kind: ServiceKind;
  emblem: EmblemKind;
  tone: Tone;
  index: number;
  title: string;
  subtitle: string;
  statusText?: string;
  metric: ReactNode;
  actions: ReactNode;
  panel?: ReactNode;
}) {
  const { language } = useLanguage();
  const vi = language === "vi";
  return (
    <article
      className={styles.card}
      data-kind={kind}
      data-tone={tone}
      style={{ "--i": Math.min(index, 8) } as CSSProperties}
    >
      <KindTile kind={kind} emblem={emblem} size={56} delay={index * 140} />
      <div className={styles.main}>
        <div className={styles.head}>
          <KindBadge kind={kind} vi={vi} />
          <span className={styles.pill} data-tone={tone}>
            {statusText ?? TONE_TEXT[tone][vi ? "vi" : "en"]}
          </span>
        </div>
        <h3 className={styles.title}>{title}</h3>
        <p className={styles.subtitle}>{subtitle}</p>
        <div className={styles.metric}>{metric}</div>
      </div>
      <div className={styles.actions}>{actions}</div>
      {panel}
    </article>
  );
}

function Pips({
  done,
  total,
  label,
}: {
  done: number;
  total: number;
  label: string;
}) {
  if (total > 20)
    return (
      <span
        className={styles.bar}
        role="img"
        aria-label={label}
        style={
          {
            "--fill": `${Math.min(100, (done / total) * 100)}%`,
          } as CSSProperties
        }
      />
    );
  return (
    <span className={styles.pips} role="img" aria-label={label}>
      {Array.from({ length: total }, (_, i) => (
        <i key={i} data-on={i < done ? "" : undefined} />
      ))}
    </span>
  );
}

function GymCard({
  pkg,
  tone,
  left,
  index,
}: {
  pkg: MemberPackageDto;
  tone: Tone;
  left: number;
  index: number;
}) {
  const { language } = useLanguage();
  const vi = language === "vi";
  const tx = (v: string, e: string) => (vi ? v : e);
  const [open, setOpen] = useState<"detail" | "history" | null>(null);
  const total = Math.max(
    1,
    Math.round(
      (new Date(pkg.endDate).getTime() - new Date(pkg.startDate).getTime()) /
        86_400_000,
    ) + 1,
  );
  const months = monthsOf(total);
  const pending = tone === "pending";
  const renew = tone === "soon" || tone === "ended";
  return (
    <Shell
      kind="gym"
      emblem="gym"
      tone={tone}
      index={index}
      title={pkg.packageName}
      subtitle={tx(
        `Gym Membership · ${months} tháng`,
        `Gym membership · ${months} ${months === 1 ? "month" : "months"}`,
      )}
      metric={
        pending ? (
          <p className={styles.note}>
            {tx(
              "Hoàn tất thanh toán để bắt đầu tính hạn.",
              "Finish payment to start the validity period.",
            )}
          </p>
        ) : (
          <>
            <p className={styles.big}>
              <strong>{formatNumber(left)}</strong>
              <span>{tx("ngày còn lại", "days left")}</span>
            </p>
            <span
              className={styles.bar}
              role="img"
              aria-label={tx(
                `Còn ${left} trên ${total} ngày`,
                `${left} of ${total} days left`,
              )}
              style={
                {
                  "--fill": `${Math.min(100, (left / total) * 100)}%`,
                } as CSSProperties
              }
            />
            <p className={styles.fine}>
              {tx("Hết hạn", "Expires")} <b>{formatDate(pkg.endDate)}</b>
            </p>
          </>
        )
      }
      actions={
        <>
          {pending ? (
            <Link className="btn" href="/member/finance">
              {tx("Xem hóa đơn", "View invoice")}
            </Link>
          ) : renew ? (
            <Link className="btn" href={exploreHref("gym")}>
              {tx("Gia hạn", "Renew")}
            </Link>
          ) : (
            <button
              type="button"
              className="btn"
              aria-expanded={open === "detail"}
              onClick={() => setOpen(open === "detail" ? null : "detail")}
            >
              {tx("Xem chi tiết", "View details")}
            </button>
          )}
          <button
            type="button"
            className={styles.link}
            aria-expanded={open === "history"}
            onClick={() => setOpen(open === "history" ? null : "history")}
          >
            {tx("Lịch sử sử dụng", "Usage history")}
          </button>
        </>
      }
      panel={
        open && (
          <div className={styles.panel}>
            {open === "detail" ? (
              <dl className={styles.facts}>
                <div>
                  <dt>{tx("Bắt đầu", "Starts")}</dt>
                  <dd>{formatDate(pkg.startDate)}</dd>
                </div>
                <div>
                  <dt>{tx("Hết hạn", "Ends")}</dt>
                  <dd>{formatDate(pkg.endDate)}</dd>
                </div>
                <div>
                  <dt>{tx("Quyền lợi", "Includes")}</dt>
                  <dd>
                    {pkg.sessionLimit === null
                      ? tx("Check-in không giới hạn", "Unlimited check-ins")
                      : tx(
                          `${pkg.remainingSessions ?? 0} lượt còn lại`,
                          `${pkg.remainingSessions ?? 0} visits left`,
                        )}
                  </dd>
                </div>
                <div>
                  <dt>{tx("Mua PT", "PT booking")}</dt>
                  <dd>
                    {pkg.isUsable
                      ? tx("Đủ điều kiện", "Eligible")
                      : tx(
                          "Cần Membership còn hiệu lực",
                          "Needs an active membership",
                        )}
                  </dd>
                </div>
              </dl>
            ) : (
              <GymHistory />
            )}
          </div>
        )
      }
    />
  );
}

function GymHistory() {
  const { language } = useLanguage();
  const vi = language === "vi";
  const state = useApi(
    (signal) =>
      api.get<Paged<GymCheckInDto>>("/api/members/me/gym-checkins", {
        signal,
        query: { page: 1, pageSize: 5 },
      }),
    [],
  );
  if (state.loading && !state.data)
    return <p className={styles.note}>{vi ? "Đang tải…" : "Loading…"}</p>;
  if (state.error)
    return (
      <p className={styles.note} role="alert">
        {vi ? "Chưa tải được lịch sử." : "Could not load history."}
      </p>
    );
  const rows = state.data?.items ?? [];
  if (!rows.length)
    return (
      <p className={styles.note}>
        {vi ? "Chưa có lượt check-in nào." : "No check-ins yet."}
      </p>
    );
  return (
    <ul className={styles.history}>
      {rows.map((r) => (
        <li key={r.checkInId}>
          <span>{formatDateTime(r.checkInTime)}</span>
          <span>
            {r.checkOutTime
              ? formatDateTime(r.checkOutTime)
              : vi
                ? "Đang ở trong"
                : "Inside now"}
          </span>
        </li>
      ))}
    </ul>
  );
}

function PtCard({
  row,
  tone,
  index,
}: {
  row: PtEntitlementDto;
  tone: Tone;
  index: number;
}) {
  const { language } = useLanguage();
  const vi = language === "vi";
  const tx = (v: string, e: string) => (vi ? v : e);
  const [open, setOpen] = useState(false);
  const renew = tone === "soon" || tone === "ended";
  return (
    <Shell
      kind="pt"
      emblem="pt"
      tone={tone}
      index={index}
      title={tx(`PT cùng ${row.coachName}`, `PT with ${row.coachName}`)}
      subtitle={tx(
        `Huấn luyện 1-1 · ${row.frequencyPerWeek} buổi/tuần`,
        `One-to-one · ${row.frequencyPerWeek} sessions/week`,
      )}
      metric={
        <>
          <p className={styles.big}>
            <strong>{row.remainingQuota}</strong>
            <span>
              / {row.totalQuota} {tx("buổi còn lại", "sessions left")}
            </span>
          </p>
          <Pips
            done={row.remainingQuota}
            total={row.totalQuota}
            label={tx(
              `Còn ${row.remainingQuota} trên ${row.totalQuota} buổi`,
              `${row.remainingQuota} of ${row.totalQuota} sessions left`,
            )}
          />
          <p className={styles.fine}>
            {tx("Hết hạn", "Expires")} <b>{formatDate(row.validityEndDate)}</b>
          </p>
        </>
      }
      actions={
        <>
          {renew ? (
            <Link className="btn" href={exploreHref("pt")}>
              {tx("Gia hạn", "Renew")}
            </Link>
          ) : (
            <button
              type="button"
              className="btn"
              aria-expanded={open}
              onClick={() => setOpen(!open)}
            >
              {tx("Xem chi tiết", "View details")}
            </button>
          )}
          <Link className={styles.link} href="/member/training?tab=sessions">
            {tx("Lịch sử sử dụng", "Usage history")}
          </Link>
        </>
      }
      panel={
        open && (
          <div className={styles.panel}>
            <dl className={styles.facts}>
              <div>
                <dt>{tx("Đã dùng", "Used")}</dt>
                <dd>{row.consumedSessions}</dd>
              </div>
              <div>
                <dt>{tx("Đang giữ chỗ", "Held")}</dt>
                <dd>{row.reservedSessions}</dd>
              </div>
              <div>
                <dt>{tx("Hiệu lực", "Valid")}</dt>
                <dd>
                  {formatDate(row.validityStartDate)} –{" "}
                  {formatDate(row.validityEndDate)}
                </dd>
              </div>
              {row.carryOverUntilDate && (
                <div>
                  <dt>{tx("Bảo lưu đến", "Carry-over until")}</dt>
                  <dd>{formatDate(row.carryOverUntilDate)}</dd>
                </div>
              )}
            </dl>
            <Link
              className="btn btn--secondary"
              href="/member/training?tab=book"
            >
              {tx("Đặt buổi tập", "Book a session")}
            </Link>
          </div>
        )
      }
    />
  );
}

function ClassCard({
  row,
  tone,
  started,
  pendingResponseId,
  index,
}: {
  row: CourseEnrollmentDto;
  tone: Tone;
  started: boolean;
  pendingResponseId?: string;
  index: number;
}) {
  const { language } = useLanguage();
  const vi = language === "vi";
  const tx = (v: string, e: string) => (vi ? v : e);
  const done = row.completedSessions ?? 0;
  const renew = tone === "soon" || tone === "ended";
  const sport = sportLabel(row.sportName, vi);
  return (
    <Shell
      kind="class"
      emblem={emblemForSport(row.sportName)}
      tone={tone}
      index={index}
      title={row.className}
      subtitle={tx(`Lớp nhóm · ${sport}`, `Group class · ${sport}`)}
      statusText={
        tone === "active" && !started
          ? tx("Sắp khai giảng", "Starting soon")
          : undefined
      }
      metric={
        <>
          <p className={styles.big}>
            <strong>{done}</strong>
            <span>
              / {row.numSessions} {tx("buổi đã học", "sessions done")}
            </span>
          </p>
          <Pips
            done={done}
            total={row.numSessions}
            label={tx(
              `Đã học ${done} trên ${row.numSessions} buổi`,
              `${done} of ${row.numSessions} sessions done`,
            )}
          />
          <p className={styles.fine}>
            {tone === "ended" ? (
              <>
                {tx("Kết thúc", "Ended")}{" "}
                <b>{formatDate(row.lastSessionEndUtc)}</b>
              </>
            ) : row.nextSessionStartUtc ? (
              <>
                {tx("Buổi tới", "Next")}{" "}
                <b>{formatDateTime(row.nextSessionStartUtc)}</b>
              </>
            ) : (
              <>
                {tx("Khai giảng", "Starts")}{" "}
                <b>{formatDate(row.firstSessionStartUtc)}</b>
              </>
            )}
            {row.coachName ? ` · ${row.coachName}` : ""}
          </p>
          {pendingResponseId && (
            <Link
              className={styles.alert}
              href={`/member/services?view=owned&responseId=${pendingResponseId}`}
            >
              {tx(
                "Lớp chưa đủ sĩ số — chọn chuyển lớp hoặc hoàn điểm →",
                "Class is under minimum — choose transfer or refund →",
              )}
            </Link>
          )}
        </>
      }
      actions={
        <>
          {renew && !!row.sportId ? (
            <Link
              className="btn"
              href={exploreHref("class", `&sport=${row.sportId}`)}
            >
              {tx("Gia hạn", "Renew")}
            </Link>
          ) : (
            <Link
              className="btn"
              href={`/member/schedule?course=${row.classId}`}
            >
              {tx("Xem chi tiết", "View details")}
            </Link>
          )}
          <Link
            className={styles.link}
            href={`/member/schedule?course=${row.classId}`}
          >
            {tx("Lịch sử sử dụng", "Usage history")}
          </Link>
        </>
      }
    />
  );
}

function CourtCard({
  row,
  tone,
  sportName,
  index,
}: {
  row: CourtRentalDto;
  tone: Tone;
  sportName?: string;
  index: number;
}) {
  const { language } = useLanguage();
  const vi = language === "vi";
  const tx = (v: string, e: string) => (vi ? v : e);
  const start = new Date(row.startAtUtc);
  const end = new Date(row.endAtUtc);
  const locale = vi ? "vi-VN" : "en-GB";
  const day = new Intl.DateTimeFormat(locale, {
    timeZone: "Asia/Ho_Chi_Minh",
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
  }).format(start);
  const time = new Intl.DateTimeFormat(locale, {
    timeZone: "Asia/Ho_Chi_Minh",
    hour: "2-digit",
    minute: "2-digit",
  });
  const hours = Math.max(
    1,
    Math.round((end.getTime() - start.getTime()) / 3_600_000),
  );
  const sport = sportLabel(sportName, vi);
  return (
    <Shell
      kind="court"
      emblem="court"
      tone={tone}
      index={index}
      title={
        sport
          ? tx(`Sân ${sport}`, `${sport} court`)
          : tx("Thuê sân", "Court rental")
      }
      subtitle={tx(`Thuê sân · ${hours} giờ`, `Court rental · ${hours} h`)}
      metric={
        <>
          <p className={styles.big}>
            <strong className={styles.when}>{day}</strong>
          </p>
          <p className={styles.slot}>
            {time.format(start)} – {time.format(end)}
          </p>
        </>
      }
      actions={
        <>
          <Link
            className="btn"
            href={
              tone === "ended"
                ? exploreHref("court")
                : `/member/schedule?rental=${row.courtRentalId}`
            }
          >
            {tone === "ended"
              ? tx("Gia hạn", "Book again")
              : tx("Xem chi tiết", "View details")}
          </Link>
          <Link
            className={styles.link}
            href={`/member/schedule?rental=${row.courtRentalId}`}
          >
            {tx("Lịch sử sử dụng", "Usage history")}
          </Link>
        </>
      }
    />
  );
}
