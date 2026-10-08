"use client";
import { useEffect, useRef, useState } from "react";
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
import { AiScheduleDrawer } from "@/features/manager";
import { managerWorkspaceStyles as styles } from "@/features/manager";
import type { ManagerCourseDto } from "@/lib/types";

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
  const [ai, setAi] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [recovered, setRecovered] = useState(false);
  const [form, setForm] = useState({
    code: course?.code ?? "",
    name: course?.name ?? "",
    sportId: String(course?.sportId ?? ""),
    coachId: course?.coachId ?? "",
    defaultRoomId: String(course?.defaultRoomId ?? ""),
    startDate: course?.startDate ?? todayIso(),
    numSessions: course?.numSessions ?? 12,
    capacity: course?.capacity ?? 12,
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
            (r) =>
              r &&
              Number.isInteger(r.dayOfWeek) &&
              typeof r.startTimeLocal === "string",
          )
        ) {
          // Restore a per-account, versioned browser draft once after mounting.
          /* eslint-disable react-hooks/set-state-in-effect */
          setForm(draft as typeof form);
          setRecovered(true);
          /* eslint-enable react-hooks/set-state-in-effect */
        }
      }
    } catch {
      /* Storage can be unavailable; the form remains usable. */
    }
    setHydrated(true);
    // The editor is keyed by class/version by its caller; never restore over edits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);
  useEffect(() => {
    if (hydrated && !saved.current) {
      try {
        sessionStorage.setItem(storageKey, JSON.stringify(form));
      } catch {
        /* Optional recovery. */
      }
    }
  }, [form, hydrated, storageKey]);
  const catalog = useApi(async (signal) => {
    const [sports, rooms] = await Promise.all([
      catalogApi.sports(signal, true),
      catalogApi.rooms(signal),
    ]);
    return { sports, rooms };
  }, []);
  const service = catalog.data?.sports
    .find((s) => s.sportId === Number(form.sportId))
    ?.services.find((s) => s.serviceType === "GROUP_COURSE" && s.isEnabled);
  const room = catalog.data?.rooms.find(
    (r) => r.roomId === Number(form.defaultRoomId),
  );
  const minutes = service?.defaultSessionMinutes ?? 0;
  const threshold =
    form.price > 0 ? Math.ceil(form.costAmount / form.price) : 0;
  const capacityInvalid =
    (!!room && form.capacity > room.capacity) ||
    (!!service?.defaultMaxCapacity &&
      form.capacity > service.defaultMaxCapacity);
  const schedule = {
    ...form,
    sportId: Number(form.sportId),
    defaultRoomId: Number(form.defaultRoomId),
    coachId: form.coachId || null,
  };
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
    if (!formRef.current?.reportValidity()) return;
    if (step === 1 && (!minutes || slots.length !== form.numSessions)) return;
    if (step === 2 && !valid) return;
    setStep(step + 1);
  }
  return (
    <Card title={course ? l.edit : l.create}>
      <ol className={styles.steps}>
        {[m.contentStep, m.scheduleStep, m.pricingStep, m.reviewStep].map(
          (label, i) => (
            <li key={label} aria-current={step === i ? "step" : undefined}>
              {i + 1}. {label}
            </li>
          ),
        )}
      </ol>
      {recovered && <p role="status">{m.draftRecovered}</p>}
      <form
        ref={formRef}
        className="stack"
        onSubmit={async (e) => {
          e.preventDefault();
          if (step < 3) {
            next();
            return;
          }
          if (!valid) return;
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
            } catch {}
            onSaved(result);
          }
        }}
      >
        <fieldset disabled={mutation.busy} className={styles.section}>
          {step === 0 && (
            <div className="form-grid">
              <Field label={l.code}>
                <input
                  required
                  minLength={2}
                  maxLength={50}
                  value={form.code}
                  onChange={(e) => setForm({ ...form, code: e.target.value })}
                />
              </Field>
              <Field label={l.name}>
                <input
                  required
                  maxLength={150}
                  pattern=".*\S.*"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </Field>
              <SportSelector
                groupOnly
                value={form.sportId}
                onChange={(sportId) =>
                  setForm({ ...form, sportId, coachId: "", defaultRoomId: "" })
                }
              />
            </div>
          )}
          {step === 1 && (
            <>
              <div className="form-grid">
                <CoachSelector
                  sportId={Number(form.sportId)}
                  value={form.coachId}
                  onChange={(coachId) => setForm({ ...form, coachId })}
                />
                <RoomSelector
                  sportId={Number(form.sportId)}
                  value={form.defaultRoomId}
                  onChange={(defaultRoomId) =>
                    setForm({ ...form, defaultRoomId })
                  }
                />
                <Field label={l.startDate}>
                  <input
                    required
                    type="date"
                    value={form.startDate}
                    onChange={(e) =>
                      setForm({ ...form, startDate: e.target.value })
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
                    onChange={(e) =>
                      setForm({ ...form, numSessions: Number(e.target.value) })
                    }
                  />
                </Field>
              </div>
              <ScheduleRuleEditor
                value={form.scheduleRules}
                onChange={(scheduleRules) =>
                  setForm({ ...form, scheduleRules })
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
              <button
                type="button"
                className="btn btn--secondary"
                onClick={() => setAi(true)}
              >
                {m.aiTitle}
              </button>
            </>
          )}
          {step === 2 && (
            <>
              <div className="form-grid">
                {(
                  [
                    ["capacity", l.capacity, 1, 1],
                    ["price", l.price, 1000, 1000],
                    ["costAmount", l.cost, 0, 1],
                  ] as const
                ).map(([key, label, min, increment]) => (
                  <Field key={key} label={label}>
                    <input
                      required
                      type="number"
                      min={min}
                      step={increment}
                      value={form[key]}
                      onChange={(e) =>
                        setForm({ ...form, [key]: Number(e.target.value) })
                      }
                    />
                  </Field>
                ))}
              </div>
              <p>
                {l.threshold}: {threshold} / {form.capacity}
              </p>
              {threshold > form.capacity && (
                <p role="alert">{m.thresholdExceeded}</p>
              )}
              {capacityInvalid && <p role="alert">{m.capacityExceeded}</p>}
            </>
          )}
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
                  <dt>{l.price}</dt>
                  <dd>{formatMoney(form.price)}</dd>
                </div>
                <div>
                  <dt>{l.cost}</dt>
                  <dd>{formatMoney(form.costAmount)}</dd>
                </div>
                <div>
                  <dt>{l.threshold}</dt>
                  <dd>
                    {threshold} / {form.capacity}
                  </dd>
                </div>
              </dl>
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
              className="btn btn--secondary"
              disabled={mutation.busy}
              onClick={() => setStep(step - 1)}
            >
              {l.previous}
            </button>
          )}
          <button
            className="btn"
            disabled={
              mutation.busy ||
              (step === 1 &&
                (!form.defaultRoomId ||
                  !minutes ||
                  slots.length !== form.numSessions)) ||
              (step >= 2 && (!valid || catalog.loading))
            }
          >
            {step === 3 ? m.saveDraft : l.next}
          </button>
          <button
            type="button"
            className="btn btn--ghost"
            disabled={mutation.busy}
            onClick={onClose}
          >
            {l.close}
          </button>
        </div>
      </form>
      {ai && (
        <AiScheduleDrawer
          initial={form}
          onClose={() => setAi(false)}
          onManualReview={(preferences) => {
            setForm((current) => ({ ...current, ...preferences }));
            setStep(1);
            mutation.reset();
          }}
        />
      )}
    </Card>
  );
}
