"use client";
import { Field } from "@/components/ui";
import { useLanguage } from "@/lib/language";
import styles from "./incident-date-time.module.css";

const timePattern = "([01][0-9]|2[0-3]):[0-5][0-9]";
export function validIncidentDateTime(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d$/.test(value)) return false;
  const day = value.slice(0, 10);
  const date = new Date(`${day}T00:00:00Z`);
  return (
    !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === day
  );
}

export function IncidentDateTime({
  label,
  value,
  onChange,
  minDate,
  minTime,
  maxTime,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  minDate?: string;
  minTime?: string;
  maxTime?: string;
}) {
  const { t } = useLanguage();
  const [date = "", time = ""] = value.split("T");
  return (
    <fieldset className={styles.group}>
      <legend>{label}</legend>
      <div className={styles.inputs}>
        <Field
          label={t.operations.date}
          hint={
            minTime && maxTime
              ? t.incidentHistory.allowedHours
                  .replace("{open}", minTime)
                  .replace("{close}", maxTime)
              : undefined
          }
        >
          <input
            type="date"
            required
            value={date}
            min={minDate || undefined}
            max="9999-12-31"
            onChange={(event) => onChange(`${event.target.value}T${time}`)}
          />
        </Field>
        <Field label={t.incidentHistory.time24}>
          <input
            type="text"
            required
            inputMode="numeric"
            placeholder="HH:mm"
            maxLength={5}
            autoComplete="off"
            value={time}
            onChange={(event) => onChange(`${date}T${event.target.value}`)}
            onBlur={() => {
              const match = /^(\d{1,2}):?(\d{2})$/.exec(time);
              if (!match) return;
              const normalized = `${match[1].padStart(2, "0")}:${match[2]}`;
              if (
                new RegExp(`^${timePattern}$`).test(normalized) &&
                normalized !== time
              )
                onChange(`${date}T${normalized}`);
            }}
          />
        </Field>
      </div>
    </fieldset>
  );
}
