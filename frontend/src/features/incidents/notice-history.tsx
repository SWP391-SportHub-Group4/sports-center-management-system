"use client";
import { TableFilters } from "@/components/data/TableFilters";
import Link from "next/link";
import { useState } from "react";
import { api } from "@/lib/apiClient";
import { useApi } from "@/lib/useApi";
import { useLanguage } from "@/lib/language";
import { formatDateTime } from "@/lib/format";
import type { Paged } from "@/lib/types";
import { Card, Field, AsyncSection, Table } from "@/components/ui";
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
type NoticeDetails = NoticeSummary & { message: string | null };
type NoticeRecipientRow = {
  userId: string;
  name: string;
  email: string;
  role?: string | null;
};

function NoticeRecipientList({ id }: { id: string }) {
  const { t, language } = useLanguage();
  const state = useApi(
    async (signal) => {
      const items: NoticeRecipientRow[] = [];
      let page = 1;
      while (true) {
        const result = await api.get<Paged<NoticeRecipientRow>>(
          `/api/manager/notices/${id}/recipients`,
          { signal, query: { page, pageSize: 50 } },
        );
        items.push(...result.items);
        if (!result.items.length || page * result.pageSize >= result.totalCount)
          break;
        page++;
      }
      return items;
    },
    [id],
  );
  const roles: Record<string, string> = {
    SYSTEM_ADMINISTRATOR: t.manualNotices.roles.SYSTEM_ADMINISTRATOR,
    SystemAdministrator: t.manualNotices.roles.SYSTEM_ADMINISTRATOR,
    CENTER_MANAGER: t.manualNotices.roles.CENTER_MANAGER,
    CenterManager: t.manualNotices.roles.CENTER_MANAGER,
    RECEPTIONIST: t.manualNotices.roles.RECEPTIONIST,
    Receptionist: t.manualNotices.roles.RECEPTIONIST,
    COACH: t.manualNotices.roles.COACH,
    Coach: t.manualNotices.roles.COACH,
    MEMBER: t.manualNotices.roles.MEMBER,
    Member: t.manualNotices.roles.MEMBER,
  };
  return (
    <section className={styles.recipientSection}>
      <h3>{language === "vi" ? "Người nhận" : "Recipients"}</h3>
      <AsyncSection state={state}>
        {(items) =>
          items.length ? (
            <div className={styles.recipientList}>
              <Table
                headers={[
                  language === "vi" ? "Người nhận" : "Recipient",
                  language === "vi" ? "Vai trò" : "Role",
                ]}
              >
                {items.map((person) => (
                  <tr key={person.userId}>
                    <td>
                      {person.name || person.email}
                      <br />
                      <small>{person.email}</small>
                    </td>
                    <td>{roles[person.role ?? ""] ?? "—"}</td>
                  </tr>
                ))}
              </Table>
            </div>
          ) : (
            <p>{t.manualNotices.noRecipients}</p>
          )
        }
      </AsyncSection>
    </section>
  );
}

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
      <TableFilters inline>
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
          <button className="btn" disabled={invalidRange}>
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
  const state = useApi(
    (signal) =>
      api.get<NoticeDetails>(`/api/manager/notices/${id}`, { signal }),
    [id],
  );
  return (
    <AsyncSection state={state}>
      {(notice) => (
        <Card>
          <dl className={styles.noticeContent}>
            <div>
              <dt>{t.operations.subject}</dt>
              <dd className={styles.noticeSubject}>{notice.subject}</dd>
            </div>
            <div>
              <dt>{t.operations.message}</dt>
              <dd className={styles.message}>
                {notice.message ?? l.contentUnavailable}
              </dd>
            </div>
          </dl>
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
              <dd className={styles.noticeChannels}>
                {notice.sendInApp && <span>{l.inApp}</span>}
                {notice.sendEmail && <span>{l.email}</span>}
                {!notice.sendInApp && !notice.sendEmail && "—"}
              </dd>
            </div>
          </dl>
          {notice.isLegacy && <p className="muted">{l.legacyHint}</p>}
          <NoticeRecipientList id={id} />
        </Card>
      )}
    </AsyncSection>
  );
}
