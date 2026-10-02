"use client";
import { useState } from "react";
import { api } from "@/lib/apiClient";
import { useLanguage } from "@/lib/language";
import { todayIso } from "@/lib/format";
import { Card, Field } from "@/components/ui";
import { MutationFeedback, useMutation } from "@/features/operations";
import { SportSelector } from "@/features/catalog";
import { RoomSelector } from "@/features/catalog";
import { CoachSelector } from "@/features/coaches";
import { ScheduleRuleEditor } from "./schedule-rule-editor";
import type { ManagerCourseDto } from "@/lib/types";
export function CourseEditor({
  course,
  onSaved,
  onClose,
}: {
  course?: ManagerCourseDto;
  onSaved: () => void;
  onClose: () => void;
}) {
  const { t } = useLanguage();
  const l = t.operations;
  const mutation = useMutation();
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
  return (
    <Card title={course ? l.edit : l.create}>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (!form.sportId || !form.defaultRoomId) return;
          const body = {
            ...form,
            sportId: Number(form.sportId),
            defaultRoomId: Number(form.defaultRoomId),
            coachId: form.coachId || null,
          };
          if (
            await mutation.run(() =>
              course
                ? api.put(`/api/manager/classes/${course.classId}`, body)
                : api.post("/api/manager/classes", body),
            )
          )
            onSaved();
        }}
      >
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
          <Field label={l.startDate}>
            <input
              required
              type="date"
              value={form.startDate}
              onChange={(e) => setForm({ ...form, startDate: e.target.value })}
            />
          </Field>
          {(
            [
              ["numSessions", l.numSessions, 1, 1],
              ["capacity", l.capacity, 1, 1],
              ["price", l.price, 1000, 1000],
              ["costAmount", l.cost, 0, 1],
            ] as const
          ).map(([key, label, min, step]) => (
            <Field key={key} label={label}>
              <input
                required
                type="number"
                min={min}
                step={step}
                max={key === "numSessions" ? 100 : undefined}
                value={form[key]}
                onChange={(e) =>
                  setForm({ ...form, [key]: Number(e.target.value) })
                }
              />
            </Field>
          ))}
        </div>
        <ScheduleRuleEditor
          value={form.scheduleRules}
          onChange={(scheduleRules) => setForm({ ...form, scheduleRules })}
        />
        <p>
          {l.threshold}:{" "}
          {form.price > 0 ? Math.ceil(form.costAmount / form.price) : "—"}
        </p>
        <div className="btn-row">
          <button
            className="btn"
            disabled={mutation.busy || !form.defaultRoomId || !form.sportId}
          >
            {l.save}
          </button>
          <button
            type="button"
            className="btn btn--secondary"
            disabled={mutation.busy}
            onClick={onClose}
          >
            {l.close}
          </button>
        </div>
      </form>
      <MutationFeedback mutation={mutation} />
    </Card>
  );
}
