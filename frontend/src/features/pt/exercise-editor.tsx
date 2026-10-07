"use client";
import { Field } from "@/components/ui";
import { useLanguage } from "@/lib/language";
export interface ExerciseDraft {
  exercise: string;
  sets: number;
  reps: number;
  notes: string | null;
}
export const emptyExercise = (): ExerciseDraft => ({
  exercise: "",
  sets: 3,
  reps: 12,
  notes: "",
});
export function ExerciseEditor({
  items,
  onChange,
}: {
  items: ExerciseDraft[];
  onChange: (items: ExerciseDraft[]) => void;
}) {
  const { t } = useLanguage();
  const l = t.staffWork;
  const update = (i: number, patch: Partial<ExerciseDraft>) =>
    onChange(items.map((item, j) => (i === j ? { ...item, ...patch } : item)));
  return (
    <div className="stack">
      {items.map((item, i) => (
        <fieldset key={i}>
          <legend>
            {l.exercise} {i + 1}
          </legend>
          <Field label={l.exercise}>
            <input
              required
              maxLength={200}
              value={item.exercise}
              onChange={(e) => update(i, { exercise: e.target.value })}
            />
          </Field>
          <div className="form-grid">
            <Field label={l.sets}>
              <input
                type="number"
                required
                min={1}
                max={50}
                step={1}
                value={item.sets}
                onChange={(e) => update(i, { sets: Number(e.target.value) })}
              />
            </Field>
            <Field label={l.reps}>
              <input
                type="number"
                required
                min={1}
                max={500}
                step={1}
                value={item.reps}
                onChange={(e) => update(i, { reps: Number(e.target.value) })}
              />
            </Field>
          </div>
          <Field label={l.note}>
            <input
              maxLength={500}
              value={item.notes ?? ""}
              onChange={(e) => update(i, { notes: e.target.value })}
            />
          </Field>
          <button
            type="button"
            className="btn btn--ghost"
            disabled={items.length === 1}
            onClick={() => onChange(items.filter((_, j) => i !== j))}
          >
            {l.remove}
          </button>
        </fieldset>
      ))}
      <button
        type="button"
        className="btn btn--secondary"
        onClick={() => onChange([...items, emptyExercise()])}
      >
        {l.addExercise}
      </button>
    </div>
  );
}
