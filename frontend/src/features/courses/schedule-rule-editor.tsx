"use client";
import { Field } from "@/components/ui";
import { Trash2 } from "lucide-react";
import { useOperatingHoursPopup } from "@/components/OperatingHoursPopup";
import { useLanguage } from "@/lib/language";
import { managerWorkspaceStyles as styles } from "@/features/manager";
export type ScheduleRule = { dayOfWeek: number; startTimeLocal: string };
export function ScheduleRuleEditor({
  value,
  onChange,
  minStart,
  maxStart,
  timeError,
  className = "",
  compact = false,
}: {
  value: ScheduleRule[];
  onChange: (value: ScheduleRule[]) => void;
  minStart?: string;
  maxStart?: string;
  timeError?: string;
  className?: string;
  compact?: boolean;
}) {
  const { t } = useLanguage();
  const l = t.operations;
  const notice = useOperatingHoursPopup();
  return (
    <fieldset
      className={`${styles.scheduleRules} ${className}`}
      data-compact={compact || undefined}
      aria-label={compact ? l.scheduleRules : undefined}
      onChangeCapture={(event) => {
        if (timeError) notice.checkTime(event, timeError);
      }}
      onInvalidCapture={(event) => {
        if (timeError) notice.checkTime(event, timeError);
      }}
    >
      {notice.popup}
      {!compact && <legend>{l.scheduleRules}</legend>}
      {value.map((r, i) => (
        <div className={styles.scheduleRule} key={i}>
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
          <Field label={l.start} required>
            <input
              required
              type="time"
              min={minStart}
              max={maxStart}
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
            aria-label={
              compact ? `${l.remove} ${l.weekdays[r.dayOfWeek]}` : undefined
            }
            title={
              compact ? `${l.remove} ${l.weekdays[r.dayOfWeek]}` : undefined
            }
            disabled={value.length <= 1}
            onClick={() => onChange(value.filter((_, j) => j !== i))}
          >
            {compact ? <Trash2 size={17} aria-hidden="true" /> : l.remove}
          </button>
        </div>
      ))}
      <button
        type="button"
        className="btn btn--secondary"
        disabled={value.length >= 14}
        onClick={() =>
          onChange([
            ...value,
            {
              dayOfWeek: 1,
              startTimeLocal: value[0]?.startTimeLocal || minStart || "",
            },
          ])
        }
      >
        {l.add}
      </button>
    </fieldset>
  );
}
