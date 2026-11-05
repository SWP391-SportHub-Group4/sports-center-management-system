"use client";
import { IncidentRefundTable } from "./incident-refund-table";
import { IncidentDayPassSupport } from "./incident-day-pass-support";
import { AsyncSection, Card } from "@/components/ui";
import Link from "next/link";
import { useApi } from "@/lib/useApi";
import { useLanguage } from "@/lib/language";
import { formatDateTime, formatDate, formatTime } from "@/lib/format";
import {
  ArrowRight,
  CalendarDays,
  Clock3,
  MapPin,
  UserRound,
} from "lucide-react";
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
          <Card title={vi ? "Chi tiết sự cố" : "Incident details"}>
            <div className={styles.incidentReason}>
              <span>{vi ? "Lý do" : "Reason"}</span>
              <p>{incident.reason}</p>
            </div>
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
                <dt>{vi ? "Bắt đầu sự cố" : "Incident start"}</dt>
                <dd>{formatDateTime(incident.startAtUtc)}</dd>
              </div>
              <div>
                <dt>{vi ? "Kết thúc sự cố" : "Incident end"}</dt>
                <dd>{formatDateTime(incident.endAtUtc)}</dd>
              </div>
              {incident.recordedByName && (
                <div>
                  <dt>{vi ? "Người ghi nhận" : "Recorded by"}</dt>
                  <dd>{incident.recordedByName}</dd>
                </div>
              )}
              <div>
                <dt>{l.incidentRecordedAt}</dt>
                <dd>{formatDateTime(incident.createdAtUtc)}</dd>
              </div>
            </dl>
            {!!incident.activities?.length && (
              <section className={styles.activityHistory}>
                <h3>
                  {vi
                    ? "Lớp học và lịch bị ảnh hưởng"
                    : "Affected classes & schedules"}
                </h3>
                {incident.activities.map((activity) => (
                  <article key={activity.stepId} className={styles.activity}>
                    <header className={styles.activityHeading}>
                      <strong>
                        {activity.title}
                        {activity.sessionNo != null
                          ? ` · Session ${activity.sessionNo}`
                          : ""}
                      </strong>
                      {activity.action !== "CANCEL_WITH_MAKEUP" && (
                        <span>
                          {activity.action === "REVIEWED_COMPLETED"
                            ? outcomes.COMPLETED_AS_PLANNED
                            : t.incidentPlans.actions[activity.action]}
                        </span>
                      )}
                    </header>
                    <dl className={styles.activitySchedules}>
                      {[
                        {
                          label: t.classWorkspace.originalSchedule,
                          updated: false,
                          schedule: activity.originalSchedule,
                        },
                        ...(activity.replacementSchedule
                          ? [
                              {
                                label: t.classWorkspace.updatedSchedule,
                                updated: true,
                                schedule: activity.replacementSchedule,
                              },
                            ]
                          : []),
                      ].map(({ label, schedule, updated }) => (
                        <div
                          key={label}
                          className={styles.schedulePanel}
                          data-updated={updated || undefined}
                        >
                          <dt>
                            {label}
                            {updated && (
                              <span
                                className={styles.scheduleArrow}
                                aria-hidden="true"
                              >
                                <ArrowRight size={28} strokeWidth={2.25} />
                              </span>
                            )}
                          </dt>
                          <dd>
                            <p className={styles.scheduleTime}>
                              <Clock3 size={20} aria-hidden="true" />
                              <strong>
                                {formatTime(schedule.startAtUtc)} –{" "}
                                {formatTime(schedule.endAtUtc)}
                              </strong>
                            </p>
                            <p className={styles.scheduleDate}>
                              <CalendarDays size={18} aria-hidden="true" />
                              <span>
                                {formatDate(schedule.startAtUtc)}
                                {formatDate(schedule.startAtUtc) !==
                                formatDate(schedule.endAtUtc)
                                  ? ` – ${formatDate(schedule.endAtUtc)}`
                                  : ""}
                              </span>
                            </p>
                            {schedule.roomName && (
                              <p className={styles.scheduleResource}>
                                <MapPin size={18} aria-hidden="true" />
                                <span>{t.operations.room}</span>
                                <span>{schedule.roomName}</span>
                              </p>
                            )}
                            {schedule.coachName && (
                              <p className={styles.scheduleResource}>
                                <UserRound size={18} aria-hidden="true" />
                                <span>{t.operations.coach}</span>
                                <span>{schedule.coachName}</span>
                              </p>
                            )}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  </article>
                ))}
              </section>
            )}
            <IncidentDayPassSupport incident={incident} />
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
            {!!incident.sessionReports?.filter(
              (row) =>
                !incident.activities?.some(
                  (activity) => activity.sourceId === row.sessionId,
                ),
            ).length && (
              <section className={styles.activityHistory}>
                <h3>{vi ? "Kết quả xử lý buổi học" : "Session outcomes"}</h3>
                {incident.sessionReports
                  .filter(
                    (row) =>
                      !incident.activities?.some(
                        (activity) => activity.sourceId === row.sessionId,
                      ),
                  )
                  .map((row) => (
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
                          {vi
                            ? "Xem lịch học lại"
                            : "View replacement schedule"}
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
