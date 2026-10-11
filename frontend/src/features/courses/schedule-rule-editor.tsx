"use client";
import { Field } from "@/components/ui";
import { useLanguage } from "@/lib/language";
export type ScheduleRule = { dayOfWeek: number; startTimeLocal: string };
export function ScheduleRuleEditor({
  value,
  onChange,
}: {
  value: ScheduleRule[];
  onChange: (value: ScheduleRule[]) => void;
}) {
  const { t } = useLanguage();
  const l = t.operations;
  return (
    <fieldset>
      <legend>{l.scheduleRules}</legend>
      {value.map((r, i) => (
        <div className="form-grid" key={i}>
          <Field label={l.day}>
            <select
              value={r.dayOfWeek}
              onChange={(e) =>
                onChange(
                  value.map((r, j) =>
                    j === i ? { ...r, dayOfWeek: Number(e.target.value) } : r,
                  ),
                )
              }
            >
              {l.weekdays.map((d, n) => (
                <option key={n} value={n}>
                  {d}
                </option>
              ))}
            </select>
          </Field>
          <Field label={l.start}>
            <input
              required
              type="time"
              value={r.startTimeLocal}
              onChange={(e) =>
                onChange(
                  value.map((r, j) =>
                    j === i ? { ...r, startTimeLocal: e.target.value } : r,
                  ),
                )
              }
            />
          </Field>
          <button
            type="button"
            className="btn btn--ghost"
            disabled={value.length <= 1}
            onClick={() => onChange(value.filter((_, j) => j !== i))}
          >
            {l.remove}
          </button>
        </div>
      ))}
      <button
        type="button"
        className="btn btn--secondary"
        disabled={value.length >= 14}
        onClick={() =>
          onChange([...value, { dayOfWeek: 1, startTimeLocal: "18:00" }])
        }
      >
        {l.add}
      </button>
    </fieldset>
  );
}
