"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { CameraQrScanner } from "@/components/CameraQrScanner";
import { resolveMemberCode } from "@/components/MemberPicker";
import { api } from "@/lib/apiClient";
import { useApi, useNow } from "@/lib/useApi";
import { useLanguage } from "@/lib/language";
import { pagedItems } from "@/lib/paged";
import {
  todayIso,
  formatTime,
} from "@/lib/format";
import { AsyncSection, Dialog, StatusChip } from "@/components/ui";
import { UserAvatar } from "@/components/UserAvatar";
import {
  MutationFeedback,
  Pagination,
  useMutation,
} from "@/features/operations";
import { catalogApi } from "@/features/catalog";
import { courseApi } from "@/features/courses";
import type {
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
import { ForgottenGymVisits } from "./forgotten-gym-visits";

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
  const forgotten = useApi(
    (signal) =>
      api.get<Paged<unknown>>("/api/gym-checkins/inside", {
        signal,
        query: { staleOnly: true, page: 1, pageSize: 1 },
      }),
    [],
  );
  const now = useNow();
  const roomName = (id: number | null) =>
    rooms.data?.find((room) => room.roomId === id)?.name ?? null;

  const sessions = (schedule.data ?? [])
    .filter((r) => r.sourceType === "CLASS_SESSION")
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
  const forgottenCount = forgotten.data?.totalCount ?? 0;
  const invoiceCount = invoices.data?.totalCount ?? 0;
  const [forgottenOpen, setForgottenOpen] = useState(false);

  return (
    <>
      <DeskSearchBar showScan={false} />

      <nav
        className={styles.strip}
        aria-label={vi ? "Việc cần xử lý" : "Needs attention"}
      >
        {invoiceCount > 0 && (
          <Link href="/receptionist/invoices" className={styles.chip}>
            {l.openInvoices}
            <span className={styles.badge}>{invoiceCount}</span>
          </Link>
        )}
        {forgottenCount > 0 && (
          <button
            type="button"
            className={styles.chip}
            onClick={() => setForgottenOpen(true)}
          >
            {vi ? "Quên check-out" : "Forgotten check-outs"}
            <span className={styles.badge}>{forgottenCount}</span>
          </button>
        )}
        <Link href="/receptionist/support" className={styles.quiet}>
          {vi ? "Yêu cầu hỗ trợ" : "Support requests"}
        </Link>
        <Link
          href="/receptionist/payment-reconciliation"
          className={styles.quiet}
        >
          {vi ? "Thanh toán chưa hoàn tất" : "Unfulfilled payments"}
        </Link>
        {forgottenCount === 0 && (
          <button
            type="button"
            className={styles.quiet}
            onClick={() => setForgottenOpen(true)}
          >
            {vi ? "Quên check-out" : "Forgotten check-outs"}
          </button>
        )}
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
          title={l.sessionsToday}
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
                <p className={styles.empty}>{l.noSessionsToday}</p>
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

        <DeskPanel title={l.insideNow}>
          <GymInside />
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

      {forgottenOpen && (
        <Dialog
          title={vi ? "Khách quên check-out" : "Forgotten Gym check-outs"}
          size="md"
          onClose={() => {
            setForgottenOpen(false);
            forgotten.reload();
          }}
        >
          <ForgottenGymVisits />
        </Dialog>
      )}
    </>
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
      {language === "vi" ? "Sĩ số" : "Enrolled"} {confirmed}/{state.data.capacity}
    </span>
  );
}

function GymInside() {
  const { language, t } = useLanguage();
  const vi = language === "vi";
  const l = t.frontDesk;
  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState("");
  const mutation = useMutation();
  const state = useApi(
    (signal) =>
      api.get<
        Paged<{
          checkInId: string;
          memberId: string;
          memberName: string;
          checkInTime: string;
        }>
      >("/api/gym-checkins/inside", { signal, query: { page, pageSize: 8 } }),
    [page],
  );
  return (
    <>
      <AsyncSection state={state}>
        {(data) => {
          const all = pagedItems(data);
          const needle = filter.trim().toLowerCase();
          const rows = needle
            ? all.filter((row) => row.memberName.toLowerCase().includes(needle))
            : all;
          return (
            <>
              <p className={styles.bigCount}>
                <strong>{data.totalCount}</strong>
                <span>{vi ? "đang tập" : "inside"}</span>
              </p>
              {all.length > 3 && (
                <input
                  type="search"
                  className={styles.filter}
                  aria-label={vi ? "Lọc người đang tập" : "Filter people inside"}
                  placeholder={
                    vi ? "Lọc theo tên trên trang này" : "Filter by name on this page"
                  }
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                />
              )}
              {!all.length ? (
                <p className={styles.empty}>{l.insideEmpty}</p>
              ) : !rows.length ? (
                <p className={styles.empty}>
                  {vi ? "Không có ai khớp." : "Nobody matches."}
                </p>
              ) : (
                <ul className={styles.rows}>
                  {rows.map((row) => (
                    <li key={row.checkInId} className={styles.row}>
                      <UserAvatar
                        userId={row.memberId}
                        name={row.memberName}
                        size={32}
                      />
                      <div className={styles.rowBody}>
                        <strong>{row.memberName}</strong>
                        <span>
                          {vi ? "Vào lúc " : "In since "}
                          {formatTime(row.checkInTime)}
                        </span>
                      </div>
                      <button
                        type="button"
                        className="btn btn--secondary btn--sm"
                        disabled={mutation.busy}
                        onClick={async () => {
                          if (
                            await mutation.run(() =>
                              api.post(
                                `/api/gym-checkins/${row.checkInId}/checkout`,
                              ),
                            )
                          )
                            state.reload();
                        }}
                      >
                        {vi ? "Check-out" : "Check out"}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <Pagination
                page={page}
                count={data.totalCount}
                onChange={setPage}
              />
            </>
          );
        }}
      </AsyncSection>
      <MutationFeedback mutation={mutation} />
    </>
  );
}
