"use client";

import Link from "next/link";
import {
  Drawer,
  buttonClass,
} from "@/components/primitives";
import {
  StatusChip,
  Table,
} from "@/components/ui";
import { formatDateTime } from "@/lib/format";
import { useLanguage } from "@/lib/language";
import type { CourtScheduleEntryDto } from "@/lib/types";

export function CalendarEventDrawer({
  entry,
  roomName,
  manager = false,
  onClose,
}: {
  entry: CourtScheduleEntryDto;
  roomName?: string | null;
  manager?: boolean;
  onClose: () => void;
}) {
  const { t } = useLanguage();

  const l = t.operations;
  const shared = t.calendar;

  const participants = entry.participants ?? [];

  return (
    <Drawer
      title={entry.title}
      description={`${formatDateTime(entry.startAtUtc)} – ${formatDateTime(
        entry.endAtUtc,
      )}`}
      onClose={onClose}
      size="md"
      footer={
        manager && entry.classId ? (
          <Link
            className={buttonClass({
              variant: "secondary",
            })}
            href={`/manager/classes/${entry.classId}`}
          >
            {l.details}
          </Link>
        ) : undefined
      }
    >
      <dl
        className="stack"
        style={{ margin: 0 }}
      >
        <div className="row spread">
          <dt>{shared.type}</dt>

          <dd style={{ margin: 0 }}>
            {shared.types[entry.sourceType]}
          </dd>
        </div>

        <div className="row spread">
          <dt>{l.room}</dt>

          <dd style={{ margin: 0 }}>
            {roomName || "—"}
          </dd>
        </div>

        <div className="row spread">
          <dt>{l.coach}</dt>

          <dd style={{ margin: 0 }}>
            {entry.coachName || "—"}
          </dd>
        </div>

        <div className="row spread">
          <dt>{l.status}</dt>

          <dd style={{ margin: 0 }}>
            <StatusChip value={entry.status} />
          </dd>
        </div>
      </dl>

      {entry.sourceType === "COURT_RENTAL" && (
        <p>
          {l.expectedAttendees}:{" "}
          <strong>{entry.expectedAttendees ?? 0}</strong>
        </p>
      )}

      {["CLASS_SESSION", "PT_SESSION"].includes(
        entry.sourceType,
      ) && (
        <div>
          <h3>{shared.participants}</h3>

          {participants.length ? (
            <Table
              headers={
                entry.sourceType === "CLASS_SESSION"
                  ? [l.member, l.attendance]
                  : [l.member]
              }
            >
              {participants.map((participant) => (
                <tr key={participant.memberId}>
                  <td>{participant.memberName}</td>

                  {entry.sourceType === "CLASS_SESSION" && (
                    <td>
                      <StatusChip
                        value={
                          participant.attendanceStatus
                        }
                      />
                    </td>
                  )}
                </tr>
              ))}
            </Table>
          ) : (
            <p className="muted">
              {shared.noParticipants}
            </p>
          )}
        </div>
      )}
    </Drawer>
  );
}