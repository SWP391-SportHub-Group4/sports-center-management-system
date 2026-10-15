"use client";
import Link from "next/link";
import { api } from "@/lib/apiClient";
import { useApi } from "@/lib/useApi";
import { useLanguage } from "@/lib/language";
import {
  todayIso,
  formatDate,
  formatDateTime,
  formatPoints,
} from "@/lib/format";
import { pagedItems } from "@/lib/paged";
import { AsyncSection, Card, StatusChip, Table } from "@/components/ui";
import { courtScheduleApi } from "@/features/court-schedule";
import styles from "./operations-overview.module.css";
import type {
  ManagerCourseDto,
  Paged,
  PaymentAdjustmentDto,
} from "@/lib/types";
const PREVIEW_SIZE = 5;
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
          pageSize: PREVIEW_SIZE,
        },
      }),
    [],
  );
  const refunds = useApi(
    (signal) =>
      api.get<Paged<PaymentAdjustmentDto>>("/api/refunds", {
        signal,
        query: { status: "REQUESTED", page: 1, pageSize: PREVIEW_SIZE },
      }),
    [],
  );
  const schedule = useApi(
    (signal) => courtScheduleApi.list(date, date, "", false, signal),
    [date],
  );
  return (
    <>
      <Card
        title={m.priorities}
        hint={formatDate(date)}
        actions={
          <button
            className="btn btn--ghost"
            onClick={() => {
              classes.reload();
              refunds.reload();
              schedule.reload();
            }}
          >
            {t.operations.refresh}
          </button>
        }
      >
        <div className={styles.priorities}>
          <section className={styles.queue} aria-labelledby="attention-classes">
            <div className={styles.queueHead}>
              <h3 id="attention-classes">{m.atRisk}</h3>
              {!classes.loading && !classes.error && classes.data && (
                <span className={styles.count}>{classes.data.totalCount}</span>
              )}
              <Link
                className={styles.queueLink}
                href="/manager/classes?status=PUBLISHED&thresholdStatus=AT_RISK"
              >
                {m.reviewClasses}
              </Link>
            </div>
            <AsyncSection state={classes}>
              {(data) => (
                <>
                  {data.totalCount === 0 ? (
                    <p className={styles.empty}>{m.noAtRisk}</p>
                  ) : (
                    <ul
                      className={styles.queueList}
                      tabIndex={0}
                      aria-labelledby="attention-classes"
                    >
                      {pagedItems(data).map((c) => (
                        <li
                          key={c.classId}
                          className={`${styles.queueItem} ${styles.classItem}`}
                        >
                          <Link
                            className={styles.itemTitle}
                            href={`/manager/classes/${c.classId}?tab=threshold`}
                          >
                            {c.name}
                          </Link>
                          <dl className={styles.facts}>
                            {c.roomName && (
                              <div>
                                <dt>{t.operations.room}</dt>
                                <dd>{c.roomName}</dd>
                              </div>
                            )}
                            <div>
                              <dt>{m.confirmedStudents}</dt>
                              <dd>{c.confirmedCount}</dd>
                            </div>
                            <div>
                              <dt>{m.requiredStudents}</dt>
                              <dd>{c.breakEvenThreshold ?? "—"}</dd>
                            </div>
                            <div>
                              <dt>{m.firstSession}</dt>
                              <dd>
                                {c.firstSessionStartUtc
                                  ? formatDateTime(c.firstSessionStartUtc)
                                  : formatDate(c.startDate)}
                              </dd>
                            </div>
                          </dl>
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              )}
            </AsyncSection>
          </section>
          <section className={styles.queue} aria-labelledby="attention-refunds">
            <div className={styles.queueHead}>
              <h3 id="attention-refunds">{m.refunds}</h3>
              {!refunds.loading && !refunds.error && refunds.data && (
                <span className={styles.count}>{refunds.data.totalCount}</span>
              )}
              <Link
                className={styles.queueLink}
                href="/manager/finance?tab=refunds"
              >
                {m.reviewRefunds}
              </Link>
            </div>
            <AsyncSection state={refunds}>
              {(data) => (
                <>
                  {data.totalCount === 0 ? (
                    <p className={styles.empty}>{m.noRefunds}</p>
                  ) : (
                    <ul
                      className={styles.queueList}
                      tabIndex={0}
                      aria-labelledby="attention-refunds"
                    >
                      {pagedItems(data).map((r) => (
                        <li
                          key={r.adjustmentId}
                          className={`${styles.queueItem} ${styles.refundItem}`}
                        >
                          <div className={styles.identity}>
                            <Link
                              className={styles.itemTitle}
                              href="/manager/finance?tab=refunds"
                            >
                              {r.invoiceNumber}
                            </Link>
                            <p className={styles.meta}>
                              {t.finOps.requestedBy.replace(
                                "{name}",
                                r.requestedByName ||
                                  t.managerAudit.nameUnavailable,
                              )}
                            </p>
                            {r.reason && (
                              <p className={styles.meta}>
                                {t.staffWork.reason}: {r.reason}
                              </p>
                            )}
                          </div>
                          <dl className={styles.facts}>
                            <div>
                              <dt>{t.staffWork.systemCap}</dt>
                              <dd>{formatPoints(r.systemCalculatedPoints)}</dd>
                            </div>
                          </dl>
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              )}
            </AsyncSection>
          </section>
        </div>
      </Card>
      <Card
        title={m.todaySchedule}
        hint={formatDate(date)}
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
