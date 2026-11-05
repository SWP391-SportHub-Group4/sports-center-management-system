"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { AsyncSection, Dialog, Field } from "@/components/ui";
import { Tabs } from "@/components/primitives";
import { api } from "@/lib/apiClient";
import { useAction, useApi, useNow } from "@/lib/useApi";
import { useLanguage } from "@/lib/language";
import { todayIso } from "@/lib/format";
import { vietnamLocal, vietnamUtc } from "@/lib/vietnam-time";
import {
  loadCenterHours,
  centerHoursError,
  minutesToTime,
  type CenterHours,
} from "@/lib/center-hours";
import type { CourseSessionDto, ManagerCourseDto, RoomDto } from "@/lib/types";
import { catalogApi } from "@/features/catalog";
import { ChangeLeadCoachDialog } from "./change-lead-coach-dialog";
import { ScheduleRuleEditor, type ScheduleRule } from "./schedule-rule-editor";
import { ClassWeekSchedule } from "./class-week-schedule";
import { previewRemainingSessions } from "./preview";
import { scheduleInputIssue } from "./schedule-validation";
import styles from "./class-edit-dialog.module.css";

type SchedulePreview = {
  previewToken: string;
};

export function ClassEditDialog({
  course,
  initialTab = "coach",
  onClose,
  onSaved,
}: {
  course: ManagerCourseDto;
  initialTab?: "coach" | "schedule";
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useLanguage();
  const [tab, setTab] = useState<string>(initialTab);
  const [busy, setBusy] = useState(false);
  return (
    <Dialog
      title="Edit class"
      size="lg"
      className={styles.dialog}
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <div className={styles.tabWorkspace}>
        <Tabs
          ariaLabel="Class settings"
          tabs={[
            { id: "coach", label: t.leadCoach.change },
            { id: "schedule", label: "Weekly schedule" },
          ]}
          value={tab}
          onChange={(next) => {
            if (!busy) setTab(next);
          }}
        >
          {tab === "coach" ? (
            <ChangeLeadCoachDialog
              course={course}
              embedded
              onBusyChange={setBusy}
              onClose={onClose}
              onSaved={onSaved}
            />
          ) : (
            <ScheduleSettings
              course={course}
              onBusyChange={setBusy}
              onClose={onClose}
              onSaved={onSaved}
            />
          )}
        </Tabs>
      </div>
    </Dialog>
  );
}

function ScheduleSettings({
  course,
  onBusyChange,
  onClose,
  onSaved,
}: {
  course: ManagerCourseDto;
  onBusyChange: (busy: boolean) => void;
  onClose: () => void;
  onSaved: () => void;
}) {
  const state = useApi(
    async (signal) => {
      const [sessions, rooms, hours] = await Promise.all([
        api.get<CourseSessionDto[]>(`/api/classes/${course.classId}/sessions`, {
          signal,
        }),
        catalogApi.rooms(signal),
        loadCenterHours(signal),
      ]);
      return { sessions, rooms, hours };
    },
    [course.classId],
  );
  return (
    <AsyncSection state={state}>
      {(data) => (
        <ScheduleSettingsForm
          course={course}
          {...data}
          onBusyChange={onBusyChange}
          onClose={onClose}
          onSaved={onSaved}
        />
      )}
    </AsyncSection>
  );
}

function ScheduleSettingsForm({
  course,
  sessions,
  rooms,
  hours,
  onBusyChange,
  onClose,
  onSaved,
}: {
  course: ManagerCourseDto;
  sessions: CourseSessionDto[];
  rooms: RoomDto[];
  hours: CenterHours;
  onBusyChange: (busy: boolean) => void;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useLanguage();
  const now = useNow(1000);
  const remaining = sessions
    .filter(
      (session) =>
        session.status === "SCHEDULED" && Date.parse(session.startAtUtc) > now,
    )
    .sort((a, b) => a.startAtUtc.localeCompare(b.startAtUtc));
  const [rules, setRules] = useState<ScheduleRule[]>(course.scheduleRules);
  const [firstSessionDate, setFirstSessionDate] = useState(() =>
    remaining[0]
      ? vietnamLocal(remaining[0].startAtUtc).slice(0, 10)
      : todayIso(),
  );
  const [confirming, setConfirming] = useState(false);
  const action = useAction();
  useEffect(() => {
    onBusyChange(action.busy || confirming);
    return () => onBusyChange(false);
  }, [action.busy, confirming, onBusyChange]);
  const minutes =
    course.sessionMinutes ??
    (remaining[0]
      ? (Date.parse(remaining[0].endAtUtc) -
          Date.parse(remaining[0].startAtUtc)) /
        60000
      : 60);
  const notBefore = /^\d{4}-\d{2}-\d{2}$/.test(firstSessionDate)
    ? vietnamUtc(`${firstSessionDate}T00:00`)
    : undefined;
  const dateError = !notBefore
    ? "Choose a start date."
    : firstSessionDate < todayIso()
      ? "Choose today or a future date."
      : rules.length > 0 &&
          !rules.some(
            (rule) =>
              rule.dayOfWeek ===
              new Date(`${firstSessionDate}T12:00:00Z`).getUTCDay(),
          )
        ? "Choose a date matching a selected weekday."
        : null;
  const localSlots = previewRemainingSessions(
    notBefore,
    remaining.length,
    rules,
    minutes,
  );
  const startDate = localSlots[0]
    ? vietnamLocal(localSlots[0].startAtUtc).slice(0, 10)
    : remaining[0]
      ? vietnamLocal(remaining[0].startAtUtc).slice(0, 10)
      : todayIso();
  const draft = {
    ...course,
    startDate,
    scheduleRules: rules,
    numSessions: remaining.length,
  };
  const issue = dateError || scheduleInputIssue(draft, minutes, now, notBefore);
  if (!remaining.length && !confirming)
    return (
      <p role="status">There are no future scheduled sessions to change.</p>
    );
  return (
    <>
      <form
        className={styles.form}
        onSubmit={(event) => {
          event.preventDefault();
          if (action.busy || issue) return;
          action.reset();
          setConfirming(true);
        }}
      >
        <div className={styles.layout}>
          <fieldset className={styles.fields} disabled={action.busy}>
            <p className={styles.duration}>{minutes} min / session</p>
            <Field label="First remaining session" required error={dateError}>
              <input
                type="date"
                required
                min={todayIso()}
                value={firstSessionDate}
                onChange={(event) => {
                  setFirstSessionDate(event.target.value);
                  action.reset();
                }}
              />
            </Field>
            <div
              className={styles.ruleScroll}
              role="region"
              aria-label="Weekly schedule rules"
              tabIndex={0}
            >
              <ScheduleRuleEditor
                className={styles.weeklyRules}
                compact
                value={rules}
                minStart={hours.opens}
                maxStart={minutesToTime(
                  Math.max(0, hours.closingMinute - minutes),
                )}
                timeError={centerHoursError(hours)}
                onChange={(next) => {
                  setRules(next);
                  action.reset();
                }}
              />
            </div>
            {issue && !dateError && (
              <p role="status" className={styles.hint}>
                Choose valid weekdays and future times without overlapping
                sessions.
              </p>
            )}
            {action.error && (
              <p role="alert" className={styles.error}>
                {action.error}
              </p>
            )}
          </fieldset>
          <div className={styles.calendarColumn}>
            <div className={styles.calendar}>
              <ClassWeekSchedule
                key={startDate}
                startDate={startDate}
                coachId={course.coachId ?? ""}
                roomId={course.defaultRoomId}
                rooms={rooms}
                classId={course.classId}
                excludeSessionIds={remaining.map(
                  (session) => session.sessionId,
                )}
                draftSessions={localSlots}
                showDraftSessions
              />
            </div>
          </div>
        </div>
        <div className={styles.footer} data-class-edit-actions>
          <button
            type="button"
            className="btn btn--secondary"
            disabled={action.busy}
            onClick={onClose}
          >
            {t.common.cancel}
          </button>
          <button
            type="submit"
            className="btn"
            disabled={action.busy || !!issue}
          >
            {action.busy ? t.common.loading : "Confirm change"}
          </button>
        </div>
      </form>
      {confirming &&
        createPortal(
          <Dialog
            title="Confirm schedule change"
            size="sm"
            showCloseButton={false}
            onClose={() => {
              if (!action.busy) setConfirming(false);
            }}
            footer={
              <div className={styles.confirmationActions}>
                <button
                  type="button"
                  className="btn"
                  disabled={action.busy || !!issue}
                  aria-busy={action.busy}
                  onClick={async () => {
                    if (action.busy || issue) return;
                    const body = {
                      expectedVersion: course.version,
                      firstSessionDate,
                      scheduleRules: rules,
                    };
                    const saved = await action.run(async () => {
                      const checked = await api.post<SchedulePreview>(
                        `/api/manager/classes/${course.classId}/schedule/preview`,
                        body,
                      );
                      await api.post(
                        `/api/manager/classes/${course.classId}/schedule`,
                        { ...body, previewToken: checked.previewToken },
                      );
                      return true;
                    });
                    if (saved) onSaved();
                    else setConfirming(false);
                  }}
                >
                  Yes
                </button>
                <button
                  type="button"
                  className="btn btn--secondary"
                  disabled={action.busy}
                  onClick={() => setConfirming(false)}
                >
                  No
                </button>
              </div>
            }
          >
            <p className={styles.confirmationQuestion}>
              Are you sure you want to change the class schedule?
            </p>
          </Dialog>,
          document.body,
        )}
    </>
  );
}
