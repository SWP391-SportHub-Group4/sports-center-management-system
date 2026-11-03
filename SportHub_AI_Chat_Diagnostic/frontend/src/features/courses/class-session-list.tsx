"use client";

import {
  CornerDownRight,
  CalendarClock,
  MapPin,
  UserRound,
  Users,
} from "lucide-react";
import { StatusChip } from "@/components/ui";
import { formatDate, formatDateTime, formatTime } from "@/lib/format";
import { useLanguage } from "@/lib/language";
import type { CourseSessionDto } from "@/lib/types";
import styles from "./class-session-list.module.css";

/** Keep every session once, with replacements directly after their source.
 * A missing source or a malformed cycle must never hide a session's history.
 */
function sessionGroups(sessions: CourseSessionDto[]) {
  const sorted = [...sessions].sort((a, b) => a.sessionNo - b.sessionNo);
  const byId = new Map(sorted.map((session) => [session.sessionId, session]));
  const children = new Map<string, CourseSessionDto[]>();
  for (const session of sorted) {
    const source = session.rescheduledFromSessionId;
    if (!session.isMakeup || !source || !byId.has(source)) continue;
    const siblings = children.get(source) ?? [];
    siblings.push(session);
    children.set(source, siblings);
  }
  const visited = new Set<string>();
  const groups: { session: CourseSessionDto; nested: boolean }[][] = [];
  function addGroup(root: CourseSessionDto) {
    const group: (typeof groups)[number] = [];
    const pending = [{ session: root, nested: false }];
    while (pending.length) {
      const item = pending.pop()!;
      if (visited.has(item.session.sessionId)) continue;
      visited.add(item.session.sessionId);
      group.push(item);
      for (const child of [
        ...(children.get(item.session.sessionId) ?? []),
      ].reverse()) {
        pending.push({ session: child, nested: true });
      }
    }
    if (group.length) groups.push(group);
  }
  sorted
    .filter(
      (s) =>
        !s.isMakeup ||
        !s.rescheduledFromSessionId ||
        !byId.has(s.rescheduledFromSessionId),
    )
    .forEach(addGroup);
  sorted.forEach(addGroup);
  return { groups, children, byId };
}

export function ClassSessionList({
  sessions,
  editable,
  onAttendance,
  onEdit,
}: {
  sessions: CourseSessionDto[];
  editable: boolean;
  onAttendance: (session: CourseSessionDto) => void;
  onEdit: (session: CourseSessionDto) => void;
}) {
  const { t } = useLanguage();
  const l = t.classSessions;
  const { groups, children, byId } = sessionGroups(sessions);
  const sessionLabel = (session: CourseSessionDto) =>
    l.session.replace("{number}", String(session.sessionNo));
  return (
    <div className={styles.schedule}>
      <p className={styles.hint}>{l.groupingHint}</p>
      <ol
        className={styles.groups}
        aria-label={t.managerOperations.sessionsTab}
      >
        {groups.map((group) => (
          <li
            key={group[0].session.sessionId}
            className={styles.group}
            data-linked={group.length > 1 || undefined}
          >
            {group.map(({ session, nested }) => {
              const source = session.rescheduledFromSessionId
                ? byId.get(session.rescheduledFromSessionId)
                : undefined;
              const replacements = children.get(session.sessionId) ?? [];
              return (
                <article
                  key={session.sessionId}
                  className={styles.session}
                  data-makeup={session.isMakeup || undefined}
                  data-nested={nested || undefined}
                  aria-label={sessionLabel(session)}
                >
                  <div className={styles.identity}>
                    <h3>
                      {nested && (
                        <CornerDownRight size={17} aria-hidden="true" />
                      )}
                      {sessionLabel(session)}
                    </h3>
                    {session.isMakeup && (
                      <span className={styles.makeupLabel}>
                        {source
                          ? l.makeupFor.replace(
                              "{number}",
                              String(source.sessionNo),
                            )
                          : l.makeup}
                      </span>
                    )}
                    <StatusChip value={session.status} />
                  </div>
                  <div className={styles.when}>
                    <CalendarClock size={18} aria-hidden="true" />
                    <div>
                      <strong>{formatDate(session.startAtUtc)}</strong>
                      <p>
                        {formatTime(session.startAtUtc)} –{" "}
                        {formatTime(session.endAtUtc)}
                        {formatDate(session.startAtUtc) !==
                          formatDate(session.endAtUtc) &&
                          ` · ${formatDate(session.endAtUtc)}`}
                      </p>
                    </div>
                  </div>
                  <div className={styles.resources}>
                    <span>
                      <MapPin size={16} aria-hidden="true" />
                      {session.roomName}
                    </span>
                    <span>
                      <UserRound size={16} aria-hidden="true" />
                      {session.coachName || "—"}
                    </span>
                  </div>
                  <div className={styles.actions}>
                    <button
                      type="button"
                      className="btn btn--secondary btn--sm"
                      onClick={() => onAttendance(session)}
                    >
                      <Users size={16} aria-hidden="true" />
                      {t.operations.attendance}
                    </button>
                    {editable && session.status === "SCHEDULED" && (
                      <button
                        type="button"
                        className="btn btn--ghost btn--sm"
                        onClick={() => onEdit(session)}
                      >
                        {t.operations.edit}
                      </button>
                    )}
                  </div>
                  {session.status === "CANCELLED" &&
                    replacements.length > 0 && (
                      <div className={styles.replacement}>
                        {session.incidentReport?.reason && (
                          <p>
                            <strong>{t.operations.reason}:</strong>{" "}
                            {session.incidentReport.reason}
                          </p>
                        )}
                        {replacements.map((replacement) => (
                          <p key={replacement.sessionId}>
                            <CornerDownRight size={16} aria-hidden="true" />
                            <span>
                              <strong>
                                {l.replacement.replace(
                                  "{number}",
                                  String(replacement.sessionNo),
                                )}
                              </strong>
                              {" · "}
                              {formatDateTime(replacement.startAtUtc)} –{" "}
                              {formatTime(replacement.endAtUtc)}
                              {" · "}
                              {replacement.roomName}
                              {" · "}
                              {replacement.coachName}
                            </span>
                          </p>
                        ))}
                      </div>
                    )}
                </article>
              );
            })}
          </li>
        ))}
      </ol>
    </div>
  );
}
