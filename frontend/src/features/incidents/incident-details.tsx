"use client";
import { IncidentRefundTable } from "./incident-refund-table";
import { IncidentDayPassSupport } from "./incident-day-pass-support";
import { AsyncSection, Card } from "@/components/ui";
import Link from "next/link";
import { useApi } from "@/lib/useApi";
import { useLanguage } from "@/lib/language";
import { formatDateTime } from "@/lib/format";
import { incidentApi } from "./incident-api";
import styles from "./incident-history.module.css";

export function IncidentDetailsView({ id }: { id: string }) {
  const { t, language } = useLanguage();
  const vi = language === "vi";
  const outcomes: Record<string, string> = {
    INTERRUPTED: vi ? "Buổi bị gián đoạn" : "Interrupted session",
    NOT_HELD: vi ? "Buổi không diễn ra" : "Session not held",
    COMPLETED_AS_PLANNED: vi ? "Đã học đầy đủ" : "Fully delivered",
  };
  const l = t.managerOperations;
  const state = useApi((signal) => incidentApi.get(id, signal), [id]);
  return (
    <AsyncSection state={state}>
      {(incident) => (
        <>
          <IncidentDayPassSupport incident={incident} />
          <Card title={incident.reason}>
            <dl className={styles.details}>
              <div>
                <dt>{l.incidentScope}</dt>
                <dd>
                  {incident.scope === "CENTER"
                    ? t.operations.center
                    : (incident.roomName ?? t.operations.room)}
                </dd>
              </div>
              <div>
                <dt>{t.operations.start}</dt>
                <dd>{formatDateTime(incident.startAtUtc)}</dd>
              </div>
              <div>
                <dt>{t.operations.end}</dt>
                <dd>{formatDateTime(incident.endAtUtc)}</dd>
              </div>
              <div>
                <dt>{l.incidentRecordedAt}</dt>
                <dd>{formatDateTime(incident.createdAtUtc)}</dd>
              </div>
            </dl>
            <p>{incident.resolutionSummary}</p>
            {!!incident.refunds?.length && (
              <IncidentRefundTable
                readOnly
                rows={incident.refunds.map((row) => ({
                  ...row,
                  maximumRefundPoints: row.points,
                  suggestedRefundPoints: row.suggestedPoints,
                  refundedPoints: row.previouslyRefundedPoints,
                }))}
                edits={Object.fromEntries(
                  incident.refunds.map((row) => [
                    row.sourceId,
                    {
                      points: String(row.points),
                      reason: row.adjustmentReason ?? "",
                    },
                  ]),
                )}
              />
            )}
            {!!incident.sessionReports?.length && (
              <section className="stack">
                <h2>{vi ? "Kết quả xử lý buổi học" : "Session outcomes"}</h2>
                {incident.sessionReports.map((row) => (
                  <div key={row.sessionId}>
                    <strong>
                      {row.className} · #{row.sessionNo} ·{" "}
                      {outcomes[row.report.outcome] ?? row.report.outcome}
                    </strong>
                    <p>
                      {vi ? "Xảy ra" : "Occurred"}:{" "}
                      {formatDateTime(row.report.occurredAtUtc)} ·{" "}
                      {vi ? "Ghi nhận" : "Recorded"}:{" "}
                      {formatDateTime(row.report.recordedAtUtc)}
                    </p>
                    <p>{row.report.reason}</p>
                    {row.report.replacementSessionId && (
                      <Link href={`/manager/classes/${row.classId}`}>
                        {vi ? "Xem lịch học lại" : "View replacement schedule"}
                      </Link>
                    )}
                  </div>
                ))}
              </section>
            )}
          </Card>
        </>
      )}
    </AsyncSection>
  );
}
