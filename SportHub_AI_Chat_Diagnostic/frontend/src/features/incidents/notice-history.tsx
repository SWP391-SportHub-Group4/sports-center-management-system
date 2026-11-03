"use client";
import { TableFilters } from "@/components/data/TableFilters";
import Link from "next/link";
import { useState } from "react";
import { api } from "@/lib/apiClient";
import { useApi } from "@/lib/useApi";
import { useLanguage } from "@/lib/language";
import { formatDateTime } from "@/lib/format";
import type { Paged } from "@/lib/types";
import { Card, Field, AsyncSection, StatusChip, Table } from "@/components/ui";
import { ApiTable } from "@/components/data";
import styles from "./notice-history.module.css";

type NoticeSummary = {
  noticeId: string;
  subject: string;
  createdAtUtc: string;
  senderName: string;
  recipientCount: number;
  sendInApp: boolean;
  sendEmail: boolean;
  isLegacy: boolean;
};
type ChannelStatus = {
  status: string;
  retryCount: number;
  sentAt: string | null;
  lastAttemptAt: string | null;
};
type Recipient = {
  userId: string;
  name: string;
  email: string;
  inApp: ChannelStatus | null;
  emailDelivery: ChannelStatus | null;
};
type NoticeDetails = NoticeSummary & {
  message: string | null;
  delivery: {
    total: number;
    pending: number;
    sending: number;
    sent: number;
    failed: number;
    read: number;
  };
};

export function NoticeHistory({ refreshKey = 0 }: { refreshKey?: number }) {
  const { t } = useLanguage();
  const l = t.manualNotices;
  const [search, setSearch] = useState("");
  const [fromDate, setFrom] = useState("");
  const [toDate, setTo] = useState("");
  const [filters, setFilters] = useState({
    search: "",
    fromDate: "",
    toDate: "",
  });
  const [page, setPage] = useState(1);
  const invalidRange = !!fromDate && !!toDate && fromDate > toDate;
  const state = useApi(
    (signal) =>
      api.get<Paged<NoticeSummary>>("/api/manager/notices", {
        signal,
        query: { ...filters, page, pageSize: 20 },
      }),
    [filters, page, refreshKey],
  );
  return (
    <Card title={l.history}>
      <p>{l.ownOnly}</p>
      <TableFilters>
        <form
          className={`${styles.filters} form-grid`}
          onSubmit={(e) => {
            e.preventDefault();
            if (invalidRange) return;
            setFilters({ search: search.trim(), fromDate, toDate });
            setPage(1);
          }}
        >
          <Field label={l.search}>
            <input
              type="search"
              maxLength={150}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </Field>
          <Field label={l.from}>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFrom(e.target.value)}
            />
          </Field>
          <Field label={l.to}>
            <input
              type="date"
              min={fromDate || undefined}
              value={toDate}
              onChange={(e) => setTo(e.target.value)}
            />
          </Field>
          <button className="btn btn--secondary" disabled={invalidRange}>
            {l.apply}
          </button>
        </form>
      </TableFilters>
      {invalidRange && <p role="alert">{l.invalidRange}</p>}
      <div className={styles.table}>
        <ApiTable
          caption={l.history}
          state={state}
          page={page}
          pageSize={20}
          onPageChange={setPage}
          getRowId={(row) => row.noticeId}
          mobile="scroll"
          empty={{ title: l.empty, hint: l.emptyHint }}
          columns={[
            {
              id: "subject",
              header: l.subject,
              rowHeader: true,
              cell: (row) => (
                <Link
                  className={styles.subject}
                  href={`/manager/notices/${row.noticeId}`}
                >
                  {row.subject}
                </Link>
              ),
            },
            {
              id: "date",
              header: l.recorded,
              cell: (row) => formatDateTime(row.createdAtUtc),
            },
            {
              id: "count",
              header: l.recipientCount,
              cell: (row) => row.recipientCount,
            },
            {
              id: "channels",
              header: l.channels,
              cell: (row) =>
                [row.sendInApp ? l.inApp : "", row.sendEmail ? l.email : ""]
                  .filter(Boolean)
                  .join(" · "),
            },
          ]}
        />
      </div>
    </Card>
  );
}

export function NoticeDetailsView({ id }: { id: string }) {
  const { t } = useLanguage();
  const l = t.manualNotices;
  const [page, setPage] = useState(1);
  const state = useApi(
    (signal) =>
      api.get<NoticeDetails>(`/api/manager/notices/${id}`, { signal }),
    [id],
  );
  const recipients = useApi(
    (signal) =>
      api.get<Paged<Recipient>>(`/api/manager/notices/${id}/recipients`, {
        signal,
        query: { page, pageSize: 20 },
      }),
    [id, page],
  );
  function channel(status: ChannelStatus | null, selected: boolean) {
    if (!status) return <span>{selected ? l.unavailable : l.notSelected}</span>;
    return (
      <div className={styles.channel}>
        <StatusChip value={status.status} />
        {status.sentAt ? (
          <small>
            {l.sentAt.replace("{date}", formatDateTime(status.sentAt))}
          </small>
        ) : (
          status.lastAttemptAt && (
            <small>
              {l.lastAttempt.replace(
                "{date}",
                formatDateTime(status.lastAttemptAt),
              )}
            </small>
          )
        )}
        {status.retryCount > 0 && (
          <small>{l.attempts.replace("{n}", String(status.retryCount))}</small>
        )}
      </div>
    );
  }
  return (
    <AsyncSection state={state}>
      {(notice) => (
        <>
          <Card title={notice.subject}>
            <dl className={styles.facts}>
              <div>
                <dt>{l.sender}</dt>
                <dd>{notice.senderName}</dd>
              </div>
              <div>
                <dt>{l.recorded}</dt>
                <dd>{formatDateTime(notice.createdAtUtc)}</dd>
              </div>
              <div>
                <dt>{l.recipientCount}</dt>
                <dd>{notice.recipientCount}</dd>
              </div>
              <div>
                <dt>{l.channels}</dt>
                <dd>
                  {[
                    notice.sendInApp ? l.inApp : "",
                    notice.sendEmail ? l.email : "",
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </dd>
              </div>
            </dl>
            <p className={styles.message}>
              {notice.message ?? l.contentUnavailable}
            </p>
            {notice.isLegacy && <p className="muted">{l.legacyHint}</p>}
          </Card>
          <Card title={t.operations.delivery}>
            <p>{l.channelCountHint}</p>
            <Table
              headers={[
                t.wireStatus.PENDING,
                t.wireStatus.SENDING,
                t.wireStatus.SENT,
                t.wireStatus.FAILED,
                t.wireStatus.READ,
              ]}
            >
              <tr>
                <td>{notice.delivery.pending}</td>
                <td>{notice.delivery.sending}</td>
                <td>{notice.delivery.sent}</td>
                <td>{notice.delivery.failed}</td>
                <td>{notice.delivery.read}</td>
              </tr>
            </Table>
          </Card>
          <Card title={l.recipients}>
            <div className={styles.table}>
              <ApiTable
                caption={l.recipients}
                state={recipients}
                page={page}
                pageSize={20}
                onPageChange={setPage}
                getRowId={(row) => row.userId}
                mobile="scroll"
                empty={{ title: l.noRecipients }}
                columns={[
                  {
                    id: "name",
                    header: l.name,
                    rowHeader: true,
                    cell: (row) => row.name,
                  },
                  {
                    id: "email",
                    header: l.email,
                    cell: (row) => (
                      <span className={styles.address}>{row.email}</span>
                    ),
                  },
                  {
                    id: "inApp",
                    header: l.inApp,
                    cell: (row) => channel(row.inApp, notice.sendInApp),
                  },
                  {
                    id: "emailStatus",
                    header: l.emailStatus,
                    cell: (row) => channel(row.emailDelivery, notice.sendEmail),
                  },
                ]}
              />
            </div>
          </Card>
        </>
      )}
    </AsyncSection>
  );
}
