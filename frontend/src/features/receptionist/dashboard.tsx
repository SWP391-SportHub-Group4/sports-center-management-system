"use client";

import Link from "next/link";
import { useState } from "react";
import { api } from "@/lib/apiClient";
import { useApi } from "@/lib/useApi";
import { useLanguage } from "@/lib/language";
import { pagedItems } from "@/lib/paged";
import {
  todayIso,
  formatMoney,
  formatTime,
  formatDateTime,
} from "@/lib/format";
import { AsyncSection, Card } from "@/components/ui";
import { MemberPicker } from "@/components/MemberPicker";
import {
  MutationFeedback,
  Pagination,
  useMutation,
} from "@/features/operations";
import type {
  CourtScheduleEntryDto,
  InvoiceSummaryDto,
  Paged,
} from "@/lib/types";
import { useDeskMember } from "./desk-context";
import { SelectedMemberPanel } from "./selected-member";
import styles from "./desk.module.css";

export function RegistrationHint() {
  const { t } = useLanguage();
  return (
    <p className={styles.register}>
      {t.frontDesk.notRegistered}
      <br />
      <a href="/register" target="_blank" rel="noreferrer">
        {t.frontDesk.openRegistration}
      </a>
    </p>
  );
}

/** Quầy hôm nay (H01): tìm và giữ hội viên đang chọn ở vùng thao tác, tình hình hôm nay ở cột bên. */
export function ReceptionDashboard() {
  const { t } = useLanguage();
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
  const invoices = useApi(
    (signal) =>
      api.get<Paged<InvoiceSummaryDto>>("/api/invoices", {
        signal,
        query: { status: "ISSUED", page: 1, pageSize: 6 },
      }),
    [],
  );

  return (
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
            <MemberPicker
              value={null}
              onChange={setMember}
              label={l.findMember}
              autoFocus
              emptyHint={<RegistrationHint />}
            />
            <p className={styles.hint}>{l.findHint}</p>
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
                <ul className={styles.list}>
                  {sessions.map((s) => (
                    <li key={s.sourceId}>
                      <div>
                        <strong>{s.title}</strong>
                        <span>
                          {formatTime(s.startAtUtc)} – {formatTime(s.endAtUtc)}
                          {s.coachName ? ` · ${s.coachName}` : ""}
                        </span>
                      </div>
                      <Link
                        className="btn btn--secondary btn--sm"
                        href={`/receptionist/attendance?date=${today}&session=${s.sourceId}`}
                      >
                        {l.takeAttendance}
                      </Link>
                    </li>
                  ))}
                </ul>
              );
            }}
          </AsyncSection>
        </Card>

        <Card title={l.insideNow}>
          <GymInside />
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
                        <strong>{i.memberName}</strong>
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
  );
}

function GymInside() {
  const { t } = useLanguage();
  const l = t.frontDesk;
  const [page, setPage] = useState(1);
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
          const rows = pagedItems(data);
          return (
            <>
              <p className={styles.count}>
                {l.insideCount.replace("{n}", String(data.totalCount))}
              </p>
              {!rows.length ? (
                <p className={styles.hint}>{l.insideEmpty}</p>
              ) : (
                <ul className={styles.list}>
                  {rows.map((row) => (
                    <li key={row.checkInId}>
                      <div>
                        <strong>{row.memberName}</strong>
                        <span>{formatDateTime(row.checkInTime)}</span>
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
                        {l.checkOut}
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
