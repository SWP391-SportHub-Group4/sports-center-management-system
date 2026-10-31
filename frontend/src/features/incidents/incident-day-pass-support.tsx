"use client";

import { Card } from "@/components/ui";
import { UserAvatar } from "@/components/UserAvatar";
import { useLanguage } from "@/lib/language";
import type { IncidentDetails } from "./incident-api";
import styles from "./incident-day-pass-members.module.css";

export function IncidentDayPassSupport({
  incident,
}: {
  incident: IncidentDetails;
}) {
  const { t } = useLanguage();
  if (!incident.closesGym) return null;
  const members = [
    ...new Map(
      (incident.dayPassMembers ?? []).map((member) => [
        member.memberId,
        member,
      ]),
    ).values(),
  ];
  const title = t.incidentDayPassMembers.detailsTitle;
  return (
    <Card title={title}>
      {members.length > 0 ? (
        <ul className={styles.members} tabIndex={0} aria-label={title}>
          {members.map((member) => (
            <li key={member.memberId}>
              <UserAvatar
                userId={member.memberId}
                name={member.memberName ?? t.incidentRefunds.unknown}
                size={40}
              />
              <span>{member.memberName ?? t.incidentRefunds.unknown}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p>{t.incidentDayPassMembers.empty}</p>
      )}
    </Card>
  );
}
