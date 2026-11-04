"use client";

import { useState } from "react";
import { Table } from "@/components/ui";
import { UserAvatar } from "@/components/UserAvatar";
import { useLanguage } from "@/lib/language";
import type { IncidentDetails } from "./incident-api";
import styles from "./incident-day-pass-members.module.css";

export function IncidentDayPassSupport({
  incident,
}: {
  incident: IncidentDetails;
}) {
  const { t, language } = useLanguage();
  const [search, setSearch] = useState("");
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
  if (!members.length) return null;
  const normalize = (value: string) =>
    value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/đ/g, "d")
      .replace(/Đ/g, "D")
      .toLocaleLowerCase();
  const visible = members.filter((member) =>
    normalize(
      `${member.memberName ?? t.incidentRefunds.unknown} ${incident.dayPassMemberEmails?.[member.memberId] ?? ""}`,
    ).includes(normalize(search.trim())),
  );
  return (
    <section className={styles.support}>
      <h3>{title}</h3>
      <div className={styles.search}>
        <input
          type="search"
          aria-label={
            language === "vi"
              ? "Tìm theo tên hoặc email"
              : "Search by name or email"
          }
          placeholder={
            language === "vi"
              ? "Tìm theo tên hoặc email"
              : "Search by name or email"
          }
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </div>
      {visible.length > 0 ? (
        <div className={styles.members}>
          <Table headers={[language === "vi" ? "Hội viên" : "Member", "Email"]}>
            {visible.map((member) => (
              <tr key={member.memberId}>
                <td>
                  <div className={styles.memberIdentity}>
                    <UserAvatar
                      userId={member.memberId}
                      name={member.memberName ?? t.incidentRefunds.unknown}
                      size={40}
                    />
                    <span>
                      {member.memberName ?? t.incidentRefunds.unknown}
                    </span>
                  </div>
                </td>
                <td>
                  {incident.dayPassMemberEmails?.[member.memberId] || "—"}
                </td>
              </tr>
            ))}
          </Table>
        </div>
      ) : (
        <p role="status">
          {members.length
            ? language === "vi"
              ? "Không có hội viên phù hợp."
              : "No matching members."
            : t.incidentDayPassMembers.empty}
        </p>
      )}
    </section>
  );
}
