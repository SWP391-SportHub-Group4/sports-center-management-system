"use client";
import { UserAvatar } from "@/components/UserAvatar";
import { useLanguage } from "@/lib/language";
import type { IncidentPreviewDto } from "@/lib/types";
import styles from "./incident-refund-table.module.css";
import memberStyles from "./incident-day-pass-members.module.css";

export function dayPassRecipients(preview?: IncidentPreviewDto) {
  return [
    ...new Map(
      (preview?.members ?? [])
        .filter((m) => m.sourceType === "GYM_DAY_PASS")
        .map((m) => [m.memberId, m]),
    ).values(),
  ];
}
export function IncidentDayPassMembers({
  preview,
}: {
  preview: IncidentPreviewDto;
}) {
  const { t } = useLanguage();
  const title = t.incidentDayPassMembers.title;
  const members = dayPassRecipients(preview);
  if (!members.length) return null;
  return (
    <section className={styles.root} aria-label={title}>
      <div className={styles.heading}>
        <h3>
          {title} ({members.length})
        </h3>
      </div>
      <ul className={memberStyles.members} tabIndex={0} aria-label={title}>
        {members.map((m) => (
          <li key={m.memberId}>
            <UserAvatar
              userId={m.memberId}
              name={m.memberName ?? t.incidentRefunds.unknown}
              size={40}
            />
            <span>{m.memberName ?? t.incidentRefunds.unknown}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
