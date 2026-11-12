"use client";

import {
  createContext,
  useContext,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import Link from "next/link";
import { isRetiredActivityPackage } from "@/features/membership";
import { rentalApi } from "@/features/rentals";
import { api } from "@/lib/apiClient";
import { formatDate, formatDateTime, formatNumber } from "@/lib/format";
import { useLanguage } from "@/lib/language";
import { useApi, useNow } from "@/lib/useApi";
import type {
  CourseEnrollmentDto,
  CourtRentalDto,
  MemberPackageDto,
  Paged,
  SportDto,
  ThresholdResponseDto,
  UserAdminDto,
} from "@/lib/types";
import { pagedItems } from "@/lib/paged";
import { memberEnrollments } from "./api";
import { RefundCancelDialog } from "@/features/payments";
import { RentalCancelConfirm } from "./rental-cancel";
import { ServiceEmblem } from "./service-emblem";
import { GymPackageDetails } from "./gym-package-details";
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

type Tone = "active" | "soon" | "ended" | "pending" | "scheduled";

interface Owned {
  id: string;
  kind: ServiceKind;
  emblem: EmblemKind;
  tone: Tone;
  rank: number;
  node: (index: number) => ReactNode;
}

/** Quầy: xem dịch vụ của Member đang chọn, không có thao tác (hủy, xem chi tiết) vì thuộc khu Member. */
const ReadOnlyContext = createContext(false);

const SOON_GYM_DAYS = 14;
const SOON_CLASS_SESSIONS = 2;

function exploreHref(kind: ServiceKind, extra = "") {
  return `/member/services?view=explore&type=${kind}${extra}`;
}

export function MyServices({
  filter,
  onFilter,
  gymPackageId = "",
  staffMember,
}: {
  filter: FilterValue;
  onFilter: (next: FilterValue) => void;
  gymPackageId?: string;
  /** Có giá trị = chế độ quầy: đọc dịch vụ của Member này, chỉ xem. */
  staffMember?: UserAdminDto;
}) {
  const { language } = useLanguage();
  const vi = language === "vi";
  const tx = (v: string, e: string) => (vi ? v : e);
  const now = useNow();
  const staffId = staffMember?.userId;

  const packages = useApi(
    async (signal) =>
      (
        await api.get<MemberPackageDto[]>(
          staffId
            ? `/api/members/${staffId}/packages`
            : "/api/members/me/packages",
          { signal },
        )
      ).filter((row) => !isRetiredActivityPackage(row.packageName)),
    [staffId],
  );
  const enrollments = useApi(
    async (signal) =>
      staffId
        ? pagedItems(
            await api.get<Paged<CourseEnrollmentDto>>(
              `/api/members/${staffId}/enrollments`,
              { signal, query: { page: 1, pageSize: 50 } },
            ),
          )
        : memberEnrollments(signal),
    [staffId],
  );
  const thresholds = useApi(
    (signal) =>
      staffId
        ? Promise.resolve([] as ThresholdResponseDto[])
        : api
            .get<ThresholdResponseDto[]>(
              "/api/class-threshold-responses/mine",
              {
                signal,
              },
            )
            .catch(() => [] as ThresholdResponseDto[]),
    [staffId],
  );
  const rentals = useApi(
    (signal) => {
      const from = new Date(Date.now() - 7 * 86_400_000).toISOString();
      const to = new Date(Date.now() + 24 * 86_400_000).toISOString();
      return staffId
        ? api.get<CourtRentalDto[]>(`/api/members/${staffId}/court-rentals`, {
            signal,
            query: { fromUtc: from, toUtc: to },
          })
        : rentalApi.mine(from, to, signal);
    },
    [staffId],
  );
  const sports = useApi(
    (signal) => api.get<SportDto[]>("/api/sports", { anonymous: true, signal }),
    [],
  );

  const sources = [packages, enrollments, rentals];
  const loading = sources.some((s) => s.loading && s.data === null);
  const failed = sources.find((s) => s.error);

  const items: Owned[] = [];

  const allPackages = packages.data ?? [];
  const startsLater = (p: MemberPackageDto) =>
    p.status.toUpperCase() === "ACTIVE" &&
    new Date(`${p.startDate.slice(0, 10)}T00:00:00+07:00`).getTime() > now;
  allPackages.forEach((p) => {
    const status = p.status.toUpperCase();
    if (!["ACTIVE", "PENDING_PAYMENT", "EXPIRED"].includes(status)) return;
    const scheduled = startsLater(p);
    const left = daysUntil(p.endDate, now);
    const ended =
      status === "EXPIRED" ||
      (status === "ACTIVE" && !p.isUsable && !startsLater(p));
    const tone: Tone =
      status === "PENDING_PAYMENT"
        ? "pending"
        : ended
          ? "ended"
          : scheduled
            ? "scheduled"
            : left <= SOON_GYM_DAYS
              ? "soon"
              : "active";
    items.push({
      id: `gym:${p.memberPackageId}`,
      kind: "gym",
      emblem: "gym",
      tone,
      rank:
        tone === "ended"
          ? 9e6
          : scheduled
            ? 1e6 +
              new Date(`${p.startDate.slice(0, 10)}T00:00:00+07:00`).getTime()
            : left,
      node: (i) => (
        <GymCard
          key={p.memberPackageId}
          pkg={p}
          tone={tone}
          left={left}
          onChanged={packages.reload}
          index={i}
        />
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
          onChanged={enrollments.reload}
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
          onChanged={rentals.reload}
          index={i}
        />
      ),
    });
  });

  // Chỉ đếm dịch vụ đang khả dụng; mục đã kết thúc vẫn hiển thị nhưng không tính vào số đếm.
  const available = items.filter((it) => it.tone !== "ended");
  const counts: Partial<Record<FilterValue, number>> = {
    all: available.length,
  };
  SERVICE_KINDS.forEach((k) => {
    counts[k] = available.filter((it) => it.kind === k).length;
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

  if (loading)
    return (
      <div className={styles.page} aria-busy="true">
        <p className={styles.status} role="status">
          {staffId
            ? tx(
                "Đang tải dịch vụ của hội viên…",
                "Loading the member's services…",
              )
            : tx("Đang tải dịch vụ của bạn…", "Loading your services…")}
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

  if (!items.length && staffId)
    return (
      <div className={styles.page}>
        <p className={styles.status} role="status">
          {tx(
            "Hội viên này chưa có dịch vụ nào.",
            "This member has no services yet.",
          )}
        </p>
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
  const selectedGym = gymPackageId
    ? allPackages.find((p) => p.memberPackageId === gymPackageId)
    : undefined;
  const selectedItem = selectedGym
    ? items.find((item) => item.id === `gym:${selectedGym.memberPackageId}`)
    : undefined;
  return (
    <ReadOnlyContext.Provider value={!!staffId}>
      <div className={styles.page}>
        <div className={styles.toolbar}>
          <TypeFilter
            value={filter}
            onChange={onFilter}
            counts={counts}
            vi={vi}
            label={tx("Lọc theo loại dịch vụ", "Filter by service type")}
          />
        </div>

        {selectedGym && selectedItem ? (
          <>
            <div className={styles.list}>{selectedItem.node(0)}</div>
            <GymPackageDetails pkg={selectedGym} />
          </>
        ) : gymPackageId ? (
          <p className={styles.status} role="alert">
            {tx(
              "Không tìm thấy gói Gym này.",
              "This Gym membership could not be found.",
            )}
          </p>
        ) : !visible.length ? (
          <section className={styles.emptyFilter}>
            <p>
              {tx(
                "Bạn chưa có dịch vụ nào thuộc loại này.",
                "You have no services of this type yet.",
              )}
            </p>
            {!staffId && (
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
            )}
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
    </ReadOnlyContext.Provider>
  );
}

const TONE_TEXT: Record<Tone, { vi: string; en: string }> = {
  active: { vi: "Đang hoạt động", en: "Active" },
  soon: { vi: "Sắp hết hạn", en: "Expiring soon" },
  ended: { vi: "Đã hết", en: "Ended" },
  pending: { vi: "Chờ thanh toán", en: "Awaiting payment" },
  scheduled: { vi: "Sắp bắt đầu", en: "Scheduled" },
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
}) {
  const { language } = useLanguage();
  const vi = language === "vi";
  const readOnly = useContext(ReadOnlyContext);
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
      {!readOnly && <div className={styles.actions}>{actions}</div>}
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
  onChanged,
}: {
  onChanged: () => void;
  pkg: MemberPackageDto;
  tone: Tone;
  left: number;
  index: number;
}) {
  const { language } = useLanguage();
  const vi = language === "vi";
  const tx = (v: string, e: string) => (vi ? v : e);
  const [cancelTarget, setCancelTarget] = useState<MemberPackageDto | null>(
    null,
  );
  const scheduled = tone === "scheduled";
  const endDate = pkg.endDate;
  const total = Math.max(
    1,
    Math.round(
      (new Date(endDate).getTime() - new Date(pkg.startDate).getTime()) /
        86_400_000,
    ) + 1,
  );
  const months = monthsOf(
    Math.round(
      (new Date(pkg.endDate).getTime() - new Date(pkg.startDate).getTime()) /
        86_400_000,
    ) + 1,
  );
  const pending = tone === "pending";
  const dayPass = pkg.packageId === 50000;
  const renew = tone === "soon" || tone === "ended";
  return (
    <Shell
      kind="gym"
      emblem="gym"
      tone={tone}
      index={index}
      title={pkg.packageName}
      subtitle={tx(
        dayPass
          ? "Gym day pass · valid until 22:00"
          : `Gym Membership · ${months} tháng`,
        dayPass
          ? "Gym day pass · valid until 22:00"
          : `Gym membership · ${months} ${months === 1 ? "month" : "months"}`,
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
            {scheduled ? (
              <p className={styles.fine}>
                {tx("Bắt đầu", "Starts")} <b>{formatDate(pkg.startDate)}</b>
                {" · "}
                {tx("Hết hạn", "Ends")} <b>{formatDate(endDate)}</b>
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
                  {tx("Hết hạn", "Expires")}{" "}
                  <b>{dayPass && pkg.expiresAtUtc
                    ? formatDateTime(pkg.expiresAtUtc)
                    : formatDate(endDate)}</b>
                </p>
              </>
            )}
          </>
        )
      }
      actions={
        <>
          {pending ? (
            <Link className="btn" href="/member/finance">
              {tx("Xem hóa đơn", "View invoice")}
            </Link>
          ) : (
            <>
              <Link
                className="btn"
                href={`/member/services?view=owned&type=gym&gymPackage=${encodeURIComponent(pkg.memberPackageId)}`}
              >
                {tx("Xem chi tiết", "View details")}
              </Link>
              {renew && (
                <Link className="btn btn--quiet" href={exploreHref("gym")}>
                  {tx("Gia hạn", "Renew")}
                </Link>
              )}
            </>
          )}
          {tone !== "ended" && !pending && pkg.invoiceItemId && (
            <button
              type="button"
              className={styles.cancel}
              onClick={() => setCancelTarget(pkg)}
            >
              {tx("Hủy gói", "Cancel membership")}
            </button>
          )}
          {cancelTarget && (
            <RefundCancelDialog
              target={{
                kind: "gym",
                name: cancelTarget.packageName,
                itemId: cancelTarget.invoiceItemId ?? null,
                endDate: cancelTarget.endDate,
              }}
              onClose={() => setCancelTarget(null)}
              onDone={onChanged}
            />
          )}
        </>
      }
    />
  );
}

function ClassCard({
  row,
  tone,
  started,
  pendingResponseId,
  onChanged,
  index,
}: {
  row: CourseEnrollmentDto;
  tone: Tone;
  started: boolean;
  pendingResponseId?: string;
  onChanged: () => void;
  index: number;
}) {
  const { language } = useLanguage();
  const vi = language === "vi";
  const tx = (v: string, e: string) => (vi ? v : e);
  const [cancelOpen, setCancelOpen] = useState(false);
  const canCancel = tone !== "ended" && !!row.invoiceItemId;
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
                "Lớp chưa đủ sĩ số — chọn giữ chỗ, chuyển lớp hoặc hoàn điểm →",
                "Class is under minimum — keep your place, transfer, or take a points refund →",
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
          {canCancel && started && (
            <Link className={styles.cancel} href="/member/help?topic=PAYMENT">
              {tx("Cần hoàn điểm? Trợ giúp", "Need a refund? Get help")}
            </Link>
          )}
          {canCancel && !started && (
            <button
              type="button"
              className={styles.cancel}
              onClick={() => setCancelOpen(true)}
            >
              {tx("Hủy ghi danh", "Cancel enrollment")}
            </button>
          )}
          {cancelOpen && (
            <RefundCancelDialog
              target={{
                kind: "class",
                name: row.className,
                itemId: row.invoiceItemId,
                firstSessionStartUtc: row.firstSessionStartUtc,
                started,
              }}
              onClose={() => setCancelOpen(false)}
              onDone={onChanged}
            />
          )}
        </>
      }
    />
  );
}

function CourtCard({
  row,
  tone,
  sportName,
  onChanged,
  index,
}: {
  row: CourtRentalDto;
  tone: Tone;
  sportName?: string;
  onChanged: () => void;
  index: number;
}) {
  const { language } = useLanguage();
  const vi = language === "vi";
  const tx = (v: string, e: string) => (vi ? v : e);
  const now = useNow();
  const [cancelOpen, setCancelOpen] = useState(false);
  const canCancel =
    row.status === "CONFIRMED" && new Date(row.startAtUtc).getTime() > now;
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
          {canCancel && (
            <button
              type="button"
              className={styles.cancel}
              onClick={() => setCancelOpen(true)}
            >
              {tx("Hủy thuê sân", "Cancel rental")}
            </button>
          )}
          {cancelOpen && (
            <RentalCancelConfirm
              rental={row}
              onClose={() => setCancelOpen(false)}
              onCancelled={() => {
                setCancelOpen(false);
                onChanged();
              }}
            />
          )}
        </>
      }
    />
  );
}
