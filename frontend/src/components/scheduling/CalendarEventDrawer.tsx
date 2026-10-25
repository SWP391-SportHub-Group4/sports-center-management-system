"use client";
import { ConfirmRecordAction } from "@/components/ConfirmRecordAction";

import Link from "next/link";
import { useState } from "react";
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
  receptionist = false,
  onChanged,
  onClose,
}: {
  entry: CourtScheduleEntryDto;
  roomName?: string | null;
  affectedRoomNames?: string[];
  manager?: boolean;
  coach?: boolean;
  receptionist?: boolean;
  onChanged?: () => void;
  onClose: () => void;
}) {
  const { t } = useLanguage();

  const l = t.operations;
  const shared = t.calendar;

  const participants = entry.participants ?? [];
  const [rentalBusy, setRentalBusy] = useState(false);
  const [rentalError, setRentalError] = useState("");

  /** BR-159: chỉ Lễ tân đánh dấu Checked-in hoặc No-show cho lượt thuê sân. */
  async function markRental(action: "check-in" | "no-show") {
    setRentalBusy(true);
    setRentalError("");
    try {
      await api.post(`/api/court-rentals/${entry.sourceId}/${action}`);
      onChanged?.();
      onClose();
    } catch (error) {
      setRentalError((error as Error).message);
    } finally {
      setRentalBusy(false);
    }
  }

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
      {receptionist &&
        entry.sourceType === "COURT_RENTAL" &&
        entry.status === "CONFIRMED" && (
          <section>
            <div className="btn-row">
              <button
                type="button"
                className="btn"
                disabled={rentalBusy}
                onClick={() => markRental("check-in")}
              >
                Check-in
              </button>
              <button
                type="button"
                className="btn btn--secondary"
                disabled={rentalBusy}
                onClick={() => markRental("no-show")}
              >
                No-show
              </button>
            </div>
            <p className="muted">
              Check-in opens 5 minutes before the start. If the rental is not
              marked by its end time, the system records No-show automatically.
            </p>
            {rentalError && <p role="alert">{rentalError}</p>}
          </section>
        )}
      {manager && entry.incidentId && (
        <Link
          className={buttonClass({ variant: "secondary" })}
          href={`/manager/incidents/${entry.incidentId}`}
        >
          {t.incidentHistory.details}
        </Link>
      )}

      {entry.sourceType === "CLASS_SESSION" && (
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
    </Drawer>
  );
}
