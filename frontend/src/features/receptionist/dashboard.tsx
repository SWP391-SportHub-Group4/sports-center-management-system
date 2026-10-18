"use client";

import Link from "next/link";
import { useState } from "react";
import { api } from "@/lib/apiClient";
import { useApi, useNow } from "@/lib/useApi";
import { useLanguage } from "@/lib/language";
import { pagedItems } from "@/lib/paged";
import {
  todayIso,
  formatMoney,
  formatTime,
} from "@/lib/format";
import { AsyncSection, Card, StatusChip } from "@/components/ui";
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

/** Quầy hôm nay (H01): thanh tìm ghim đầu trang, hội viên đang chọn ở vùng thao tác, vận hành trực tiếp ở cột bên. */
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
        query: { status: "ISSUED", page: 1, pageSize: 6 },
      }),
    [],
  );
  const now = useNow();
  const roomName = (id: number | null) =>
    rooms.data?.find((room) => room.roomId === id)?.name ?? null;

  return (
    <>
      <DeskSearchBar />

      <div className={styles.desk}>
        <div className={styles.work}>
          {member ? (
            <SelectedMemberPanel
              key={member.userId}
              member={member}
              onChange={setMember}
            />
          ) : (
            <Card title={l.findMember}>
              <p className={styles.hint}>
                {vi
                  ? "Dùng thanh tìm phía trên (Ctrl + K hoặc F2) để chọn hội viên, hoặc quét mã QR của họ."
                  : "Use the search bar above (Ctrl + K or F2) to pick a member, or scan their QR code."}
              </p>
              <RegistrationHint />
            </Card>
          )}
        </div>

        <div className={styles.status}>
          <Card title={l.sessionsToday}>
            <AsyncSection state={schedule}>
              {(rows) => {
                const sessions = rows
                  .filter((r) => r.sourceType === "CLASS_SESSION")
                  .sort((a, b) => a.startAtUtc.localeCompare(b.startAtUtc));
                if (!sessions.length)
                  return <p className={styles.hint}>{l.noSessionsToday}</p>;
                return (
                  <ol className={styles.timeline}>
                    {sessions.map((s) => {
                      const live =
                        Date.parse(s.startAtUtc) <= now &&
                        now < Date.parse(s.endAtUtc);
                      const done = Date.parse(s.endAtUtc) <= now;
                      return (
                        <li
                          key={s.sourceId}
                          className={styles.slot}
                          data-live={live || undefined}
                          data-done={done || undefined}
                        >
                          <time className={styles.slotTime}>
                            {formatTime(s.startAtUtc)}
                            <span>{formatTime(s.endAtUtc)}</span>
                          </time>
                          <div className={styles.slotBody}>
                            <strong>{s.title}</strong>
                            <span>
                              {[roomName(s.roomId), s.coachName]
                                .filter(Boolean)
                                .join(" · ")}
                            </span>
                            <span className={styles.slotMeta}>
                              <ClassSeats classId={s.classId} />
                              {live && (
                                <StatusChip
                                  value="LIVE"
                                  tone="success"
                                  label={vi ? "Đang diễn ra" : "In progress"}
                                />
                              )}
                            </span>
                          </div>
                          <Link
                            className="btn btn--secondary btn--sm"
                            href={`/receptionist/attendance?date=${today}&session=${s.sourceId}`}
                          >
                            {vi ? "Mở danh sách & điểm danh" : "Open roster & attendance"}
                          </Link>
                        </li>
                      );
                    })}
                  </ol>
                );
              }}
            </AsyncSection>
          </Card>

          <Card title={l.insideNow}>
            <GymInside />
          </Card>

          <Card title={vi ? "Thuê sân sắp tới (2 giờ)" : "Court rentals, next 2 hours"}>
            <AsyncSection state={schedule}>
              {(rows) => {
                const upcoming = rows
                  .filter(
                    (r) =>
                      r.sourceType === "COURT_RENTAL" &&
                      !/CANCEL/i.test(r.status) &&
                      Date.parse(r.endAtUtc) > now &&
                      Date.parse(r.startAtUtc) < now + RENTAL_LOOKAHEAD_MS,
                  )
                  .sort((a, b) => a.startAtUtc.localeCompare(b.startAtUtc));
                if (!upcoming.length)
                  return (
                    <p className={styles.hint}>
                      {vi
                        ? "Không có lượt thuê sân trong 2 giờ tới."
                        : "No court rentals in the next 2 hours."}
                    </p>
                  );
                return (
                  <ul className={styles.list}>
                    {upcoming.map((r) => (
                      <li key={r.sourceId}>
                        <div>
                          <strong>
                            {formatTime(r.startAtUtc)} – {formatTime(r.endAtUtc)}
                            {roomName(r.roomId) ? ` · ${roomName(r.roomId)}` : ""}
                          </strong>
                          <span>{r.memberName ?? r.title}</span>
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
                );
              }}
            </AsyncSection>
            <p className={styles.more}>
              <Link href="/receptionist/court-schedule">
                {vi ? "Xem lịch sân đầy đủ" : "Open the full court schedule"}
              </Link>
            </p>
          </Card>

          <Card title={vi ? "Khách quên check-out" : "Forgotten Gym check-outs"}>
            <ForgottenGymVisits />
          </Card>

          <Card title={vi ? "Việc cần theo dõi" : "Desk follow-up"}>
            <ul className={styles.links}>
              <li>
                <Link href="/receptionist/support">
                  {vi ? "Hàng đợi yêu cầu hỗ trợ" : "Support request queue"}
                </Link>
              </li>
              <li>
                <Link href="/receptionist/payment-reconciliation">
                  {vi
                    ? "Thanh toán đã trả nhưng chưa hoàn tất"
                    : "Paid but not fulfilled payments"}
                </Link>
              </li>
            </ul>
          </Card>

          <Card title={l.openInvoices}>
            <AsyncSection state={invoices}>
              {(data) => {
                const rows = pagedItems(data);
                if (!rows.length)
                  return <p className={styles.hint}>{l.noOpenInvoices}</p>;
                return (
                  <ul className={styles.list}>
                    {rows.map((i) => (
                      <li key={i.invoiceId}>
                        <div>
                          <span className="row">
                            <UserAvatar
                              userId={i.memberId}
                              name={i.memberName}
                              size={32}
                            />
                            <strong>{i.memberName}</strong>
                          </span>
                          <span>
                            {i.invoiceNumber} · {formatMoney(i.totalAmount)}
                          </span>
                        </div>
                        <Link
                          className="btn btn--secondary btn--sm"
                          href={`/receptionist/invoices?invoiceId=${i.invoiceId}`}
                        >
                          {t.operations.details}
                        </Link>
                      </li>
                    ))}
                  </ul>
                );
              }}
            </AsyncSection>
          </Card>
        </div>
      </div>
    </>
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
              <p className={styles.count}>
                {l.insideCount.replace("{n}", String(data.totalCount))}
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
                <p className={styles.hint}>{l.insideEmpty}</p>
              ) : !rows.length ? (
                <p className={styles.hint}>
                  {vi ? "Không có ai khớp." : "Nobody matches."}
                </p>
              ) : (
                <ul className={styles.list}>
                  {rows.map((row) => (
                    <li key={row.checkInId}>
                      <div>
                        <span className="row">
                          <UserAvatar
                            userId={row.memberId}
                            name={row.memberName}
                            size={32}
                          />
                          <strong>{row.memberName}</strong>
                        </span>
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
                        {vi ? "Check-out nhanh" : "Quick check-out"}
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
