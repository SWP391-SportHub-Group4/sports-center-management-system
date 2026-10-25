"use client";
import { ConfirmRecordAction } from "@/components/ConfirmRecordAction";

import Link from "next/link";
import type { ReactNode } from "react";
import { api } from "@/lib/apiClient";

import { Drawer, buttonClass } from "@/components/primitives";

import { StatusChip } from "@/components/ui";

import { formatDateTime } from "@/lib/format";
import { useLanguage } from "@/lib/language";

import type { CourtScheduleEntryDto } from "@/lib/types";
import styles from "./CalendarEventDrawer.module.css";

export function CalendarEventDrawer({
  entry,
  roomName,
  affectedRoomNames,
  manager = false,
  coach = false,
  onChanged,
  onClose,
  extraDetails,
  showParticipants = true,
}: {
  entry: CourtScheduleEntryDto;
  roomName?: string | null;
  affectedRoomNames?: string[];
  manager?: boolean;
  coach?: boolean;
  onChanged?: () => void;
  onClose: () => void;
  /** Optional role-specific content inside the same Manager drawer. */
  extraDetails?: ReactNode;
  /** Hide read-only participant summary when role-specific attendance is supplied. */
  showParticipants?: boolean;
}) {
  const { t } = useLanguage();

  const l = t.operations;
  const shared = t.calendar;

  const participants = entry.participants ?? [];

  let footer = undefined;

  if (manager && entry.classId) {
    footer = (
      <Link
        className={buttonClass({
          variant: "secondary",
        })}
        href={`/manager/classes/${entry.classId}`}
      >
        {l.details}
      </Link>
    );
  }

  if (coach && entry.sourceType === "CLASS_SESSION" && entry.classId) {
    footer = (
      <Link
        className={buttonClass({
          variant: "secondary",
        })}
        href={`/coach/classes/${entry.classId}`}
      >
        {l.details}
      </Link>
    );
  }

  return (
    <Drawer
      title={entry.title}
      description={`${formatDateTime(entry.startAtUtc)} – ${formatDateTime(
        entry.endAtUtc,
      )}`}
      onClose={onClose}
      size="lg"
      footer={footer}
    >
      <dl
        className={styles.summary}
        style={{
          margin: 0,
        }}
      >
        <div className={styles.summaryRow}>
          <dt>{shared.type}</dt>

          <dd
            style={{
              margin: 0,
            }}
          >
            {shared.types[entry.sourceType]}
          </dd>
        </div>

        <div className={styles.summaryRow}>
          <dt>{entry.incidentScope === "CENTER" ? l.scope : l.room}</dt>

          <dd
            style={{
              margin: 0,
            }}
          >
            {entry.incidentScope === "CENTER"
              ? t.incidentHistory.entireCenter
              : roomName || "—"}
          </dd>
        </div>

        <div className={styles.summaryRow}>
          <dt>{l.coach}</dt>

          <dd
            style={{
              margin: 0,
            }}
          >
            {entry.coachName || "—"}
          </dd>
        </div>

        <div className={styles.summaryRow}>
          <dt>{l.status}</dt>

          <dd
            style={{
              margin: 0,
            }}
          >
            <StatusChip value={entry.status} />
          </dd>
        </div>
      </dl>
      {entry.incidentScope === "CENTER" && !!affectedRoomNames?.length && (
        <section>
          <h3>{t.incidentHistory.affectedRooms}</h3>
          <ul>
            {affectedRoomNames.map((name, index) => (
              <li key={index}>{name}</li>
            ))}
          </ul>
        </section>
      )}
      {manager &&
        entry.sourceType === "COURT_RENTAL" &&
        (entry.status === "CONFIRMED" || entry.status === "IN_USE") &&
        onChanged && (
          <ConfirmRecordAction
            label={t.recordActions.cancelRental}
            title={t.recordActions.cancelRentalTitle}
            description={t.recordActions.cancelRentalDescription}
            recordName={`${entry.memberName || entry.title} / ${roomName || t.operations.room} / ${formatDateTime(entry.startAtUtc)}`}
            requireReason
            onConfirm={(reason) =>
              api.post(`/api/manager/court-rentals/${entry.sourceId}/cancel`, {
                reason,
              })
            }
            onCompleted={() => {
              onChanged();
              onClose();
            }}
          />
        )}
      {manager && entry.incidentId && (
        <Link
          className={buttonClass({ variant: "secondary" })}
          href={`/manager/incidents/${entry.incidentId}`}
        >
          {t.incidentHistory.details}
        </Link>
      )}

      {showParticipants && entry.sourceType === "CLASS_SESSION" && (
        <section className={styles.participants}>
          <h3>{shared.participants}</h3>

          {participants.length ? (
            <table
              className={styles.participantTable}
              aria-label={shared.participants}
            >
              <thead>
                <tr>
                  <th scope="col">{l.member}</th>
                  <th scope="col">{l.attendance}</th>
                </tr>
              </thead>
              <tbody>
                {participants.map((participant) => (
                  <tr key={participant.memberId}>
                    <td>{participant.memberName}</td>
                    <td>
                      <StatusChip value={participant.attendanceStatus} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="muted">{shared.noParticipants}</p>
          )}
        </section>
      )}
      {extraDetails}
    </Drawer>
  );
}
