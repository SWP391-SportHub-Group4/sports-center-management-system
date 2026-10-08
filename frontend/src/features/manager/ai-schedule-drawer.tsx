"use client";
import { useState } from "react";
import Link from "next/link";
import { Drawer } from "@/components/primitives";
import { Field } from "@/components/ui";
import { SportSelector, RoomSelector } from "@/features/catalog";
import { CoachSelector } from "@/features/coaches";
import { useLanguage } from "@/lib/language";
import { todayIso } from "@/lib/format";
import { ApiGap } from "./api-gap";
import { useOperationsCopy } from "./operation-copy";

export interface SchedulePreferences {
  sportId: string;
  coachId: string;
  defaultRoomId: string;
  startDate: string;
  numSessions: number;
  scheduleRules: { dayOfWeek: number; startTimeLocal: string }[];
}

export function AiScheduleDrawer({
  onClose,
  initial,
  onManualReview,
}: {
  onClose: () => void;
  initial?: SchedulePreferences;
  onManualReview?: (preferences: SchedulePreferences) => void;
}) {
  const { t } = useLanguage();
  const l = t.managerOperations;
  const o = t.operations;
  const c = useOperationsCopy();
  const [form, setForm] = useState<SchedulePreferences>(
    initial ?? {
      sportId: "",
      coachId: "",
      defaultRoomId: "",
      startDate: todayIso(),
      numSessions: 12,
      scheduleRules: [
        {
          dayOfWeek: new Date(`${todayIso()}T12:00:00Z`).getUTCDay(),
          startTimeLocal: "18:00",
        },
      ],
    },
  );
  return (
    <Drawer title={l.aiTitle} description={l.aiWorkflow} onClose={onClose}>
      <ApiGap code="G03" message={l.aiGap} />
      <p id="ai-unavailable">{c.aiBlocked}</p>
      <form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault();
          if (onManualReview) {
            onManualReview(form);
            onClose();
          }
        }}
      >
        <fieldset>
          <legend>{c.preferences}</legend>
          <SportSelector
            groupOnly
            value={form.sportId}
            onChange={(sportId) =>
              setForm({ ...form, sportId, coachId: "", defaultRoomId: "" })
            }
          />
          <div className="form-grid">
            <CoachSelector
              sportId={Number(form.sportId)}
              value={form.coachId}
              onChange={(coachId) => setForm({ ...form, coachId })}
            />
            <RoomSelector
              sportId={Number(form.sportId)}
              value={form.defaultRoomId}
              onChange={(defaultRoomId) => setForm({ ...form, defaultRoomId })}
            />
            <Field label={o.startDate}>
              <input
                required
                type="date"
                value={form.startDate}
                onChange={(e) =>
                  setForm({ ...form, startDate: e.target.value })
                }
              />
            </Field>
            <Field label={o.numSessions}>
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
          <fieldset>
            <legend>{o.day}</legend>
            <div className="btn-row">
              {o.weekdays.map((day, dayOfWeek) => (
                <label key={dayOfWeek}>
                  <input
                    type="checkbox"
                    checked={form.scheduleRules.some(
                      (r) => r.dayOfWeek === dayOfWeek,
                    )}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        scheduleRules: e.target.checked
                          ? [
                              ...form.scheduleRules,
                              {
                                dayOfWeek,
                                startTimeLocal:
                                  form.scheduleRules[0]?.startTimeLocal ||
                                  "18:00",
                              },
                            ]
                          : form.scheduleRules.filter(
                              (r) => r.dayOfWeek !== dayOfWeek,
                            ),
                      })
                    }
                  />{" "}
                  {day}
                </label>
              ))}
            </div>
          </fieldset>
          <Field label={c.weeklyTime}>
            <input
              required
              type="time"
              value={form.scheduleRules[0]?.startTimeLocal || "18:00"}
              onChange={(e) =>
                setForm({
                  ...form,
                  scheduleRules: form.scheduleRules.map((r) => ({
                    ...r,
                    startTimeLocal: e.target.value,
                  })),
                })
              }
            />
          </Field>
        </fieldset>
        <button
          type="button"
          className="btn"
          disabled
          aria-describedby="ai-unavailable"
        >
          {c.generate}
        </button>
        <section className="stack">
          <h3>{c.currentInputs}</h3>
          <p>{c.manualHint}</p>
          <p>
            {o.startDate}: {form.startDate || "—"} · {o.numSessions}:{" "}
            {form.numSessions}
          </p>
          <ul>
            {form.scheduleRules.map((r) => (
              <li key={r.dayOfWeek}>
                {o.weekdays[r.dayOfWeek]} · {r.startTimeLocal}
              </li>
            ))}
          </ul>
          {onManualReview ? (
            <button
              className="btn btn--secondary"
              disabled={
                !form.sportId ||
                !form.defaultRoomId ||
                !form.scheduleRules.length
              }
            >
              {c.manualReview}
            </button>
          ) : (
            <Link
              className="btn btn--secondary"
              href="/manager/classes/new"
              onClick={onClose}
            >
              {c.manualCreate}
            </Link>
          )}
        </section>
      </form>
      <p>{l.draftHint}</p>
    </Drawer>
  );
}
