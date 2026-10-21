"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { api } from "@/lib/apiClient";
import { useAuth } from "@/lib/auth";
import { useApi } from "@/lib/useApi";
import { useLanguage } from "@/lib/language";
import { todayIso, formatMoney } from "@/lib/format";
import { Card, Field, AsyncSection } from "@/components/ui";
import { MutationFeedback, useMutation } from "@/features/operations";
import { SportSelector, RoomSelector, catalogApi } from "@/features/catalog";
import { CoachSelector } from "@/features/coaches";
import { ScheduleRuleEditor } from "./schedule-rule-editor";
import { ScheduleReview } from "./schedule-review";
import { previewSessions } from "./preview";
import { ClassWeekSchedule } from "./class-week-schedule";
import { managerWorkspaceStyles as styles } from "@/features/manager";
import type { ManagerCourseDto } from "@/lib/types";
import editorStyles from "./course-editor.module.css";

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

  const { user } = useAuth();

  const mutation = useMutation();

  const formRef = useRef<HTMLFormElement>(null);

  const saved = useRef(false);

  const [step, setStep] = useState(0);

  const [hydrated, setHydrated] = useState(false);

  const [recovered, setRecovered] = useState(false);

  const [form, setForm] = useState({
    code: course?.code ?? "",

    name: course?.name ?? "",

    sportId: String(course?.sportId ?? ""),
    continuationOfClassId: String(course?.continuationOfClassId ?? ""),

    coachId: course?.coachId ?? "",

    defaultRoomId: String(course?.defaultRoomId ?? ""),

    startDate: course?.startDate ?? todayIso(),

    numSessions: course?.numSessions ?? 12,

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
          Object.keys(form).every((key) => key in draft) &&
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

          setForm(draft as typeof form);

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
    const [sports, rooms] = await Promise.all([
      catalogApi.sports(signal, true),

      catalogApi.rooms(signal),
    ]);

    return {
      sports,
      rooms,
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

  const minutes = service?.defaultSessionMinutes ?? 0;

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

    sportId: Number(form.sportId),

    defaultRoomId: Number(form.defaultRoomId),
    continuationOfClassId: form.continuationOfClassId
      ? Number(form.continuationOfClassId)
      : null,

    coachId: form.coachId || null,
  };

  /*
   * Local preview is still useful
   * for validating the form itself.
   */
  const slots = previewSessions(schedule, minutes);

  const valid =
    form.code.trim().length >= 2 &&
    form.name.trim().length > 0 &&
    !!form.sportId &&
    !!form.defaultRoomId &&
    form.price >= 1000 &&
    form.price % 1000 === 0 &&
    form.costAmount >= 0 &&
    Number.isInteger(form.capacity) &&
    form.capacity >= 1 &&
    !capacityInvalid &&
    threshold <= form.capacity &&
    slots.length === form.numSessions;

  function next() {
    if (!formRef.current?.reportValidity()) {
      return;
    }

    if (step === 1 && (!minutes || slots.length !== form.numSessions)) {
      return;
    }

    if (step === 2 && !valid) {
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

          if (!valid) {
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
              result = await (course
                ? api.put<ManagerCourseDto>(
                    `/api/manager/classes/${course.classId}`,
                    body,
                  )
                : api.post<ManagerCourseDto>("/api/manager/classes", body));
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
              <Field label={l.code}>
                <input
                  required
                  minLength={2}
                  maxLength={50}
                  value={form.code}
                  onChange={(event) =>
                    setForm({
                      ...form,

                      code: event.target.value,
                    })
                  }
                />
              </Field>

              <Field label={l.name}>
                <input
                  required
                  maxLength={150}
                  pattern=".*\S.*"
                  value={form.name}
                  onChange={(event) =>
                    setForm({
                      ...form,

                      name: event.target.value,
                    })
                  }
                />
              </Field>

              <SportSelector
                groupOnly
                value={form.sportId}
                onChange={(sportId) =>
                  setForm({
                    ...form,

                    sportId,

                    /*
                     * Sport change
                     * invalidates
                     * coach/room
                     * selection.
                     */
                    continuationOfClassId: "",
                    coachId: "",

                    defaultRoomId: "",
                  })
                }
              />
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
                  sportId={Number(form.sportId)}
                  value={form.defaultRoomId}
                  onChange={(defaultRoomId) =>
                    setForm({
                      ...form,

                      defaultRoomId,
                    })
                  }
                />

                <Field label={l.startDate}>
                  <input
                    required
                    type="date"
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
                value={form.scheduleRules}
                onChange={(scheduleRules) =>
                  setForm({
                    ...form,

                    scheduleRules,
                  })
                }
              />

              <AsyncSection state={catalog}>
                {() => (
                  <>
                    {!minutes && <p role="alert">{m.missingDuration}</p>}

                    {minutes > 0 && slots.length !== form.numSessions && (
                      <p role="alert">{l.invalidSchedule}</p>
                    )}
                  </>
                )}
              </AsyncSection>

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
                  <Field key={key} label={label}>
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
                showRefresh={!!course}
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
            disabled={
              mutation.busy ||
              /*
               * Schedule step.
               */
              (step === 1 &&
                (!form.defaultRoomId ||
                  !minutes ||
                  slots.length !== form.numSessions)) ||
              /*
               * Pricing/review.
               */
              (step >= 2 && (!valid || catalog.loading))
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
