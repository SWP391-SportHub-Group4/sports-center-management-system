"use client";

import { useState } from "react";

import { AsyncSection, Card, Field, StatusChip } from "@/components/ui";

import { api } from "@/lib/apiClient";

import { useApi } from "@/lib/useApi";

import { useLanguage } from "@/lib/language";

import { formatDateTime } from "@/lib/format";

import { vietnamUtc, vietnamLocal } from "@/lib/vietnam-time";

import { MutationFeedback, useMutation } from "@/features/operations";

import type { HomeworkDto } from "@/lib/types";

import { ptApi } from "./api";

import { ListPager } from "./ui";

import { PtMemberSelect } from "./member-select";

import {
  ExerciseEditor,
  emptyExercise,
  type ExerciseDraft,
} from "./exercise-editor";

export function HomeworkEditor({
  homework,
  onSaved,
  initialMemberId = "",
}: {
  homework?: HomeworkDto;
  onSaved: () => void;
  initialMemberId?: string;
}) {
  const { t } = useLanguage();

  const l = t.staffWork;

  const mutation = useMutation();

  const [member, setMember] = useState(homework?.memberId ?? initialMemberId);

  const [title, setTitle] = useState(homework?.title ?? "");

  const [note, setNote] = useState(homework?.coachNote ?? "");

  const [due, setDue] = useState(homework ? vietnamLocal(homework.dueAt) : "");

  const [items, setItems] = useState<ExerciseDraft[]>(
    homework?.items ?? [emptyExercise()],
  );

  return (
    <form
      className="form"
      onSubmit={async (e) => {
        e.preventDefault();

        const body = {
          memberId: member,

          title: title.trim(),

          coachNote: note.trim() || null,

          dueAt: vietnamUtc(due),

          items: items.map(({ exercise, sets, reps, notes }) => ({
            exercise: exercise.trim(),
            sets,
            reps,
            notes,
          })),

          version: homework?.version,
        };

        const ok = await mutation.run(() =>
          homework
            ? api.put(`/api/coaches/me/homework/${homework.assignmentId}`, body)
            : api.post("/api/coaches/me/homework", body),
        );

        if (ok) {
          onSaved();
        }
      }}
    >
      {homework ? (
        <p>{homework.memberName}</p>
      ) : (
        <PtMemberSelect value={member} onChange={setMember} />
      )}

      <Field label={l.title}>
        <input
          required
          maxLength={200}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
      </Field>

      <Field label={l.due}>
        <input
          type="datetime-local"
          required
          value={due}
          onChange={(e) => setDue(e.target.value)}
        />
      </Field>

      <Field label={l.note}>
        <textarea
          maxLength={2000}
          value={note}
          onChange={(e) => setNote(e.target.value)}
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

function HomeworkCard({
  homework,
  reload,
}: {
  homework: HomeworkDto;
  reload: () => void;
}) {
  const { t } = useLanguage();

  const l = t.staffWork;

  const [editing, setEditing] = useState(false);

  const mutation = useMutation();

  async function action(name: string) {
    const ok = await mutation.run(() =>
      api.post(
        `/api/coaches/me/homework/${homework.assignmentId}/${name}`,
        name === "review"
          ? {
              version: homework.version,
            }
          : undefined,
      ),
    );

    if (ok) {
      reload();
    }
  }

  return (
    <Card title={`${homework.title} · ${homework.memberName}`}>
      <p>
        {formatDateTime(homework.dueAt)}
        {" · "}
        <StatusChip value={homework.status} />
      </p>

      {homework.coachNote && <p>{homework.coachNote}</p>}

      {homework.memberFeedback && <p>{homework.memberFeedback}</p>}

      <ul>
        {homework.items.map((item) => (
          <li key={item.itemId}>
            {item.exercise}
            {" · "}
            {item.sets}
            {" × "}
            {item.reps}
            {" · "}
            {item.notes || "—"}
          </li>
        ))}
      </ul>

      <div className="btn-row">
        {["ASSIGNED", "IN_PROGRESS"].includes(homework.status) && (
          <>
            <button
              type="button"
              className="btn btn--secondary"
              onClick={() => setEditing(!editing)}
            >
              {l.edit}
            </button>

            <button
              type="button"
              className="btn btn--danger"
              disabled={mutation.busy}
              onClick={() => action("cancel")}
            >
              {l.cancel}
            </button>
          </>
        )}

        {homework.status === "COMPLETED" && (
          <button
            type="button"
            className="btn"
            disabled={mutation.busy}
            onClick={() => action("review")}
          >
            {l.review}
          </button>
        )}
      </div>

      <MutationFeedback mutation={mutation} />

      {editing && <HomeworkEditor homework={homework} onSaved={reload} />}
    </Card>
  );
}

export function CoachHomework({
  initialMemberId = "",
}: {
  initialMemberId?: string;
}) {
  const { t } = useLanguage();

  const [page, setPage] = useState(1);

  const [revision, setRevision] = useState(0);

  const state = useApi(
    (signal) => ptApi.homework(page, signal, initialMemberId || undefined),
    [page, revision, initialMemberId],
  );

  const reload = () => setRevision((value) => value + 1);

  return (
    <>
      <Card title={t.staffWork.assignHomework}>
        <HomeworkEditor
          key={`${revision}-${initialMemberId}`}
          initialMemberId={initialMemberId}
          onSaved={reload}
        />
      </Card>

      <AsyncSection
        state={state}
        isEmpty={(rows) => !rows.length}
        emptyMessage={t.common.noData}
      >
        {(rows) => (
          <>
            {rows.map((homework) => (
              <HomeworkCard
                key={`${homework.assignmentId}-${homework.version}`}
                homework={homework}
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
