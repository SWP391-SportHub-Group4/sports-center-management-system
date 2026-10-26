"use client";

import { useEffect, useId, useRef, useState } from "react";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Clock3,
} from "lucide-react";
import { api, ApiError } from "@/lib/apiClient";
import { useAuth } from "@/lib/auth";
import { useNow, useApi } from "@/lib/useApi";
import { useLanguage } from "@/lib/language";
import { oneYearFromToday } from "@/lib/vietnam-time";
import { todayIso, formatMoney } from "@/lib/format";
import { Card, Field } from "@/components/ui";
import { MutationFeedback, useMutation } from "@/features/operations";
import { SportSelector, RoomSelector, catalogApi } from "@/features/catalog";
import { CoachSelector } from "@/features/coaches";
import { ScheduleRuleEditor } from "./schedule-rule-editor";
import { checkSchedule, ScheduleReview } from "./schedule-review";
import { previewSessions } from "./preview";
import { scheduleInputIssue } from "./schedule-validation";
import { useClassCodeValidation } from "./use-class-code-validation";
import { ClassWeekSchedule } from "./class-week-schedule";
import { managerWorkspaceStyles as styles } from "@/features/manager";
import type { ManagerCourseDto } from "@/lib/types";
import editorStyles from "./course-editor.module.css";
import {
  loadCenterHours,
  centerHoursError,
  timeToMinutes,
  minutesToTime,
} from "@/lib/center-hours";

export function CourseEditor({
  course,
  onSaved,
  onClose,
}: {
  course?: ManagerCourseDto;
  onSaved: (saved?: ManagerCourseDto) => void;
  onClose: () => void;
}) {
  const { t } = useLanguage();

  const l = t.operations;
  const m = t.managerOperations;
  const feedback = m.scheduleValidation;
  const feedbackId = useId();
  const now = useNow(1000);

  const { user } = useAuth();

  const mutation = useMutation();

  const formRef = useRef<HTMLFormElement>(null);

  const saved = useRef(false);

  const [step, setStep] = useState(0);

  const [hydrated, setHydrated] = useState(false);

  const [recovered, setRecovered] = useState(false);
  const [touched, setTouched] = useState({
    code: false,
    name: false,
    duration: false,
  });
  const [codeCheckAttempt, setCodeCheckAttempt] = useState(0);

  const [form, setForm] = useState({
    code: course?.code ?? "",

    name: course?.name ?? "",

    sportId: String(course?.sportId ?? ""),

    coachId: course?.coachId ?? "",

    defaultRoomId: String(course?.defaultRoomId ?? ""),

    startDate: course?.startDate ?? todayIso(),

    numSessions: course?.numSessions ?? 12,

    sessionMinutes: course?.sessionMinutes ?? (null as number | null),

    capacity: course?.capacity && course.capacity > 0 ? course.capacity : 12,

    price: course?.price ?? 300000,

    costAmount: course?.costAmount ?? 0,

    scheduleRules: course?.scheduleRules ?? [
      {
        dayOfWeek: new Date(`${todayIso()}T12:00:00Z`).getUTCDay(),

        startTimeLocal: "18:00",
      },
    ],
  });

  const inputCopy = m.classInputValidation;
  const codeStatus = useClassCodeValidation(
    form.code,
    course?.classId,
    codeCheckAttempt,
  );
  const codeError =
    mutation.error?.code === "class_code_taken" || codeStatus === "taken"
      ? inputCopy.codeTaken
      : touched.code && codeStatus === "invalid"
        ? inputCopy.codeLength
        : codeStatus === "error"
          ? inputCopy.codeCheckFailed
          : undefined;
  const nameError =
    touched.name && (!form.name.trim() || form.name.length > 150)
      ? inputCopy.nameRequired
      : undefined;

  const storageKey = `sporthub.class-draft.${user?.userId}.${course?.classId ?? "new"}.${course?.version ?? 0}`;

  /*
   * Restore browser draft.
   */
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(storageKey);

      if (raw) {
        const draft: unknown = JSON.parse(raw);

        if (
          draft &&
          typeof draft === "object" &&
          Object.keys(form)
            .filter((key) => key !== "sessionMinutes")
            .every((key) => key in draft) &&
          (!("sessionMinutes" in draft) ||
            (draft as typeof form).sessionMinutes === null ||
            Number.isFinite((draft as typeof form).sessionMinutes)) &&
          [
            "code",
            "name",
            "sportId",
            "coachId",
            "defaultRoomId",
            "startDate",
          ].every(
            (key) =>
              typeof (draft as Record<string, unknown>)[key] === "string",
          ) &&
          ["numSessions", "capacity", "price", "costAmount"].every((key) =>
            Number.isFinite((draft as Record<string, unknown>)[key]),
          ) &&
          Array.isArray((draft as typeof form).scheduleRules) &&
          (draft as typeof form).scheduleRules.every(
            (rule) =>
              rule &&
              Number.isInteger(rule.dayOfWeek) &&
              typeof rule.startTimeLocal === "string",
          )
        ) {
          /*
           * Restore per-user,
           * per-class,
           * versioned draft.
           */

          /* eslint-disable react-hooks/set-state-in-effect */

          setForm({
            ...(draft as typeof form),
            sessionMinutes:
              (draft as typeof form).sessionMinutes ??
              course?.sessionMinutes ??
              null,
          });

          setRecovered(true);

          /* eslint-enable react-hooks/set-state-in-effect */
        }
      }
    } catch {
      /*
       * sessionStorage is optional.
       * Keep editor usable if
       * storage is unavailable.
       */
    }

    setHydrated(true);

    /*
     * Caller keys editor by
     * class/version.
     */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);

  /*
   * Persist unsaved browser draft.
   */
  useEffect(() => {
    if (hydrated && !saved.current) {
      try {
        sessionStorage.setItem(storageKey, JSON.stringify(form));
      } catch {
        /*
         * Optional recovery only.
         */
      }
    }
  }, [form, hydrated, storageKey]);

  /*
   * Catalog context.
   */
  const catalog = useApi(async (signal) => {
    const [sports, rooms, center] = await Promise.all([
      catalogApi.sports(signal, true),

      catalogApi.rooms(signal),
      loadCenterHours(signal),
    ]);

    return {
      sports,
      rooms,
      center,
    };
  }, []);

  const service = catalog.data?.sports
    .find((sport) => sport.sportId === Number(form.sportId))
    ?.services.find(
      (service) => service.serviceType === "GROUP_COURSE" && service.isEnabled,
    );

  const room = catalog.data?.rooms.find(
    (room) => room.roomId === Number(form.defaultRoomId),
  );

  const minutes = form.sessionMinutes ?? service?.defaultSessionMinutes ?? 0;
  const maxMinutes = catalog.data
    ? Math.min(
        720,
        catalog.data.center.closingMinute - catalog.data.center.openingMinute,
      )
    : 720;
  const durationValid =
    Number.isInteger(minutes) && minutes >= 1 && minutes <= maxMinutes;
  const outsideCenter =
    !!catalog.data &&
    form.scheduleRules.some((rule) => {
      const start = timeToMinutes(rule.startTimeLocal);
      return (
        !Number.isFinite(start) ||
        start < catalog.data!.center.openingMinute ||
        start + minutes > catalog.data!.center.closingMinute
      );
    });

  const threshold =
    form.price > 0 ? Math.ceil(form.costAmount / form.price) : 0;
  const memberCount = (count: number) =>
    count === 1
      ? l.classSingleMember
      : l.classMemberCount.replace("{count}", String(count));

  const capacityInvalid =
    (!!room && form.capacity > room.capacity) ||
    (!!service?.defaultMaxCapacity &&
      form.capacity > service.defaultMaxCapacity);

  /*
   * Current form converted into
   * backend domain shape.
   */
  const schedule = {
    ...form,

    sessionMinutes: minutes,

    sportId: Number(form.sportId),

    defaultRoomId: Number(form.defaultRoomId),

    coachId: form.coachId || null,
  };

  /*
   * Local preview is still useful
   * for validating the form itself.
   */
  const slots = previewSessions(schedule, minutes);

  const scheduleFingerprint = JSON.stringify({
    minutes,
    sportId: schedule.sportId,
    defaultRoomId: schedule.defaultRoomId,
    coachId: schedule.coachId,
    capacity: schedule.capacity,
    startDate: schedule.startDate,
    numSessions: schedule.numSessions,
    scheduleRules: schedule.scheduleRules,
  });
  const inputIssue = scheduleInputIssue(schedule, minutes, now);
  const canCheckSchedule =
    step >= 1 &&
    !catalog.loading &&
    !catalog.error &&
    !inputIssue &&
    !outsideCenter;
  const availability = useApi(
    async (signal) => {
      if (!canCheckSchedule) return null;
      const rows = await checkSchedule(schedule, minutes, signal);
      return { fingerprint: scheduleFingerprint, rows };
    },
    [scheduleFingerprint, minutes, step >= 1, canCheckSchedule],
  );
  const currentCheck = availability.data?.fingerprint === scheduleFingerprint;
  const scheduleReady =
    canCheckSchedule &&
    currentCheck &&
    !availability.loading &&
    !availability.error &&
    availability.data?.rows.length === form.numSessions &&
    availability.data.rows.every((row) => row.available);
  const checkingSchedule =
    catalog.loading ||
    (!outsideCenter &&
      !inputIssue &&
      !catalog.error &&
      !availability.error &&
      (!currentCheck || availability.loading));
  const incompleteCheck =
    !inputIssue &&
    currentCheck &&
    !availability.loading &&
    availability.data?.rows.length !== form.numSessions;
  const availabilityErrors: Record<string, string> = {
    start_date_in_past: feedback.issues.pastDate,
    first_session_in_past: feedback.issues.pastTime,
    invalid_time: feedback.issues.time,
    invalid_range: feedback.issues.durationLimit,
  };
  const scheduleMessage = catalog.error
    ? feedback.settingsFailed
    : outsideCenter && catalog.data
      ? centerHoursError(catalog.data.center)
      : catalog.loading
        ? feedback.checking
        : inputIssue
          ? feedback.issues[inputIssue]
          : availability.error
            ? (availabilityErrors[availability.error.code] ??
              feedback.checkFailed)
            : checkingSchedule
              ? feedback.checking
              : incompleteCheck
                ? feedback.incomplete
                : scheduleReady
                  ? feedback.ready
                  : feedback.unavailable;
  const scheduleReasons =
    !inputIssue &&
    currentCheck &&
    !availability.loading &&
    !availability.error &&
    !incompleteCheck &&
    !scheduleReady
      ? [
          ...new Set(
            availability
              .data!.rows.filter((row) => !row.available)
              .flatMap((row) =>
                row.reasons.length ? row.reasons : ["unknown"],
              )
              .map(
                (reason) =>
                  feedback.reasons[reason as keyof typeof feedback.reasons] ??
                  feedback.reasons.unknown,
              ),
          ),
        ]
      : [];
  const retrySchedule =
    !!catalog.error || !!availability.error || incompleteCheck;
  const feedbackState = scheduleReady
    ? "ready"
    : checkingSchedule
      ? "checking"
      : "blocked";
  const FeedbackIcon = scheduleReady
    ? CheckCircle2
    : checkingSchedule
      ? Clock3
      : AlertCircle;

  const valid =
    codeStatus === "available" &&
    !codeError &&
    form.name.trim().length > 0 &&
    !!form.sportId &&
    durationValid &&
    !!form.defaultRoomId &&
    form.price >= 1000 &&
    form.price % 1000 === 0 &&
    form.costAmount >= 0 &&
    Number.isInteger(form.capacity) &&
    form.capacity >= 1 &&
    !capacityInvalid &&
    !outsideCenter &&
    threshold <= form.capacity &&
    slots.length === form.numSessions;

  function next() {
    if (!formRef.current?.reportValidity()) {
      return;
    }
    if (
      step === 0 &&
      (!durationValid || codeStatus !== "available" || codeError)
    )
      return;

    if (
      step === 1 &&
      (!scheduleReady || scheduleInputIssue(schedule, minutes, Date.now()))
    ) {
      return;
    }

    if (
      step === 2 &&
      (!valid ||
        !scheduleReady ||
        scheduleInputIssue(schedule, minutes, Date.now()))
    ) {
      return;
    }

    setStep(step + 1);
  }

  return (
    <Card>
      <ol className={styles.steps} aria-label={t.classWorkspace.setupProgress}>
        {[m.contentStep, m.scheduleStep, m.pricingStep, m.reviewStep].map(
          (label, index) => (
            <li
              key={label}
              aria-current={step === index ? "step" : undefined}
              data-complete={index < step || undefined}
            >
              {index + 1}. {label}
            </li>
          ),
        )}
      </ol>

      {recovered && <p role="status">{m.draftRecovered}</p>}

      <form
        ref={formRef}
        className="stack"
        onInvalidCapture={() =>
          setTouched({ code: true, name: true, duration: true })
        }
        onSubmit={async (event) => {
          event.preventDefault();

          /*
           * Steps 0-2 just
           * navigate forward.
           */
          if (step < 3) {
            next();
            return;
          }

          if (
            !valid ||
            !scheduleReady ||
            scheduleInputIssue(schedule, minutes, Date.now())
          ) {
            return;
          }

          // Save the current manually configured schedule.
          const body = {
            ...schedule,

            code: form.code.trim(),

            name: form.name.trim(),
          };

          let result: ManagerCourseDto | undefined;

          if (
            await mutation.run(async () => {
              try {
                result = await (course
                  ? api.put<ManagerCourseDto>(
                      `/api/manager/classes/${course.classId}`,
                      body,
                    )
                  : api.post<ManagerCourseDto>("/api/manager/classes", body));
              } catch (cause) {
                if (
                  cause instanceof ApiError &&
                  cause.code === "class_code_taken"
                ) {
                  setStep(0);
                  setTouched((previous) => ({ ...previous, code: true }));
                }
                throw cause;
              }
            })
          ) {
            saved.current = true;

            try {
              sessionStorage.removeItem(storageKey);
            } catch {
              /*
               * Ignore storage
               * cleanup failure.
               */
            }

            onSaved(result);
          }
        }}
      >
        <fieldset disabled={mutation.busy} className={styles.section}>
          {/* -------------------------------------------
              STEP 1 - CLASS INFORMATION
          ------------------------------------------- */}

          {step === 0 && (
            <div className="form-grid">
              <div>
                <Field
                  label={l.code}
                  required
                  error={codeError}
                  hint={
                    codeStatus === "checking" ? (
                      <span role="status">{inputCopy.codeChecking}</span>
                    ) : undefined
                  }
                >
                  <input
                    required
                    minLength={2}
                    maxLength={50}
                    value={form.code}
                    onBlur={() =>
                      setTouched((previous) => ({ ...previous, code: true }))
                    }
                    onChange={(event) => {
                      setTouched((previous) => ({ ...previous, code: true }));
                      mutation.reset();
                      setForm({
                        ...form,

                        code: event.target.value,
                      });
                    }}
                  />
                </Field>
                {codeStatus === "error" && (
                  <button
                    type="button"
                    className="btn btn--secondary"
                    onClick={() => setCodeCheckAttempt((value) => value + 1)}
                  >
                    {t.common.retry}
                  </button>
                )}
              </div>

              <Field label={l.name} required error={nameError}>
                <input
                  required
                  maxLength={150}
                  pattern=".*\S.*"
                  value={form.name}
                  onBlur={() =>
                    setTouched((previous) => ({ ...previous, name: true }))
                  }
                  onChange={(event) => {
                    setTouched((previous) => ({ ...previous, name: true }));
                    setForm({
                      ...form,

                      name: event.target.value,
                    });
                  }}
                />
              </Field>

              <SportSelector
                allowCreate
                onCatalogChanged={catalog.reload}
                groupOnly
                value={form.sportId}
                onChange={(sportId) =>
                  setForm({
                    ...form,

                    sportId,

                    /*
                     * Sport change
                     * invalidates
                     * coach
                     * selection.
                     */
                    coachId: "",
                  })
                }
              />
              <Field
                label={l.duration}
                required
                hint={l.classDurationHint}
                error={
                  (touched.duration || minutes !== 0) && !durationValid
                    ? feedback.issues.duration
                    : undefined
                }
              >
                <input
                  required
                  type="number"
                  min={1}
                  max={maxMinutes}
                  step={1}
                  value={minutes || ""}
                  onBlur={() =>
                    setTouched((previous) => ({ ...previous, duration: true }))
                  }
                  onChange={(event) => {
                    setTouched((previous) => ({ ...previous, duration: true }));
                    setForm({
                      ...form,
                      sessionMinutes: Number(event.target.value),
                    });
                  }}
                />
              </Field>
            </div>
          )}

          {/* -------------------------------------------
              STEP 2 - SCHEDULE
          ------------------------------------------- */}

          {step === 1 && (
            <>
              <div className="form-grid">
                <CoachSelector
                  sportId={Number(form.sportId)}
                  value={form.coachId}
                  onChange={(coachId) =>
                    setForm({
                      ...form,

                      coachId,
                    })
                  }
                />

                <RoomSelector
                  onCatalogChanged={catalog.reload}
                  onCourtCreated={(court) =>
                    setForm((current) => ({
                      ...current,
                      defaultRoomId: String(court.roomId),
                      sportId: String(court.sportId ?? current.sportId),
                      coachId:
                        !court.sportId ||
                        court.sportId === Number(current.sportId)
                          ? current.coachId
                          : "",
                    }))
                  }
                  sportId={Number(form.sportId)}
                  value={form.defaultRoomId}
                  onChange={(defaultRoomId) =>
                    setForm({
                      ...form,

                      defaultRoomId,
                    })
                  }
                />

                <Field
                  label={l.startDate}
                  hint={t.managerOperations.scheduleValidation.startDateHint}
                >
                  <input
                    required
                    type="date"
                    min={todayIso()}
                    max={oneYearFromToday(now)}
                    value={form.startDate}
                    onChange={(event) =>
                      setForm({
                        ...form,

                        startDate: event.target.value,
                      })
                    }
                  />
                </Field>

                <Field label={l.numSessions}>
                  <input
                    required
                    type="number"
                    min={1}
                    max={100}
                    step={1}
                    value={form.numSessions}
                    onChange={(event) =>
                      setForm({
                        ...form,

                        numSessions: Number(event.target.value),
                      })
                    }
                  />
                </Field>
              </div>

              <ScheduleRuleEditor
                timeError={
                  catalog.data
                    ? centerHoursError(catalog.data.center)
                    : undefined
                }
                minStart={catalog.data?.center.opens}
                maxStart={
                  catalog.data
                    ? minutesToTime(
                        Math.max(
                          0,
                          catalog.data.center.closingMinute - minutes,
                        ),
                      )
                    : undefined
                }
                value={form.scheduleRules}
                onChange={(scheduleRules) =>
                  setForm({
                    ...form,

                    scheduleRules,
                  })
                }
              />

              <div
                id={feedbackId}
                className={editorStyles.scheduleFeedback}
                data-state={feedbackState}
                role={feedbackState === "blocked" ? "alert" : "status"}
                aria-busy={checkingSchedule || undefined}
              >
                <FeedbackIcon size={22} aria-hidden="true" />
                <div className={editorStyles.scheduleFeedbackContent}>
                  <strong>{scheduleMessage}</strong>
                  {scheduleReasons.length > 0 && (
                    <ul>
                      {scheduleReasons.map((reason) => (
                        <li key={reason}>{reason}</li>
                      ))}
                    </ul>
                  )}
                </div>
                {retrySchedule && (
                  <button
                    type="button"
                    className="btn btn--secondary btn--sm"
                    onClick={
                      catalog.error ? catalog.reload : availability.reload
                    }
                  >
                    {t.common.retry}
                  </button>
                )}
              </div>
              <ClassWeekSchedule
                key={form.startDate}
                startDate={form.startDate}
                coachId={form.coachId}
                roomId={Number(form.defaultRoomId)}
                rooms={catalog.data?.rooms ?? []}
                classId={course?.classId}
                draftSessions={slots}
              />
            </>
          )}

          {/* -------------------------------------------
              STEP 3 - PRICING / CAPACITY
          ------------------------------------------- */}

          {step === 2 && (
            <>
              <div className="form-grid">
                {(
                  [
                    ["capacity", l.capacity, 1, 1],

                    ["price", t.classWorkspace.price, 1000, 1000],

                    ["costAmount", t.classWorkspace.cost, 0, 1],
                  ] as const
                ).map(([key, label, min, increment]) => (
                  <Field
                    key={key}
                    label={label}
                    error={
                      key === "price" &&
                      (!Number.isFinite(form.price) ||
                        form.price < 1000 ||
                        form.price % 1000 !== 0)
                        ? inputCopy.price
                        : key === "capacity" &&
                            (!Number.isInteger(form.capacity) ||
                              form.capacity < 1)
                          ? inputCopy.capacity
                          : key === "costAmount" &&
                              (!Number.isFinite(form.costAmount) ||
                                form.costAmount < 0)
                            ? inputCopy.cost
                            : undefined
                    }
                  >
                    <input
                      required
                      type="number"
                      min={min}
                      step={increment}
                      value={form[key]}
                      onChange={(event) =>
                        setForm({
                          ...form,

                          [key]: Number(event.target.value),
                        })
                      }
                    />
                  </Field>
                ))}
              </div>

              <div>
                <p>
                  {l.classMinimumEnrollment}:{" "}
                  <strong>{memberCount(threshold)}</strong>
                </p>
              </div>

              {threshold > form.capacity && (
                <p role="alert">{m.thresholdExceeded}</p>
              )}

              {capacityInvalid && <p role="alert">{m.capacityExceeded}</p>}
            </>
          )}

          {/* -------------------------------------------
              STEP 4 - REVIEW
          ------------------------------------------- */}

          {step === 3 && (
            <>
              <dl className={styles.summary}>
                <div>
                  <dt>{l.name}</dt>

                  <dd>
                    {form.code} · {form.name}
                  </dd>
                </div>

                <div>
                  <dt>{t.classWorkspace.price}</dt>

                  <dd>{formatMoney(form.price)}</dd>
                </div>

                <div>
                  <dt>{l.duration}</dt>
                  <dd>{minutes}</dd>
                </div>

                <div>
                  <dt>{t.classWorkspace.cost}</dt>

                  <dd>{formatMoney(form.costAmount)}</dd>
                </div>

                <div>
                  <dt>{l.classMinimumEnrollment}</dt>

                  <dd>{memberCount(threshold)}</dd>
                </div>
              </dl>

              {/* Validate the current form before saving. */}
              <ScheduleReview
                course={schedule}
                minutes={minutes}
                roomName={room?.name}
              />

              <p>{m.draftHint}</p>
            </>
          )}
        </fieldset>

        <MutationFeedback mutation={mutation} />

        <div className="btn-row">
          {step > 0 && (
            <button
              type="button"
              className={`btn btn--secondary ${editorStyles.arrowButton}`}
              aria-label={l.previous}
              data-direction="previous"
              title={l.previous}
              disabled={mutation.busy}
              onClick={() => setStep(step - 1)}
            >
              <ArrowLeft size={24} strokeWidth={2.25} aria-hidden="true" />
            </button>
          )}

          <button
            className={`btn ${step < 3 ? editorStyles.arrowButton : ""}`}
            aria-label={step === 3 ? m.saveDraft : l.next}
            data-direction={step < 3 ? "next" : undefined}
            title={step === 3 ? m.saveDraft : l.next}
            aria-describedby={step === 1 ? feedbackId : undefined}
            disabled={
              mutation.busy ||
              (step === 0 &&
                (codeStatus === "checking" || Boolean(codeError))) ||
              /*
               * Schedule step.
               */
              (step === 1 &&
                (!scheduleReady ||
                  !form.defaultRoomId ||
                  !minutes ||
                  slots.length !== form.numSessions)) ||
              /*
               * Pricing/review.
               */
              (step >= 2 && (!valid || catalog.loading || !scheduleReady))
            }
          >
            {step === 3 ? (
              m.saveDraft
            ) : (
              <ArrowRight size={24} strokeWidth={2.25} aria-hidden="true" />
            )}
          </button>

          <button
            type="button"
            className={`btn ${editorStyles.cancelButton}`}
            disabled={mutation.busy}
            onClick={onClose}
          >
            {l.cancel}
          </button>
        </div>
      </form>
    </Card>
  );
}
