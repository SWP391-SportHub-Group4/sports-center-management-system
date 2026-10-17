"use client";
import { Card, AsyncSection, Table, StatusChip } from "@/components/ui";
import { useApi } from "@/lib/useApi";
import { useLanguage } from "@/lib/language";
import { formatDateTime, formatNumber } from "@/lib/format";
import { managerWorkspaceStyles as styles } from "@/features/manager";
import { reportsApi, type OperationsHealth } from "./api";

/** Are the jobs, the message outbox and the payment reconciliation keeping up? Counts come from the database. */
export function OperationsHealthCard() {
  const { t } = useLanguage();
  const l = t.staffWork;
  const state = useApi((signal) => reportsApi.health(signal), []);
  return (
    <Card title={l.healthTitle}>
      <AsyncSection state={state}>
        {(health) => <Body health={health} />}
      </AsyncSection>
    </Card>
  );
}

/** A count that needs a person is a chip, so the signal is not carried by color alone. */
function Count({ value, alert }: { value: number; alert: boolean }) {
  return alert ? (
    <StatusChip value="Unhealthy" label={formatNumber(value)} tone="danger" />
  ) : (
    <>{formatNumber(value)}</>
  );
}

function Body({ health }: { health: OperationsHealth }) {
  const { t } = useLanguage();
  const l = t.staffWork;
  const p = health.payments;
  const o = health.outbox;
  const counts: [string, number, boolean][] = [
    [l.healthPending, o.pending, false],
    [l.healthStuck, o.stuckSending, o.stuckSending > 0],
    [l.healthFailed, o.failed, false],
    [
      l.healthFailedAttention,
      o.failedNeedingAttention,
      o.failedNeedingAttention > 0,
    ],
  ];
  const payments: [string, number][] = [
    [l.healthGatewayWaiting, p.gatewayEventsUnprocessed],
    [l.healthGatewayFailed, p.gatewayEventsFailed],
    [l.healthManualComp, p.manualCompensationRequired],
    [l.healthAwaitingRecon, p.attemptsAwaitingReconciliation],
    [l.healthFlagged, p.invoicesFlaggedForReconciliation],
    [l.healthSeatLag, p.expiredSeatHoldsNotReleased],
  ];
  return (
    <div className="stack">
      <p role="status">
        <StatusChip
          value={health.status}
          label={health.status}
          tone={
            health.status === "Healthy"
              ? "success"
              : health.status === "Degraded"
                ? "warning"
                : "danger"
          }
        />{" "}
        {l[`healthStatus${health.status}`]}
      </p>

      <details open={health.status !== "Healthy"}>
        <summary>{l.healthDetails}</summary>
        <h3>{l.healthOutbox}</h3>
        <dl className={styles.summary}>
          {counts.map(([label, value, alert]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>
                <Count value={value} alert={alert} />
              </dd>
            </div>
          ))}
        </dl>

        <h3>{l.healthPayments}</h3>
        <dl className={styles.summary}>
          {payments.map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>
                <Count value={value} alert={value > 0} />
              </dd>
            </div>
          ))}
        </dl>

        <h3>{l.healthJobs}</h3>
        <p className="small muted">
          {l.healthJobsSince.replace(
            "{time}",
            formatDateTime(health.jobHistorySinceUtc),
          )}
        </p>
        <Table headers={[l.healthJob, l.healthJobRun]}>
          {health.jobs.map((job) => (
            <tr key={job.name}>
              <td>
                {job.name}
                {job.unhealthy && (
                  <>
                    {" "}
                    <StatusChip
                      value="Unhealthy"
                      label={l.healthJobStale}
                      tone="danger"
                    />
                  </>
                )}
              </td>
              <td>
                {job.lastSuccessUtc
                  ? l.healthJobLastOk.replace(
                      "{time}",
                      formatDateTime(job.lastSuccessUtc),
                    )
                  : l.healthJobNever}
                {job.consecutiveFailures > 0 && (
                  <p className="small muted">
                    {l.healthJobFailing
                      .replace("{n}", String(job.consecutiveFailures))
                      .replace("{error}", job.lastError ?? "")}
                  </p>
                )}
              </td>
            </tr>
          ))}
        </Table>
      </details>
    </div>
  );
}
