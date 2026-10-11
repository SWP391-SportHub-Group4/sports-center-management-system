"use client";

import { useState } from "react";

import { Field } from "@/components/ui";

import { api } from "@/lib/apiClient";

import { useLanguage } from "@/lib/language";

import { MutationFeedback, useMutation } from "@/features/operations";

import type { WorkoutPlanDto } from "@/lib/types";

import { IconSparkles } from "@/components/icons";

import { PtMemberSelect } from "./member-select";

import {
  ExerciseEditor,
  emptyExercise,
  type ExerciseDraft,
} from "./exercise-editor";

import { CoachAiDrawer } from "./coach-ai-drawer";

export function PlanEditor({
  plan,
  reload,
  initialMemberId = "",
  onCancel,
}: {
  plan?: WorkoutPlanDto;
  reload: () => void;
  initialMemberId?: string;
  onCancel?: () => void;
}) {
  const { t, language } = useLanguage();

  const isEn = language === "en";

  const l = t.staffWork;

  const mutation = useMutation();

  const [member, setMember] = useState(plan?.memberId ?? initialMemberId);

  const [goal, setGoal] = useState(plan?.goal ?? "");

  const [level, setLevel] = useState(plan?.level ?? "Beginner");

  const [items, setItems] = useState<ExerciseDraft[]>(
    plan?.items ?? [emptyExercise()],
  );

  const [aiOpen, setAiOpen] = useState(false);

  return (
    <>
      <form
        className="form"
        onSubmit={async (event) => {
          event.preventDefault();

          const body = {
            memberId: member,

            goal: goal.trim(),

            level,

            items: items.map(({ exercise, sets, reps, notes }) => ({
              exercise: exercise.trim(),

              sets,

              reps,

              notes,
            })),

            version: plan?.version,
          };

          const ok = await mutation.run(() =>
            plan
              ? api.put(`/api/workout-plans/${plan.planId}`, body)
              : api.post("/api/workout-plans", body),
          );

          if (ok) {
            reload();
          }
        }}
      >
        {plan ? (
          <p>{plan.memberName}</p>
        ) : (
          <>
            {initialMemberId ? (
              <p className="muted">
                {isEn
                  ? "This plan is for the selected student."
                  : "Kế hoạch dành cho học viên đang xem."}
              </p>
            ) : (
              <PtMemberSelect value={member} onChange={setMember} />
            )}

            <button
              type="button"
              className="btn btn--secondary"
              disabled={!member}
              onClick={() => setAiOpen(true)}
            >
              <IconSparkles size={16} />{" "}
              {isEn ? "AI suggestion" : "AI gợi ý kế hoạch"}
            </button>

            {!member && (
              <p className="muted">
                {isEn
                  ? "Select an assigned member before requesting an AI suggestion."
                  : "Chọn hội viên phụ trách trước khi yêu cầu AI gợi ý."}
              </p>
            )}
          </>
        )}

        <Field label={l.goal}>
          <input
            required
            minLength={3}
            maxLength={500}
            value={goal}
            onChange={(event) => setGoal(event.target.value)}
          />
        </Field>

        <Field label={l.level}>
          <input
            required
            maxLength={50}
            value={level}
            onChange={(event) => setLevel(event.target.value)}
          />
        </Field>

        <ExerciseEditor items={items} onChange={setItems} />

        <MutationFeedback mutation={mutation} />

        <div className="btn-row">
          <button
            type="submit"
            className="btn"
            disabled={mutation.busy || !member}
          >
            {l.save}
          </button>
          {onCancel && (
            <button
              type="button"
              className="btn btn--secondary"
              disabled={mutation.busy}
              onClick={onCancel}
            >
              {isEn ? "Cancel" : "Hủy"}
            </button>
          )}
        </div>
      </form>

      {aiOpen && member && (
        <CoachAiDrawer
          memberId={member}
          onClose={() => setAiOpen(false)}
          onSaved={reload}
        />
      )}
    </>
  );
}
