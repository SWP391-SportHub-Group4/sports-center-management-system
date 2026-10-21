"use client";
import { useState } from "react";
import Link from "next/link";
import { api } from "@/lib/apiClient";
import { useApi, useAction } from "@/lib/useApi";
import { AsyncSection, Field } from "@/components/ui";
import { CoachSelector } from "./coach-selector";
import { formatDateTime } from "@/lib/format";
type Course = { classId: number; name: string; sportId: number };
type Coverage = {
  coachId: string;
  mainClasses: Course[];
  sessions: { sessionId: string; classId: number; startAtUtc: string }[];
};
export function LockedCoachAssignments({
  coachId,
  onChanged,
}: {
  coachId: string;
  onChanged: () => void;
}) {
  const state = useApi(
    (signal) => api.get<Coverage[]>("/api/manager/coach-coverage", { signal }),
    [coachId],
  );
  return (
    <section className="stack" aria-label="Assignments needing a replacement">
      <h3>Assignments to review</h3>
      <p>
        Changing the main coach keeps existing session assignments. Review the
        sessions below.
      </p>
      <AsyncSection state={state}>
        {(rows) => {
          const row = rows.find((r) => r.coachId === coachId);
          if (!row || (!row.mainClasses.length && !row.sessions.length))
            return <p>No assignments need a replacement.</p>;
          return (
            <>
              {row.mainClasses.map((course) => (
                <MainCoach
                  key={course.classId}
                  coachId={coachId}
                  course={course}
                  onChanged={() => {
                    state.reload();
                    onChanged();
                  }}
                />
              ))}
              {!!row.sessions.length && (
                <>
                  <h4>Sessions still assigned to this coach</h4>
                  <ul>
                    {row.sessions.map((s) => (
                      <li key={s.sessionId}>
                        <Link
                          href={`/manager/classes/${s.classId}?tab=sessions`}
                        >
                          {formatDateTime(s.startAtUtc)} · View session
                        </Link>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </>
          );
        }}
      </AsyncSection>
    </section>
  );
}
function MainCoach({
  coachId,
  course,
  onChanged,
}: {
  coachId: string;
  course: Course;
  onChanged: () => void;
}) {
  const [replacement, setReplacement] = useState("");
  const [reason, setReason] = useState("");
  const [editing, setEditing] = useState(false);
  const action = useAction();
  return (
    <section className="stack">
      <div className="row">
        <Link href={`/manager/classes/${course.classId}`}>{course.name}</Link>
        <button
          type="button"
          className="btn btn--secondary btn--sm"
          onClick={() => setEditing((v) => !v)}
        >
          {editing ? "Close" : "Change main coach"}
        </button>
      </div>
      {editing && (
        <form
          className="stack"
          onSubmit={(e) => {
            e.preventDefault();
            void action.run(async () => {
              await api.post(
                `/api/manager/coach-coverage/${coachId}/classes/${course.classId}/reassign-main`,
                { replacementCoachId: replacement, reason: reason.trim() },
              );
              onChanged();
            });
          }}
        >
          <CoachSelector
            sportId={course.sportId}
            value={replacement}
            onChange={setReplacement}
          />
          <Field label="Reason" required>
            <textarea
              required
              minLength={3}
              maxLength={500}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </Field>
          {action.error && <p role="alert">{action.error}</p>}
          <button
            className="btn"
            disabled={
              action.busy ||
              !replacement ||
              replacement === coachId ||
              reason.trim().length < 3
            }
          >
            {action.busy ? "Saving…" : "Confirm main coach"}
          </button>
        </form>
      )}
    </section>
  );
}
