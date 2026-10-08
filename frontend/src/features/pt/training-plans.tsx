"use client";

import { useState } from "react";

import { AsyncSection, Card, Field, StatusChip } from "@/components/ui";

import { api } from "@/lib/apiClient";

import { useApi } from "@/lib/useApi";

import { useLanguage } from "@/lib/language";

import { MutationFeedback, useMutation } from "@/features/operations";

import type { WorkoutPlanDto } from "@/lib/types";

import { ptApi } from "./api";

import { ListPager } from "./ui";

import { PtMemberSelect } from "./member-select";

import {
  ExerciseEditor,
  emptyExercise,
  type ExerciseDraft,
} from "./exercise-editor";

function PlanEditor({
  plan,
  reload,
  initialMemberId = "",
}: {
  plan?: WorkoutPlanDto;
  reload: () => void;
  initialMemberId?: string;
}) {
  const { t } = useLanguage();

  const l = t.staffWork;

  const mutation = useMutation();

  const [member, setMember] = useState(plan?.memberId ?? initialMemberId);

  const [goal, setGoal] = useState(plan?.goal ?? "");

  const [level, setLevel] = useState(plan?.level ?? "Beginner");

  const [items, setItems] = useState<ExerciseDraft[]>(
    plan?.items ?? [emptyExercise()],
  );

  return (
    <form
      className="form"
      onSubmit={async (e) => {
        e.preventDefault();

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
        <PtMemberSelect value={member} onChange={setMember} />
      )}

      <Field label={l.goal}>
        <input
          required
          minLength={3}
          maxLength={500}
          value={goal}
          onChange={(e) => setGoal(e.target.value)}
        />
      </Field>

      <Field label={l.level}>
        <input
          required
          maxLength={50}
          value={level}
          onChange={(e) => setLevel(e.target.value)}
        />
      </Field>

      <ExerciseEditor items={items} onChange={setItems} />

      <MutationFeedback mutation={mutation} />

      <button type="submit" className="btn" disabled={mutation.busy || !member}>
        {l.save}
      </button>
    </form>
  );
}

function PlanCard({
  plan,
  reload,
}: {
  plan: WorkoutPlanDto;
  reload: () => void;
}) {
  const { t } = useLanguage();

  const l = t.staffWork;

  const [editing, setEditing] = useState(false);

  const mutation = useMutation();

  async function transition(action: string) {
    const ok = await mutation.run(() =>
      api.post(`/api/workout-plans/${plan.planId}/${action}`),
    );

    if (ok) {
      reload();
    }
  }

  return (
    <Card title={`${plan.memberName} · ${plan.goal}`}>
      <p>
        <StatusChip value={plan.status} /> · {plan.level}
      </p>

      <ul>
        {plan.items.map((item) => (
          <li key={item.itemId}>
            {item.exercise} · {item.sets} × {item.reps} · {item.notes || "—"}
          </li>
        ))}
      </ul>

      <div className="btn-row">
        <button
          type="button"
          className="btn btn--secondary"
          onClick={() => setEditing(!editing)}
        >
          {l.edit}
        </button>

        <button
          type="button"
          className="btn btn--secondary"
          disabled={mutation.busy || plan.status === "ACTIVE"}
          onClick={() => transition("activate")}
        >
          {l.activate}
        </button>

        <button
          type="button"
          className="btn btn--secondary"
          disabled={mutation.busy || plan.status === "ARCHIVED"}
          onClick={() => transition("archive")}
        >
          {l.archive}
        </button>
      </div>

      <MutationFeedback mutation={mutation} />

      {editing && <PlanEditor plan={plan} reload={reload} />}
    </Card>
  );
}

export function TrainingPlans({
  initialMemberId = "",
}: {
  initialMemberId?: string;
}) {
  const { t } = useLanguage();

  const [page, setPage] = useState(1);

  const [revision, setRevision] = useState(0);

  const state = useApi(
    (signal) => ptApi.plans(page, signal, initialMemberId || undefined),
    [page, revision, initialMemberId],
  );

  const reload = () => setRevision((value) => value + 1);

  return (
    <>
      <Card title={t.staffWork.newPlan}>
        <PlanEditor
          key={`${revision}-${initialMemberId}`}
          initialMemberId={initialMemberId}
          reload={reload}
        />
      </Card>

      <AsyncSection
        state={state}
        isEmpty={(rows) => !rows.length}
        emptyMessage={t.common.noData}
      >
        {(rows) => (
          <>
            {rows.map((plan) => (
              <PlanCard
                key={`${plan.planId}-${plan.version}`}
                plan={plan}
                reload={reload}
              />
            ))}

            <ListPager page={page} count={rows.length} onChange={setPage} />
          </>
        )}
      </AsyncSection>
    </>
  );
}
