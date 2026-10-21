"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { CreditCard, FileText } from "lucide-react";
import { CameraQrScanner } from "@/components/CameraQrScanner";
import { resolveMemberCode } from "@/components/MemberPicker";
import { api } from "@/lib/apiClient";
import { useApi, useNow } from "@/lib/useApi";
import { useLanguage } from "@/lib/language";
import {
  todayIso,
  formatTime,
} from "@/lib/format";
import { AsyncSection, StatusChip } from "@/components/ui";
import { catalogApi } from "@/features/catalog";
import { courseApi } from "@/features/courses";
import { pagedItems } from "@/lib/paged";
import type {
  CourseEnrollmentDto,
  CourtScheduleEntryDto,
  InvoiceSummaryDto,
  Paged,
  UserAdminDto,
} from "@/lib/types";
import { useDeskMember } from "./desk-context";
import { DeskSearchBar } from "./desk-search-bar";
import { RegisterMemberDialog } from "./register-member";
import { SelectedMemberPanel } from "./selected-member";
import styles from "./desk.module.css";

export function RegistrationHint() {
  const { t } = useLanguage();
  const { setMember } = useDeskMember();
  const [open, setOpen] = useState(false);
  return (
    <p className={styles.register}>
      {t.frontDesk.notRegistered}
      <br />
      <button
        type="button"
        className="btn btn--secondary btn--sm"
        onClick={() => setOpen(true)}
      >
        {t.frontDesk.openRegistration}
      </button>
      {open && (
        <RegisterMemberDialog
          onClose={() => setOpen(false)}
          onCreated={(member) => {
            setOpen(false);
            setMember(member);
          }}
        />
      )}
    </p>
  );
}

const RENTAL_LOOKAHEAD_MS = 2 * 60 * 60 * 1000;

/** Quầy hôm nay (H01): thanh tìm ghim đầu trang, dải việc cần xử lý, rồi lưới 3 cột vừa một màn hình (quét/hội viên | lớp hôm nay | Gym + thuê sân), mỗi panel tự cuộn. */
export function ReceptionDashboard() {
  const { language, t } = useLanguage();
  const vi = language === "vi";
  const l = t.frontDesk;
  const { member, setMember } = useDeskMember();
  const today = todayIso();
  const schedule = useApi(
    (signal) =>
      api.get<CourtScheduleEntryDto[]>("/api/manager/court-schedule", {
        signal,
        query: { fromDate: today, toDate: today },
      }),
    [today],
  );
  const rooms = useApi((signal) => catalogApi.rooms(signal), []);
  const invoices = useApi(
    (signal) =>
      api.get<Paged<InvoiceSummaryDto>>("/api/invoices", {
        signal,
        query: { status: "ISSUED", page: 1, pageSize: 1 },
      }),
    [],
  );
  const unfulfilled = useApi(
    (signal) =>
      api.get<Paged<unknown>>("/api/front-desk/payment-reconciliation", {
        signal,
        query: { page: 1, pageSize: 1 },
      }),
    [],
  );
  const now = useNow();
  // Đã chọn Member: chỉ hiện lớp hôm nay mà Member này có ghi danh (Confirmed) để điểm danh đúng người.
  const [showAllClasses, setShowAllClasses] = useState(false);
  const memberId = member?.userId;
  const memberClasses = useApi(
    async (signal) =>
      memberId
        ? pagedItems(
            await api.get<Paged<CourseEnrollmentDto>>(
              `/api/members/${memberId}/enrollments`,
              { signal, query: { page: 1, pageSize: 50 } },
            ),
          )
            .filter((e) => e.status === "CONFIRMED" && !e.endedAt)
            .map((e) => e.classId)
        : null,
    [memberId],
  );
  const roomName = (id: number | null) =>
    rooms.data?.find((room) => room.roomId === id)?.name ?? null;

  const memberClassIds = memberClasses.data
    ? new Set(memberClasses.data)
    : null;
  const filterByMember = !!member && !showAllClasses;
  const sessions = (schedule.data ?? [])
    .filter((r) => r.sourceType === "CLASS_SESSION")
    .filter(
      (r) =>
        !filterByMember ||
        (memberClassIds !== null &&
          r.classId !== null &&
          memberClassIds.has(r.classId)),
    )
    .sort((a, b) => a.startAtUtc.localeCompare(b.startAtUtc));
  const rentals = (schedule.data ?? [])
    .filter(
      (r) =>
        r.sourceType === "COURT_RENTAL" &&
        !/CANCEL/i.test(r.status) &&
        Date.parse(r.endAtUtc) > now &&
        Date.parse(r.startAtUtc) < now + RENTAL_LOOKAHEAD_MS,
    )
    .sort((a, b) => a.startAtUtc.localeCompare(b.startAtUtc));
  const liveCount = sessions.filter(
    (s) => Date.parse(s.startAtUtc) <= now && now < Date.parse(s.endAtUtc),
  ).length;
  const invoiceCount = invoices.data?.totalCount ?? 0;
  const unfulfilledCount = unfulfilled.data?.totalCount ?? 0;

  return (
    <>
      <DeskSearchBar showScan={false} />

      <nav
        className={styles.checks}
        aria-label={vi ? "Kiểm tra quầy" : "Desk checks"}
      >
        <DeskCheck
          href="/receptionist/payment-reconciliation"
          icon={<CreditCard size={20} aria-hidden="true" />}
          count={unfulfilledCount}
          title={vi ? "Đã trả tiền, chưa kích hoạt" : "Paid, not activated"}
          hint={
            vi
              ? "Hội viên đã thanh toán nhưng dịch vụ chưa được cấp"
              : "Member paid but the service was not granted"
          }
        />
        <DeskCheck
          href="/receptionist/invoices"
          icon={<FileText size={20} aria-hidden="true" />}
          count={invoiceCount}
          title={vi ? "Hóa đơn chờ thanh toán" : "Invoices awaiting payment"}
          hint={
            vi
              ? "Hóa đơn đã tạo ở quầy, chưa thu tiền"
              : "Created at the desk, not paid yet"
          }
        />
      </nav>

      <div className={styles.ops}>
        {member ? (
          <div className={styles.areaMain}>
            <SelectedMemberPanel
              key={member.userId}
              member={member}
              onChange={setMember}
            />
          </div>
        ) : (
          <section className={`${styles.panel} ${styles.areaMain}`}>
            <header className={styles.panelHead}>
              <h2>{vi ? "Quét mã check-in" : "Scan check-in code"}</h2>
            </header>
            <div className={styles.panelBody}>
              <DeskScan onFound={setMember} />
              <p className={styles.empty}>
                {vi
                  ? "Hoặc gõ tên, SĐT, email ở ô tìm kiếm phía trên (Ctrl + K)."
                  : "Or type a name, phone or email in the search above (Ctrl + K)."}
              </p>
            </div>
          </section>
        )}

        <div className={styles.side}>
        <DeskPanel
          title={
            filterByMember
              ? vi
                ? "Lớp hôm nay của hội viên"
                : "Member's classes today"
              : l.sessionsToday
          }
          footer={
            member ? (
              <button
                type="button"
                className="btn btn--ghost btn--sm"
                onClick={() => setShowAllClasses((v) => !v)}
              >
                {showAllClasses
                  ? vi
                    ? "Chỉ hiện lớp của hội viên"
                    : "Show only this member's classes"
                  : vi
                    ? "Xem tất cả lớp hôm nay"
                    : "Show all classes today"}
              </button>
            ) : undefined
          }
          badge={
            liveCount > 0 ? (
              <StatusChip
                value="LIVE"
                tone="success"
                label={
                  vi ? `${liveCount} đang diễn ra` : `${liveCount} in progress`
                }
              />
            ) : null
          }
        >
          <AsyncSection state={schedule}>
            {() =>
              !sessions.length ? (
                <p className={styles.empty}>
                  {filterByMember
                    ? vi
                      ? "Hội viên này không có lớp nào hôm nay."
                      : "This member has no classes today."
                    : l.noSessionsToday}
                </p>
              ) : (
                <ol className={styles.rows}>
                  {sessions.map((s) => {
                    const live =
                      Date.parse(s.startAtUtc) <= now &&
                      now < Date.parse(s.endAtUtc);
                    const done = Date.parse(s.endAtUtc) <= now;
                    return (
                      <li
                        key={s.sourceId}
                        className={styles.row}
                        data-live={live || undefined}
                        data-done={done || undefined}
                      >
                        <time className={styles.time}>
                          <strong>{formatTime(s.startAtUtc)}</strong>
                          <span>– {formatTime(s.endAtUtc)}</span>
                        </time>
                        <div className={styles.rowBody}>
                          <strong>{s.title}</strong>
                          <span>
                            {[roomName(s.roomId), s.coachName]
                              .filter(Boolean)
                              .join(" · ")}
                          </span>
                          <ClassSeats classId={s.classId} />
                        </div>
                        <Link
                          className={`btn btn--sm ${live ? "btn--primary" : "btn--secondary"}`}
                          href={`/receptionist/attendance?date=${today}&session=${s.sourceId}`}
                        >
                          {vi ? "Điểm danh" : "Attendance"}
                        </Link>
                      </li>
                    );
                  })}
                </ol>
              )
            }
          </AsyncSection>
        </DeskPanel>

        <DeskPanel
          title={vi ? "Thuê sân trong 2 giờ tới" : "Court rentals, next 2 hours"}
          footer={
            <Link href="/receptionist/court-schedule">
              {vi ? "Xem lịch sân đầy đủ" : "Open the full court schedule"}
            </Link>
          }
        >
          <AsyncSection state={schedule}>
            {() =>
              !rentals.length ? (
                <p className={styles.empty}>
                  {vi
                    ? "Không có lượt thuê sân trong 2 giờ tới."
                    : "No court rentals in the next 2 hours."}
                </p>
              ) : (
                <ul className={styles.rows}>
                  {rentals.map((r) => (
                    <li key={r.sourceId} className={styles.row}>
                      <time className={styles.time}>
                        <strong>{formatTime(r.startAtUtc)}</strong>
                        <span>– {formatTime(r.endAtUtc)}</span>
                      </time>
                      <div className={styles.rowBody}>
                        <strong>{r.memberName ?? r.title}</strong>
                        <span>{roomName(r.roomId) ?? ""}</span>
                      </div>
                      {Date.parse(r.startAtUtc) <= now && (
                        <StatusChip
                          value="LIVE"
                          tone="success"
                          label={vi ? "Đang dùng" : "In use"}
                        />
                      )}
                    </li>
                  ))}
                </ul>
              )
            }
          </AsyncSection>
        </DeskPanel>
        </div>
      </div>

    </>
  );
}

function DeskCheck({
  href,
  onClick,
  icon,
  count,
  title,
  hint,
}: {
  href?: string;
  onClick?: () => void;
  icon: ReactNode;
  count: number;
  title: string;
  hint: string;
}) {
  const body = (
    <>
      <span className={styles.checkIcon}>{icon}</span>
      <span className={styles.checkText}>
        <strong>{title}</strong>
        <span>{hint}</span>
      </span>
      <span className={styles.checkCount}>{count}</span>
    </>
  );
  const props = {
    className: styles.check,
    "data-alert": count > 0 || undefined,
  };
  return href ? (
    <Link href={href} {...props}>
      {body}
    </Link>
  ) : (
    <button type="button" onClick={onClick} {...props}>
      {body}
    </button>
  );
}

function DeskScan({ onFound }: { onFound: (member: UserAdminDto) => void }) {
  const { language } = useLanguage();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className={styles.scan}>
      <CameraQrScanner
        onScan={async (text) => {
          const result = await resolveMemberCode(text, language);
          if (result.member) onFound(result.member);
          else setError(result.error ?? null);
        }}
      />
      {error && (
        <p className={styles.scanError} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

function DeskPanel({
  title,
  badge,
  footer,
  className,
  children,
}: {
  title: string;
  badge?: ReactNode;
  footer?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={`${styles.panel} ${className ?? ""}`}>
      <header className={styles.panelHead}>
        <h2>{title}</h2>
        {badge}
      </header>
      <div className={styles.panelBody}>{children}</div>
      {footer && <footer className={styles.panelFoot}>{footer}</footer>}
    </section>
  );
}

/** Sĩ số đã xác nhận / sức chứa của lớp; lỗi tải thì im lặng, không chặn nút điểm danh. */
function ClassSeats({ classId }: { classId: number | null }) {
  const { language } = useLanguage();
  const state = useApi(
    (signal) =>
      classId
        ? courseApi.detail(classId, signal)
        : Promise.resolve(null),
    [classId],
  );
  if (!state.data) return null;
  const confirmed = state.data.capacity - state.data.availableSeats;
  return (
    <span className={styles.seats}>
      {language === "vi" ? "Đã đặt chỗ" : "Booked"} {confirmed}/{state.data.capacity}
    </span>
  );
}
