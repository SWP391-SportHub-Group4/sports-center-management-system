"use client";
import { useState } from "react";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { api } from "@/lib/apiClient";
import { useApi } from "@/lib/useApi";
import { AsyncSection, StatusChip, Table } from "@/components/ui";
import { ChangeLeadCoachDialog } from "@/features/courses";
import type { CourseSessionDto, ManagerCourseDto } from "@/lib/types";
import { formatDateTime } from "@/lib/format";
import styles from "./coach-overview.module.css";

type CoverageSession = Pick<
  CourseSessionDto,
  | "sessionId"
  | "classId"
  | "startAtUtc"
  | "endAtUtc"
  | "sessionNo"
  | "roomId"
  | "roomName"
  | "coachId"
> & { isSubstitute: boolean };
type Coverage = {
  coachId: string;
  mainClasses: { classId: number }[];
  sessions: CoverageSession[];
};
type Selection = { course: ManagerCourseDto; session?: CourseSessionDto };

export function LockedCoachAssignments({
  coachId,
  coachName,
  onChanged,
}: {
  coachId: string;
  coachName: string;
  onChanged: () => void;
}) {
  const [selected, setSelected] = useState<Selection | null>(null);
  const [success, setSuccess] = useState("");
  const state = useApi(
    async (signal) => {
      const coverage = await api.get<Coverage[]>(
        "/api/manager/coach-coverage",
        { signal },
      );
      const row = coverage.find((entry) => entry.coachId === coachId);
      const ids = [
        ...new Set([
          ...(row?.mainClasses ?? []).map((c) => c.classId),
          ...(row?.sessions ?? []).map((s) => s.classId),
        ]),
      ];
      const courses = await Promise.all(
        ids.map((id) =>
          api.get<ManagerCourseDto>(`/api/manager/classes/${id}`, { signal }),
        ),
      );
      const main = courses.filter((c) => c.coachId === coachId);
      const substitutes = (row?.sessions ?? [])
        .filter((s) => s.isSubstitute)
        .map((s) => ({
          course: courses.find((c) => c.classId === s.classId)!,
          session: {
            ...s,
            className: courses.find((c) => c.classId === s.classId)!.name,
            coachName,
            status: "SCHEDULED",
            isMakeup: false,
            rescheduledFromSessionId: null,
          } satisfies CourseSessionDto,
        }));
      return { main, substitutes };
    },
    [coachId, coachName],
  );

  return (
    <section className={styles.coverage} aria-labelledby="coach-coverage-title">
      <header className={styles.coverageHeader}>
        <AlertTriangle size={24} aria-hidden="true" />
        <div>
          <h2 id="coach-coverage-title">Assignments to review</h2>
          <p>
            This coach has a deactivated account. Replace their lead assignments
            and substitute sessions before the next class.
          </p>
        </div>
      </header>
      {success && (
        <p role="status" className={styles.success}>
          {success}
        </p>
      )}
      <AsyncSection state={state}>
        {({ main, substitutes }) =>
          main.length || substitutes.length ? (
            <Table
              headers={[
                "Assignment",
                "Class / session",
                "Schedule affected",
                "Action",
              ]}
            >
              {main.map((course) => (
                <tr key={`class-${course.classId}`}>
                  <td>
                    <span className={styles.assignmentType}>Lead coach</span>
                  </td>
                  <td>
                    <div className={styles.classInfo}>
                      <Link href={`/manager/classes/${course.classId}`}>
                        {course.name}
                      </Link>
                      <span>{course.sportName}</span>
                      <StatusChip value={course.status} />
                    </div>
                  </td>
                  <td>All future scheduled sessions</td>
                  <td>
                    {["PUBLISHED", "IN_PROGRESS"].includes(course.status) ? (
                      <button
                        type="button"
                        className="btn btn--secondary"
                        onClick={() => setSelected({ course })}
                      >
                        Change Lead Coach
                      </button>
                    ) : (
                      <Link
                        className="btn btn--secondary"
                        href={`/manager/classes/${course.classId}/edit`}
                      >
                        Review draft class
                      </Link>
                    )}
                  </td>
                </tr>
              ))}
              {substitutes.map(({ course, session }) => (
                <tr key={session.sessionId}>
                  <td>
                    <span className={styles.substituteType}>
                      Substitute coach
                    </span>
                  </td>
                  <td>
                    <div className={styles.classInfo}>
                      <Link
                        href={`/manager/classes/${course.classId}?tab=sessions`}
                      >
                        {course.name}
                      </Link>
                      <span>
                        Session {session.sessionNo} · {course.sportName}
                      </span>
                    </div>
                  </td>
                  <td>
                    <div className={styles.classInfo}>
                      <span>{formatDateTime(session.startAtUtc)}</span>
                      <span>
                        {formatDateTime(session.endAtUtc)} · {session.roomName}
                      </span>
                      <small>This session only</small>
                    </div>
                  </td>
                  <td>
                    <button
                      type="button"
                      className="btn btn--secondary"
                      onClick={() => setSelected({ course, session })}
                    >
                      Change Session Coach
                    </button>
                  </td>
                </tr>
              ))}
            </Table>
          ) : (
            <p className={styles.empty}>No assignments need a replacement.</p>
          )
        }
      </AsyncSection>
      {selected && (
        <ChangeLeadCoachDialog
          course={selected.course}
          session={selected.session}
          onClose={() => setSelected(null)}
          onSaved={() => {
            setSuccess(
              selected.session
                ? `Session ${selected.session.sessionNo} of ${selected.course.name} has a new coach.`
                : `Lead coach and future scheduled sessions updated for ${selected.course.name}.`,
            );
            setSelected(null);
            state.reload();
            onChanged();
          }}
        />
      )}
    </section>
  );
}
