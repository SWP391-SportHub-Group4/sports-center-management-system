"use client";
import Link from "next/link";
import { Card, StatusChip, Table } from "@/components/ui";
import { useLanguage } from "@/lib/language";
import { formatDateTime } from "@/lib/format";
import type { CourtScheduleEntryDto } from "@/lib/types";
export function OccupancyDetail({
  entry,
  manager,
}: {
  entry: CourtScheduleEntryDto;
  manager: boolean;
}) {
  const { t } = useLanguage();
  const l = t.operations;
  return (
    <Card title={entry.title}>
      <p>
        {formatDateTime(entry.startAtUtc)} – {formatDateTime(entry.endAtUtc)} ·{" "}
        {entry.coachName}
      </p>
      <StatusChip value={entry.status} />
      {entry.sourceType === "COURT_RENTAL" ? (
        <p>
          {l.expectedAttendees}: {entry.expectedAttendees}
        </p>
      ) : ["CLASS_SESSION", "PT_SESSION"].includes(entry.sourceType) ? (
        <Table
          headers={
            entry.sourceType === "PT_SESSION"
              ? [l.member]
              : [l.member, l.attendance]
          }
        >
          {entry.participants.map((p) => (
            <tr key={p.memberId}>
              <td>{p.memberName}</td>
              {entry.sourceType === "CLASS_SESSION" && (
                <td>
                  <StatusChip value={p.attendanceStatus} />
                </td>
              )}
            </tr>
          ))}
        </Table>
      ) : null}
      {manager && entry.classId && (
        <Link
          className="btn btn--secondary"
          href={`/manager/classes/${entry.classId}`}
        >
          {l.details}
        </Link>
      )}
    </Card>
  );
}
