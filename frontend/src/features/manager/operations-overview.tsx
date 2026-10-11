"use client";
import Link from "next/link";
import { api } from "@/lib/apiClient";
import { useApi } from "@/lib/useApi";
import { useLanguage } from "@/lib/language";
import { todayIso, formatDateTime } from "@/lib/format";
import { pagedItems } from "@/lib/paged";
import { AsyncSection, Card, StatusChip, Table } from "@/components/ui";
import { courtScheduleApi } from "@/features/court-schedule";
import type {
  ManagerCourseDto,
  Paged,
  PaymentAdjustmentDto,
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
        endpoints.map((kind) =>
          api.get<{ requestId: string; memberName: string; status: string }[]>(
            `/api/manager/pt-${kind}-change-requests`,
            { signal, query: { status: "PENDING", page: 1, pageSize: 5 } },
          ),
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
        hint={`${date} · ${m.metricScope}`}
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
        <div className="stack">
          <h3>{m.atRisk}</h3>
          <AsyncSection state={classes}>
            {(data) => (
              <>
                <p>{data.totalCount}</p>
                {pagedItems(data).map((c) => (
                  <p key={c.classId}>
                    <Link href={`/manager/classes/${c.classId}?tab=threshold`}>
                      {c.name}
                    </Link>{" "}
                    · {c.confirmedCount}/{c.breakEvenThreshold ?? "—"} ·{" "}
                    <StatusChip value={c.thresholdStatus} />
                  </p>
                ))}
                <Link href="/manager/classes?status=PUBLISHED&thresholdStatus=AT_RISK">
                  {t.operations.details}
                </Link>
              </>
            )}
          </AsyncSection>
          <h3>{m.refunds}</h3>
          <AsyncSection state={refunds}>
            {(data) => (
              <>
                <p>{data.totalCount}</p>
                <Link href="/manager/payment-adjustments">
                  {t.operations.details}
                </Link>
              </>
            )}
          </AsyncSection>
          <h3>{m.requests}</h3>
          <AsyncSection state={requests}>
            {(rows) => (
              <>
                {rows.map((r) => (
                  <p key={r.requestId}>
                    {r.memberName} · <StatusChip value={r.status} />
                  </p>
                ))}
                {!rows.length && <p>{t.common.noData}</p>}
                <Link href="/manager/pt-change-requests">
                  {t.operations.details}
                </Link>
              </>
            )}
          </AsyncSection>
          <h3>{t.operations.incidents}</h3>
          <p className="small muted">{m.incidentOverviewUnavailable}</p>
          <Link className="btn btn--secondary" href="/manager/incidents">
            {t.operations.incidents}
          </Link>
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
