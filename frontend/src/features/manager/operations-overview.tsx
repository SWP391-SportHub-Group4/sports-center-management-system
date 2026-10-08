"use client";
import Link from "next/link";
import { api } from "@/lib/apiClient";
import { useApi } from "@/lib/useApi";
import { useLanguage } from "@/lib/language";
import {
  todayIso,
  formatDateTime,
  formatDate,
  formatPoints,
} from "@/lib/format";
import styles from "./operations-overview.module.css";
import { pagedItems } from "@/lib/paged";
import { AsyncSection, Card, StatusChip, Table } from "@/components/ui";
import { courtScheduleApi } from "@/features/court-schedule";
import type {
  ManagerCourseDto,
  Paged,
  PaymentAdjustmentDto,
  PtReviewRequestDto,
} from "@/lib/types";
export function OperationsOverview() {
  const { t } = useLanguage();
  const m = t.managerOperations;
  const date = todayIso();
  const classes = useApi(
    (signal) =>
      api.get<Paged<ManagerCourseDto>>("/api/manager/classes", {
        signal,
        query: {
          status: "PUBLISHED",
          thresholdStatus: "AT_RISK",
          page: 1,
          pageSize: 5,
        },
      }),
    [],
  );
  const refunds = useApi(
    (signal) =>
      api.get<Paged<PaymentAdjustmentDto>>("/api/refunds", {
        signal,
        query: { status: "REQUESTED", page: 1, pageSize: 5 },
      }),
    [],
  );
  const requests = useApi(async (signal) => {
    const endpoints = ["coach", "session"];
    return (
      await Promise.all(
        endpoints.map(async (kind) =>
          (
            await api.get<PtReviewRequestDto[]>(
              `/api/manager/pt-${kind}-change-requests`,
              { signal, query: { status: "PENDING", page: 1, pageSize: 100 } },
            )
          ).map((r) => ({ ...r, kind })),
        ),
      )
    ).flat();
  }, []);
  const schedule = useApi(
    (signal) => courtScheduleApi.list(date, date, "", false, signal),
    [date],
  );
  return (
    <>
      <Card
        title={m.priorities}
        hint={`${formatDate(date)} · ${t.operationsUx.pendingHint}`}
        actions={
          <button
            className="btn btn--ghost"
            onClick={() => {
              classes.reload();
              refunds.reload();
              requests.reload();
              schedule.reload();
            }}
          >
            {t.operations.refresh}
          </button>
        }
      >
        <div className={styles.inbox}>
          <section className={styles.group}>
            <div className={styles.heading}>
              <h3>{m.atRisk}</h3>
              {classes.data && (
                <span className={styles.count}>{classes.data.totalCount}</span>
              )}
              <Link href="/manager/classes?status=PUBLISHED&thresholdStatus=AT_RISK">
                {t.operations.details}
              </Link>
            </div>
            <AsyncSection state={classes}>
              {(data) => (
                <>
                  <ul className={styles.preview}>
                    {pagedItems(data).map((c) => (
                      <li key={c.classId}>
                        <Link
                          href={`/manager/classes/${c.classId}?tab=threshold`}
                        >
                          {c.name}
                        </Link>{" "}
                        <span className={styles.meta}>
                          {c.confirmedCount}/{c.breakEvenThreshold ?? "—"}
                        </span>
                        <StatusChip value={c.thresholdStatus} />
                      </li>
                    ))}
                  </ul>
                  {!data.totalCount && (
                    <p className={styles.empty}>{t.operationsUx.emptyQueue}</p>
                  )}
                </>
              )}
            </AsyncSection>
          </section>
          <section className={styles.group}>
            <div className={styles.heading}>
              <h3>{m.refunds}</h3>
              {refunds.data && (
                <span className={styles.count}>{refunds.data.totalCount}</span>
              )}
              <Link href="/manager/payment-adjustments">
                {t.operations.details}
              </Link>
            </div>
            <AsyncSection state={refunds}>
              {(data) => (
                <>
                  <ul className={styles.preview}>
                    {pagedItems(data).map((r) => (
                      <li key={r.adjustmentId}>
                        <span>
                          {r.requestedByName || t.operationsUx.unnamedMember}
                        </span>
                        <span className={styles.meta}>{r.invoiceNumber}</span>
                        <span>
                          {formatPoints(r.systemCalculatedPoints)}{" "}
                          {t.staffWork.points.toLowerCase()}
                        </span>
                      </li>
                    ))}
                  </ul>
                  {!data.totalCount && (
                    <p className={styles.empty}>{t.operationsUx.emptyQueue}</p>
                  )}
                </>
              )}
            </AsyncSection>
          </section>
          <section className={styles.group}>
            <div className={styles.heading}>
              <h3>{m.requests}</h3>
              {requests.data && (
                <span className={styles.count}>
                  {requests.data.length}
                  {requests.data.length >= 100 ? "+" : ""}
                </span>
              )}
              <Link href="/manager/pt-change-requests">
                {t.operations.details}
              </Link>
            </div>
            <AsyncSection state={requests}>
              {(rows) => (
                <>
                  <ul className={styles.preview}>
                    {rows.slice(0, 5).map((r) => (
                      <li key={`${r.kind}-${r.requestId}`}>
                        <span>
                          {r.memberName?.trim() || t.operationsUx.unnamedMember}
                        </span>
                        <span className={styles.meta}>
                          {r.kind === "coach" ? (
                            t.staffWork.coachChanges
                          ) : (
                            <StatusChip value={r.requestType} />
                          )}
                        </span>
                        {r.sessionStartAtUtc && (
                          <span className={styles.meta}>
                            {formatDateTime(r.sessionStartAtUtc)}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                  {!rows.length && (
                    <p className={styles.empty}>{t.operationsUx.emptyQueue}</p>
                  )}
                </>
              )}
            </AsyncSection>
          </section>
          <section className={styles.group}>
            <div className={styles.heading}>
              <h3>{t.operations.incidents}</h3>
              <Link href="/manager/incidents">{t.operations.details}</Link>
            </div>
            <p className={styles.empty}>{t.operationsUx.incidentHint}</p>
          </section>
        </div>
      </Card>
      <Card
        title={m.todaySchedule}
        hint={date}
        actions={
          <Link
            className="btn btn--secondary"
            href={`/manager/schedule?date=${date}&view=day`}
          >
            {m.schedule}
          </Link>
        }
      >
        <AsyncSection state={schedule}>
          {(rows) => (
            <>
              <Table
                headers={[
                  t.operations.name,
                  t.operations.start,
                  t.operations.end,
                  t.operations.status,
                  "",
                ]}
              >
                {rows.map((r) => (
                  <tr key={`${r.sourceType}-${r.sourceId}`}>
                    <td>
                      {r.title} · {t.calendar.types[r.sourceType]}
                    </td>
                    <td>{formatDateTime(r.startAtUtc)}</td>
                    <td>{formatDateTime(r.endAtUtc)}</td>
                    <td>
                      <StatusChip value={r.status} />
                    </td>
                    <td>
                      {r.classId && (
                        <Link
                          href={`/manager/classes/${r.classId}?tab=sessions`}
                        >
                          {t.operations.details}
                        </Link>
                      )}
                    </td>
                  </tr>
                ))}
              </Table>
              {!rows.length && <p>{m.noActivities}</p>}
            </>
          )}
        </AsyncSection>
      </Card>
    </>
  );
}
