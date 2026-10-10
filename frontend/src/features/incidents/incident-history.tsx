"use client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { AsyncSection, Card, Table } from "@/components/ui";
import { api } from "@/lib/apiClient";
import { formatDateTime } from "@/lib/format";
import { useLanguage } from "@/lib/language";
import { useApi } from "@/lib/useApi";
import { IncidentForm } from "./incident-form";
import {
  IncidentDeliverySummary,
  type IncidentDetail,
  type IncidentRecord,
} from "./incident-delivery";
import styles from "./incident-history.module.css";

interface IncidentPage {
  items: IncidentRecord[];
  page: number;
  pageSize: number;
  totalCount: number;
}
export function IncidentWorkspace() {
  const params = useSearchParams();
  const { t } = useLanguage();
  const creating =
    params.get("create") === "1" ||
    params.has("roomId") ||
    params.has("incidentId") ||
    params.has("incidentUncertain");
  if (creating)
    return (
      <>
        <div>
          <Link className="btn btn--ghost" href="/manager/incidents">
            {t.managerOperations.backToList}
          </Link>
        </div>
        <IncidentForm />
      </>
    );
  return <IncidentHistory />;
}

function IncidentHistory() {
  const { t } = useLanguage();
  const l = t.incidentHistory;
  const [page, setPage] = useState(1);
  const state = useApi(
    (signal) =>
      api.get<IncidentPage>(`/api/manager/incidents?page=${page}&pageSize=20`, {
        signal,
      }),
    [page],
  );
  const pages = Math.max(1, Math.ceil((state.data?.totalCount ?? 0) / 20));
  return (
    <Card
      title={l.history}
      actions={
        <>
          <button
            type="button"
            className="btn btn--ghost"
            disabled={state.loading}
            onClick={state.reload}
          >
            {t.operations.refresh}
          </button>
          <Link className="btn" href="/manager/incidents?create=1">
            {l.create}
          </Link>
        </>
      }
    >
      <AsyncSection state={state}>
        {(data) => (
          <>
            {data.items.length === 0 ? (
              <p className="state">{l.empty}</p>
            ) : (
              <div className={styles.list}>
                <Table
                  headers={[
                    t.operations.room,
                    l.time,
                    t.operations.reason,
                    t.operations.details,
                  ]}
                >
                  {data.items.map((item) => (
                    <tr key={item.incidentId}>
                      <td>
                        <strong>
                          {item.scope.toUpperCase() === "CENTER"
                            ? t.operations.center
                            : (item.roomName ?? l.unknownRoom)}
                        </strong>
                      </td>
                      <td>
                        <span className={styles.time}>
                          {formatDateTime(item.startAtUtc)}
                          <br />
                          {formatDateTime(item.endAtUtc)}
                        </span>
                      </td>
                      <td>{item.reason}</td>
                      <td>
                        <Link
                          className="btn btn--secondary btn--sm"
                          href={`/manager/incidents/${item.incidentId}`}
                          aria-label={`${t.operations.details}: ${item.reason}`}
                        >
                          {t.operations.details}
                        </Link>
                      </td>
                    </tr>
                  ))}
                </Table>
              </div>
            )}
            {data.totalCount > 0 && (
              <nav className={styles.pager} aria-label={t.dataTable.pagination}>
                <button
                  type="button"
                  className="btn btn--secondary"
                  disabled={state.loading || page <= 1}
                  onClick={() => setPage(page - 1)}
                >
                  {t.wallet.previous}
                </button>
                <span aria-live="polite">
                  {t.common.pageLabel} {page}/{pages}
                </span>
                <button
                  type="button"
                  className="btn btn--secondary"
                  disabled={state.loading || page >= pages}
                  onClick={() => setPage(page + 1)}
                >
                  {t.wallet.next}
                </button>
              </nav>
            )}
          </>
        )}
      </AsyncSection>
    </Card>
  );
}

export function IncidentDetailView({ id }: { id: string }) {
  const { t } = useLanguage();
  const l = t.incidentHistory;
  const state = useApi(
    (signal) =>
      api.get<IncidentDetail>(`/api/manager/incidents/${id}`, { signal }),
    [id],
  );
  return (
    <Card
      title={l.details}
      actions={
        <button
          type="button"
          className="btn btn--ghost"
          disabled={state.loading}
          onClick={state.reload}
        >
          {t.operations.refresh}
        </button>
      }
    >
      <AsyncSection state={state}>
        {(data) => (
          <div className={styles.detail}>
            <dl className={styles.facts}>
              <div>
                <dt>{t.operations.room}</dt>
                <dd>
                  {data.incident.scope.toUpperCase() === "CENTER"
                    ? t.operations.center
                    : (data.incident.roomName ?? l.unknownRoom)}
                </dd>
              </div>
              <div>
                <dt>{l.time}</dt>
                <dd>
                  {formatDateTime(data.incident.startAtUtc)} –{" "}
                  {formatDateTime(data.incident.endAtUtc)}
                </dd>
              </div>
              <div className={styles.reason}>
                <dt>{t.operations.reason}</dt>
                <dd>{data.incident.reason}</dd>
              </div>
            </dl>
            <section className={styles.section}>
              <h3>{l.result}</h3>
              <p>
                {data.cancelledRentals > 0
                  ? l.cancelledRentals.replace(
                      "{count}",
                      String(data.cancelledRentals),
                    )
                  : l.noRentals}
              </p>
              {data.blockedRooms.length > 0 && (
                <p>
                  {l.blockedRooms}: {data.blockedRooms.join(", ")}.{" "}
                  {l.blockedPeriod}
                </p>
              )}
            </section>
            <section className={styles.section}>
              <h3>{l.notifications}</h3>
              <IncidentDeliverySummary delivery={data.delivery} />
            </section>
          </div>
        )}
      </AsyncSection>
    </Card>
  );
}
