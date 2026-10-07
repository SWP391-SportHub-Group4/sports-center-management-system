"use client";

import { StatusChip } from "@/components/ui";
import { useLanguage } from "@/lib/language";
import { formatDateTime } from "@/lib/format";
import type { PtChangeRequestDto } from "@/lib/types";
import styles from "./training.module.css";

const isPending = (status: string) => status.toUpperCase() === "PENDING";

/**
 * Yêu cầu đã gửi và trạng thái duyệt. Yêu cầu chờ duyệt luôn kèm dòng "lịch chưa đổi":
 * đã gửi không đồng nghĩa với đã đổi lịch.
 */
export function RequestList({
  requests,
  empty,
  coach = false,
}: {
  requests: PtChangeRequestDto[];
  empty: string;
  coach?: boolean;
}) {
  const { t } = useLanguage();
  const l = t.ptOps;
  if (!requests.length) return <p className={styles.muted}>{empty}</p>;
  return (
    <ul className={styles.requests}>
      {requests.map((q) => (
        <li key={q.requestId}>
          <div className={styles.requestHead}>
            <strong>
              {coach
                ? l.requestCoach
                : q.requestType === "RESCHEDULE"
                  ? l.typeReschedule
                  : l.typeCancel}
            </strong>
            <StatusChip value={q.status} />
            {q.timingClassification && (
              <StatusChip value={q.timingClassification} />
            )}
          </div>
          {coach && q.requestedCoachName && <p>{q.requestedCoachName}</p>}
          {q.requestedStartAtUtc && (
            <p>
              {l.requestedFor}: {formatDateTime(q.requestedStartAtUtc)}
            </p>
          )}
          {q.reason && <p>{q.reason}</p>}
          {isPending(q.status) && <p>{l.pendingNote}</p>}
          {q.reviewNote && (
            <p>
              {l.centerReply}: {q.reviewNote}
            </p>
          )}
        </li>
      ))}
    </ul>
  );
}

export { isPending };
