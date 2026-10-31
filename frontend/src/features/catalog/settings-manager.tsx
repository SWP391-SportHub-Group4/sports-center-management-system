"use client";

import { useId, useState } from "react";
import { api } from "@/lib/apiClient";
import { useApi } from "@/lib/useApi";
import { useLanguage } from "@/lib/language";
import { formatDateTime } from "@/lib/format";
import { AsyncSection, Field } from "@/components/ui";
import { MutationFeedback, useMutation } from "@/features/operations";
import type { SystemSettingDto } from "@/lib/types";
import type { Translations } from "@/locales/en";
import {
  centerOpeningKey,
  centerClosingKey,
  minutesToTime,
  timeToMinutes,
} from "@/lib/center-hours";
import styles from "./settings-manager.module.css";

type SettingField = {
  key: string;
  copy: keyof Translations["settingFields"];
  min: number;
  max: number;
  unit?: "seconds" | "minutes" | "hours" | "days";
};
const groups = [
  {
    id: "hours",
    fields: [
      { key: centerOpeningKey, copy: "centerOpeningTime", min: 0, max: 1439 },
      { key: centerClosingKey, copy: "centerClosingTime", min: 0, max: 1439 },
    ],
  },
  {
    id: "gym",
    fields: [
      {
        key: "gym.checkin_cooldown_seconds",
        copy: "gymCheckInCooldownSeconds",
        min: 1,
        max: 300,
        unit: "seconds",
      },
    ],
  },
  {
    id: "classes",
    fields: [
      {
        key: "class.threshold_days_before_start",
        copy: "thresholdDays",
        min: 3,
        max: 30,
        unit: "days",
      },
    ],
  },
  {
    id: "payment",
    fields: [
      {
        key: "hold.minutes",
        copy: "holdMinutes",
        min: 10,
        max: 30,
        unit: "minutes",
      },
      {
        key: "points.confirm_otp_minutes",
        copy: "otpMinutes",
        min: 1,
        max: 15,
        unit: "minutes",
      },
    ],
  },
  {
    id: "rental",
    fields: [
      {
        key: "rental.max_hours",
        copy: "maxHours",
        min: 1,
        max: 4,
        unit: "hours",
      },
    ],
  },
  {
    id: "membership",
    fields: [
      {
        key: "membership.expiry_notice_days",
        copy: "expiryDays",
        min: 1,
        max: 90,
        unit: "days",
      },
    ],
  },
  {
    id: "support",
    fields: [
      {
        key: "support.sla_hours",
        copy: "supportSlaHours",
        min: 1,
        max: 168,
        unit: "hours",
      },
      {
        key: "support.remind_cooldown_hours",
        copy: "supportRemindCooldownHours",
        min: 1,
        max: 168,
        unit: "hours",
      },
      {
        key: "support.payout_confirm_days",
        copy: "supportPayoutConfirmDays",
        min: 1,
        max: 30,
        unit: "days",
      },
    ],
  },
] satisfies {
  id: keyof Translations["settingsPage"]["groups"];
  fields: SettingField[];
}[];

export function SettingsManager() {
  const { t } = useLanguage();
  const state = useApi(
    (signal) => api.get<SystemSettingDto[]>("/api/system-settings", { signal }),
    [],
  );
  return (
    <div className={styles.page}>
      <p className={styles.intro}>{t.settingsPage.intro}</p>
      <AsyncSection state={state}>
        {(rows) => (
          <div className={styles.settings}>
            {groups.map((group) => (
              <SettingsGroup key={group.id} group={group} rows={rows} />
            ))}
          </div>
        )}
      </AsyncSection>
    </div>
  );
}

function SettingsGroup({
  group,
  rows,
}: {
  group: (typeof groups)[number];
  rows: SystemSettingDto[];
}) {
  const { t } = useLanguage();
  const copy = t.settingsPage;
  const headingId = useId();
  const [saved, setSaved] = useState(rows);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const mutation = useMutation();
  const fields: SettingField[] = group.fields;
  const currentValue = (key: string) =>
    saved.find((row) => row.key === key)?.value ?? "";
  const valueFor = (key: string) => drafts[key] ?? currentValue(key);
  const dirty = fields.some(({ key }) => valueFor(key) !== currentValue(key));
  const missing = fields.some(
    ({ key }) => !saved.some((row) => row.key === key),
  );
  const validValues = fields.every(({ key, min, max }) => {
    const value = valueFor(key);
    return (
      value.trim() !== "" &&
      Number.isInteger(Number(value)) &&
      Number(value) >= min &&
      Number(value) <= max
    );
  });
  const hoursInvalid =
    group.id === "hours" &&
    validValues &&
    Number(valueFor(centerOpeningKey)) >= Number(valueFor(centerClosingKey));
  const valid = !missing && validValues && !hoursInvalid;
  const updatedAt = saved
    .filter((row) => fields.some((field) => field.key === row.key))
    .map((row) => row.updatedAt)
    .sort()
    .at(-1);
  const title = copy.groups[group.id];
  return (
    <section className={styles.group} aria-labelledby={headingId}>
      <header className={styles.heading}>
        <h2 id={headingId}>{title.title}</h2>
        <p>{title.description}</p>
      </header>
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          if (!valid || !dirty) return;
          let result: SystemSettingDto[] = [];
          if (
            await mutation.run(async () => {
              result = await api.put<SystemSettingDto[]>(
                "/api/system-settings",
                {
                  values: Object.fromEntries(
                    fields.map(({ key }) => [
                      key,
                      String(Number(valueFor(key))),
                    ]),
                  ),
                },
              );
            })
          ) {
            setSaved((previous) =>
              previous.map(
                (row) =>
                  result.find((updated) => updated.key === row.key) ?? row,
              ),
            );
            setDrafts({});
          }
        }}
      >
        <fieldset className={styles.fields} disabled={mutation.busy}>
          <div className={styles.grid}>
            {fields.map((field) => {
              const text = t.settingFields[field.copy];
              const value = valueFor(field.key);
              const time = group.id === "hours";
              return (
                <Field
                  key={field.key}
                  label={text.label.replace(/\s*\((minutes|hours|days)\)$/, "")}
                  hint={text.hint}
                >
                  <span className={styles.control}>
                    <input
                      required
                      aria-label={text.label}
                      type={time ? "time" : "number"}
                      min={time ? "00:00" : field.min}
                      max={time ? "23:59" : field.max}
                      step={time ? 60 : 1}
                      value={
                        time && value !== ""
                          ? minutesToTime(Number(value))
                          : value
                      }
                      onChange={(event) => {
                        const input = event.target.value;
                        setDrafts((previous) => ({
                          ...previous,
                          [field.key]:
                            time && input !== ""
                              ? String(timeToMinutes(input))
                              : input,
                        }));
                        mutation.reset();
                      }}
                    />
                    {field.unit && (
                      <span className={styles.unit}>
                        {copy.units[field.unit]}
                      </span>
                    )}
                  </span>
                </Field>
              );
            })}
          </div>
          {hoursInvalid && (
            <p className="field__error" role="alert">
              {copy.invalidHours}
            </p>
          )}
          {missing && (
            <p className="field__error" role="alert">
              {copy.unavailable}
            </p>
          )}
          {group.id === "rental" && currentValue("rental.slot_minutes") && (
            <p className={styles.fixed}>
              {copy.rentalBlock.replace(
                "{minutes}",
                currentValue("rental.slot_minutes"),
              )}
            </p>
          )}
          <footer className={styles.footer}>
            <span className={styles.updated}>
              {updatedAt ? `${copy.updated} ${formatDateTime(updatedAt)}` : ""}
            </span>
            {dirty && (
              <div className={styles.actions}>
                <button
                  type="button"
                  className="btn btn--ghost"
                  onClick={() => {
                    setDrafts({});
                    mutation.reset();
                  }}
                >
                  {copy.discard}
                </button>
                <button type="submit" className="btn" disabled={!valid}>
                  {t.operations.save}
                </button>
              </div>
            )}
          </footer>
        </fieldset>
        <MutationFeedback mutation={mutation} />
      </form>
    </section>
  );
}
