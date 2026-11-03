"use client";

import { useId, useState } from "react";
import { AsyncSection, Dialog, Field } from "@/components/ui";
import { AvatarImage } from "@/components/AvatarImage";
import { useLanguage } from "@/lib/language";
import { useAction, useApi } from "@/lib/useApi";
import type { CourseSessionDto, ManagerCourseDto } from "@/lib/types";
import { api } from "@/lib/apiClient";
import { formatDateTime } from "@/lib/format";
import { courseApi } from "./api";
import styles from "./change-lead-coach.module.css";

export function ChangeLeadCoachDialog({
  course,
  session,
  onClose,
  onSaved,
}: {
  course: ManagerCourseDto;
  session?: CourseSessionDto;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useLanguage();
  const copy = t.leadCoach;
  const formId = useId();
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState("");
  const [reason, setReason] = useState("");
  const action = useAction();
  const candidates = useApi(
    async (signal) => {
      if (!session)
        return courseApi.leadCoachCandidates(course.classId, signal);
      const coaches = await api.get<{ coachId: string; fullName: string }[]>(
        "/api/availability/coaches",
        {
          signal,
          query: {
            sportId: course.sportId,
            startUtc: session.startAtUtc,
            endUtc: session.endAtUtc,
            excludeSessionId: session.sessionId,
          },
        },
      );
      return {
        version: course.version,
        currentCoachId: session.coachId,
        remainingSessionCount: 1,
        coaches: coaches.filter((coach) => coach.coachId !== session.coachId),
      };
    },
    [course.classId, course.sportId, course.version, session?.sessionId],
  );
  const selectedCoach = candidates.data?.coaches.find(
    (coach) => coach.coachId === selected,
  );
  const canSubmit =
    !!selectedCoach &&
    reason.trim().length >= 3 &&
    reason.trim().length <= 500 &&
    !candidates.loading &&
    !action.busy;

  return (
    <Dialog
      title={session ? "Select New Session Coach" : copy.title}
      description={
        session
          ? "Choose a qualified coach available for this session. The class lead coach, time and room stay the same."
          : copy.description
      }
      size="lg"
      closeIconOnly
      className={styles.dialog}
      onClose={() => {
        if (!action.busy) onClose();
      }}
      footer={
        <div className={styles.footer}>
          <button
            type="button"
            className="btn btn--secondary"
            disabled={action.busy}
            onClick={onClose}
          >
            {copy.cancel}
          </button>
          <button
            type="submit"
            form={formId}
            className="btn"
            disabled={!canSubmit}
          >
            {action.busy ? copy.saving : copy.confirm}
          </button>
        </div>
      }
    >
      <form
        id={formId}
        className={styles.form}
        aria-busy={action.busy}
        onSubmit={(event) => {
          event.preventDefault();
          if (!canSubmit || !candidates.data) return;
          void action
            .run(async () => {
              if (session)
                await api.post(
                  `/api/class-sessions/${session.sessionId}/reschedule`,
                  {
                    startAtUtc: session.startAtUtc,
                    coachId: selected,
                    reason: reason.trim(),
                  },
                );
              else
                await courseApi.changeLeadCoach(course.classId, {
                  coachId: selected,
                  expectedVersion: candidates.data!.version,
                  reason: reason.trim(),
                });
              onSaved();
              return true;
            })
            .then((saved) => {
              if (!saved) candidates.reload();
            });
        }}
      >
        <div className={styles.context}>
          <div>
            <span>{session ? "Current session coach" : copy.current}</span>
            <strong>
              {(session ? session.coachName : course.coachName) ??
                t.managerAudit.nameUnavailable}
            </strong>
          </div>
          <div>
            <span>{copy.specialty}</span>
            <strong>{course.sportName}</strong>
          </div>
        </div>
        {action.error && (
          <p role="alert" className={styles.error}>
            {action.error}
          </p>
        )}
        <AsyncSection state={candidates}>
          {(data) => (
            <>
              {data.remainingSessionCount > 0 && (
                <p className={styles.sessionCount}>
                  {session ? (
                    `Session ${session.sessionNo} · ${formatDateTime(session.startAtUtc)}`
                  ) : (
                    <>
                      {copy.sessions}:{" "}
                      <strong>{data.remainingSessionCount}</strong>
                    </>
                  )}
                </p>
              )}
              {data.coaches.length > 0 ? (
                <>
                  <Field label={copy.search}>
                    <input
                      type="search"
                      value={search}
                      disabled={action.busy}
                      onChange={(event) => setSearch(event.target.value)}
                    />
                  </Field>
                  <fieldset className={styles.coaches} disabled={action.busy}>
                    <legend>
                      {copy.eligible} <span>({data.coaches.length})</span>
                    </legend>
                    <div className={styles.list}>
                      {data.coaches
                        .filter((coach) =>
                          coach.fullName
                            .toLocaleLowerCase()
                            .includes(search.trim().toLocaleLowerCase()),
                        )
                        .map((coach) => (
                          <label key={coach.coachId} className={styles.coach}>
                            <input
                              type="radio"
                              name="leadCoach"
                              value={coach.coachId}
                              checked={selected === coach.coachId}
                              onChange={() => setSelected(coach.coachId)}
                            />
                            <AvatarImage
                              userId={coach.coachId}
                              name={coach.fullName}
                              size={40}
                            />
                            <span>
                              <strong>{coach.fullName}</strong>
                              <small>
                                {course.sportName} ·{" "}
                                {session
                                  ? "Available for this session"
                                  : copy.available}
                              </small>
                            </span>
                          </label>
                        ))}
                      {!data.coaches.some((coach) =>
                        coach.fullName
                          .toLocaleLowerCase()
                          .includes(search.trim().toLocaleLowerCase()),
                      ) && (
                        <p role="status" className={styles.empty}>
                          {copy.noMatches}
                        </p>
                      )}
                    </div>
                  </fieldset>
                  {selectedCoach && (
                    <p className={styles.selection}>
                      {session ? "New session coach" : copy.selected}:{" "}
                      <strong>{selectedCoach.fullName}</strong>
                    </p>
                  )}
                  <Field label={copy.reason} required>
                    <textarea
                      value={reason}
                      required
                      minLength={3}
                      maxLength={500}
                      rows={3}
                      placeholder={copy.reasonPlaceholder}
                      aria-describedby={`${formId}-reason-hint`}
                      disabled={action.busy}
                      onChange={(event) => setReason(event.target.value)}
                    />
                    <small id={`${formId}-reason-hint`} className="muted">
                      {copy.reasonHint}
                    </small>
                  </Field>
                </>
              ) : (
                <div className={styles.empty} role="status">
                  <h3>
                    {data.remainingSessionCount
                      ? copy.noCoaches
                      : copy.noSessions}
                  </h3>
                  <p>
                    {data.remainingSessionCount
                      ? session
                        ? "No other active coach with this specialty is free for this session. Review the session schedule before trying again."
                        : copy.noCoachesHint
                      : copy.noSessionsHint}
                  </p>
                </div>
              )}
            </>
          )}
        </AsyncSection>
      </form>
    </Dialog>
  );
}
