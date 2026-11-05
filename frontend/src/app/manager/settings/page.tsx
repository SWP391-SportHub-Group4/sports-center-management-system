"use client";

import { useId, useState, type FormEvent } from "react";
import { OperationsPage } from "@/features/operations/ui";
import { api, ApiError } from "@/lib/apiClient";
import { useApi } from "@/lib/useApi";
import { AsyncSection } from "@/components/ui";
import type { SystemSettingDto } from "@/lib/types";
import { minutesToTime, timeToMinutes } from "@/lib/center-hours";

export interface SystemSettings {
  centerOpeningTime: string;
  centerClosingTime: string;
  thresholdCheckDays: number;
  checkoutHoldMinutes: number;
  counterPointOtpValidityMinutes: number;
  maximumRentalDurationHours: number;
  membershipExpiryNoticeDays: number;
  supportResponseDeadlineHours: number;
  supportReminderIntervalHours: number;
  payoutConfirmationPeriodDays: number;
}

const settingKeys: Record<keyof SystemSettings, string> = {
  centerOpeningTime: "center.opening_minutes",
  centerClosingTime: "center.closing_minutes",
  thresholdCheckDays: "class.threshold_days_before_start",
  checkoutHoldMinutes: "hold.minutes",
  counterPointOtpValidityMinutes: "points.confirm_otp_minutes",
  maximumRentalDurationHours: "rental.max_hours",
  membershipExpiryNoticeDays: "membership.expiry_notice_days",
  supportResponseDeadlineHours: "support.sla_hours",
  supportReminderIntervalHours: "support.remind_cooldown_hours",
  payoutConfirmationPeriodDays: "support.payout_confirm_days",
};

function readSettings(rows: SystemSettingDto[]): SystemSettings {
  return Object.fromEntries(
    Object.entries(settingKeys).map(([name, key]) => {
      const row = rows.find((item) => item.key === key);
      const number = Number(row?.value);
      if (!row || !row.value.trim() || !Number.isSafeInteger(number))
        throw new ApiError(
          0,
          "invalid_settings",
          "Operating settings are unavailable. Please retry loading them.",
        );
      return [
        name,
        name === "centerOpeningTime" || name === "centerClosingTime"
          ? minutesToTime(number)
          : number,
      ];
    }),
  ) as unknown as SystemSettings;
}

type SettingField = {
  name: keyof SystemSettings;
  label: string;
  type: "time" | "number";
  unit?: "days" | "hours" | "minutes";
  min?: number;
  max?: number;
};
type SectionName =
  | "centerHours"
  | "classes"
  | "checkoutAndPoints"
  | "courtRentals"
  | "membership"
  | "supportRequests";
type SectionDefinition = {
  name: SectionName;
  title: string;
  fields: SettingField[];
};
type SectionData = Partial<SystemSettings>;

const sections: SectionDefinition[] = [
  {
    name: "centerHours",
    title: "Center hours",
    fields: [
      {
        name: "centerOpeningTime",
        label: "Center opening time",
        type: "time",
      },
      {
        name: "centerClosingTime",
        label: "Center closing time",
        type: "time",
      },
    ],
  },
  {
    name: "classes",
    title: "Classes",
    fields: [
      {
        name: "thresholdCheckDays",
        label: "Threshold check",
        type: "number",
        unit: "days",
        min: 3,
        max: 30,
      },
    ],
  },
  {
    name: "checkoutAndPoints",
    title: "Checkout & points",
    fields: [
      {
        name: "checkoutHoldMinutes",
        label: "Checkout hold",
        type: "number",
        unit: "minutes",
        min: 10,
        max: 30,
      },
      {
        name: "counterPointOtpValidityMinutes",
        label: "Counter point OTP validity",
        type: "number",
        unit: "minutes",
        min: 1,
        max: 15,
      },
    ],
  },
  {
    name: "courtRentals",
    title: "Court rentals",
    fields: [
      {
        name: "maximumRentalDurationHours",
        label: "Maximum rental duration",
        type: "number",
        unit: "hours",
        min: 1,
        max: 4,
      },
    ],
  },
  {
    name: "membership",
    title: "Membership",
    fields: [
      {
        name: "membershipExpiryNoticeDays",
        label: "Membership expiry notice",
        type: "number",
        unit: "days",
        min: 1,
        max: 90,
      },
    ],
  },
  {
    name: "supportRequests",
    title: "Support requests",
    fields: [
      {
        name: "supportResponseDeadlineHours",
        label: "Support response deadline",
        type: "number",
        unit: "hours",
        min: 1,
        max: 168,
      },
      {
        name: "supportReminderIntervalHours",
        label: "Support reminder interval",
        type: "number",
        unit: "hours",
        min: 1,
        max: 168,
      },
      {
        name: "payoutConfirmationPeriodDays",
        label: "Payout confirmation period",
        type: "number",
        unit: "days",
        min: 1,
        max: 30,
      },
    ],
  },
];

function formatUpdatedAt(value: string) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Ho_Chi_Minh",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(value));
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value;
  return `${part("day")}/${part("month")}/${part("year")}, ${part("hour")}:${part("minute")}`;
}

function SettingInput({
  field,
  value,
  onChange,
}: {
  field: SettingField;
  value: string;
  onChange: (value: string) => void;
}) {
  const id = useId();
  return (
    <div className="operating-setting-input">
      <label htmlFor={id}>{field.label}</label>
      <div className="operating-setting-control">
        <input
          id={id}
          name={field.name}
          type={field.type}
          value={value}
          min={field.min}
          max={field.max}
          step={field.type === "time" ? 60 : 1}
          required
          aria-describedby={field.unit ? `${id}-unit` : undefined}
          onChange={(event) => onChange(event.target.value)}
        />
        {field.unit && (
          <span id={`${id}-unit`} className="operating-setting-unit">
            {field.unit}
          </span>
        )}
      </div>
    </div>
  );
}

function SettingSection({
  section,
  settings,
  updatedAt,
  onSave,
}: {
  section: SectionDefinition;
  settings: SystemSettings;
  updatedAt: string;
  onSave: (sectionName: SectionName, data: SectionData) => Promise<void>;
}) {
  const headingId = useId();
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const valueFor = (name: keyof SystemSettings) =>
    draft[name] ?? String(settings[name]);
  const hoursInvalid =
    section.name === "centerHours" &&
    valueFor("centerOpeningTime") !== "" &&
    valueFor("centerClosingTime") !== "" &&
    valueFor("centerOpeningTime") >= valueFor("centerClosingTime");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving || hoursInvalid || !event.currentTarget.reportValidity()) return;
    const data = Object.fromEntries(
      section.fields.map((field) => [
        field.name,
        field.type === "time"
          ? valueFor(field.name)
          : Number(valueFor(field.name)),
      ]),
    ) as SectionData;
    setSaving(true);
    setMessage("");
    setError("");
    try {
      await onSave(section.name, data);
      setDraft({});
      setMessage("Changes saved.");
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Unable to save changes. Please try again.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="operating-setting-section" aria-labelledby={headingId}>
      <header className="operating-setting-heading">
        <h2 id={headingId}>{section.title}</h2>
        <span className="operating-setting-updated">
          Last updated{" "}
          <time dateTime={updatedAt}>{formatUpdatedAt(updatedAt)}</time>
        </span>
      </header>
      <form onSubmit={handleSubmit} aria-busy={saving}>
        <fieldset disabled={saving} className="operating-setting-fields">
          <legend className="operating-settings-sr-only">
            {section.title}
          </legend>
          <div className="operating-setting-grid">
            {section.fields.map((field) => (
              <SettingInput
                key={field.name}
                field={field}
                value={valueFor(field.name)}
                onChange={(value) => {
                  setDraft((previous) => ({
                    ...previous,
                    [field.name]: value,
                  }));
                  setMessage("");
                  setError("");
                }}
              />
            ))}
          </div>
        </fieldset>
        {hoursInvalid && (
          <p className="field__error" role="alert">
            Opening time must be earlier than closing time.
          </p>
        )}
        {error && (
          <p className="field__error" role="alert">
            {error}
          </p>
        )}
        <footer className="operating-setting-footer">
          <div className="operating-setting-actions">
            <span
              role="status"
              aria-live="polite"
              className="operating-setting-status"
            >
              {saving ? "Saving changes…" : message}
            </span>
            <button
              type="submit"
              className="btn"
              disabled={saving || hoursInvalid}
              aria-label={`Save ${section.title}`}
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </footer>
      </form>
    </section>
  );
}

export default function Page() {
  const state = useApi(async (signal) => {
    const rows = await api.get<SystemSettingDto[]>("/api/system-settings", {
      signal,
    });
    readSettings(rows);
    return rows;
  }, []);
  return (
    <OperationsPage title="settings">
      <AsyncSection state={state}>
        {(rows) => <SettingsForm rows={rows} />}
      </AsyncSection>
    </OperationsPage>
  );
}

function SettingsForm({ rows }: { rows: SystemSettingDto[] }) {
  const [saved, setSaved] = useState(rows);
  const settings = readSettings(saved);

  async function handleSaveSection(
    sectionName: SectionName,
    data: SectionData,
  ) {
    const section = sections.find((item) => item.name === sectionName)!;
    const values = Object.fromEntries(
      section.fields.map(({ name, type }) => [
        settingKeys[name],
        String(
          type === "time" ? timeToMinutes(String(data[name])) : data[name],
        ),
      ]),
    );
    const updated = await api.put<SystemSettingDto[]>("/api/system-settings", {
      values,
    });
    if (
      section.fields.some(
        ({ name }) => !updated.some((row) => row.key === settingKeys[name]),
      )
    )
      throw new Error(
        "The save response was incomplete. Reload settings to verify the result.",
      );
    // Merge server-confirmed values only for this section, preserving concurrent saves.
    setSaved((previous) =>
      previous.map(
        (row) => updated.find((item) => item.key === row.key) ?? row,
      ),
    );
  }

  return (
    <>
      <div className="operating-settings-page">
        <div className="operating-settings-list">
          {sections.map((section) => (
            <SettingSection
              key={section.name}
              section={section}
              settings={settings}
              updatedAt={saved
                .filter((row) =>
                  section.fields.some(
                    ({ name }) => settingKeys[name] === row.key,
                  ),
                )
                .map((row) => row.updatedAt)
                .sort()
                .at(-1)!}
              onSave={handleSaveSection}
            />
          ))}
        </div>
      </div>
      <style jsx global>{`
        .operating-settings-page {
          min-width: 0;
          width: 100%;
          max-width: 80rem;
          margin-inline: auto;
        }
        .operating-settings-list {
          min-width: 0;
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-lg);
          background: var(--bg-surface);
          overflow: hidden;
        }
        .operating-setting-section {
          display: grid;
          grid-template-columns: 13rem minmax(0, 1fr);
          gap: var(--space-6);
          align-items: start;
          padding: var(--space-5) var(--space-6);
        }
        .operating-setting-section + .operating-setting-section {
          border-top: 1px solid var(--border-subtle);
        }
        .operating-setting-heading {
          padding-top: var(--space-1);
          min-width: 0;
        }
        .operating-setting-heading h2 {
          margin: 0 0 var(--space-2);
          font: var(--weight-semibold) var(--text-base)/1.4 var(--font-body);
          text-wrap: balance;
        }
        .operating-settings-page .operating-setting-section form {
          display: grid;
          grid-template-columns: minmax(0, 1fr) auto;
          align-items: start;
          column-gap: var(--space-5);
          row-gap: var(--space-2);
          min-width: 0;
          margin: 0;
        }
        .operating-settings-page .operating-setting-fields {
          border: 0;
          min-width: 0;
          margin: 0;
          padding: 0;
        }
        .operating-setting-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: var(--space-4);
          align-items: start;
        }
        .operating-setting-input {
          min-width: 0;
          max-width: 22rem;
        }
        .operating-settings-page .operating-setting-input label {
          display: block;
          margin-bottom: var(--space-2);
          font-size: var(--text-sm);
          font-weight: var(--weight-medium);
          line-height: 1.5;
        }
        .operating-setting-control {
          position: relative;
          display: flex;
          align-items: center;
          min-width: 0;
        }
        .operating-settings-page .operating-setting-control input {
          width: 100%;
          min-width: 0;
          min-height: 2.75rem;
          height: 2.75rem;
          margin: 0;
          font-size: var(--text-sm);
          font-variant-numeric: tabular-nums;
        }
        .operating-setting-control:has(.operating-setting-unit) input {
          padding-inline-end: 5.5rem;
        }
        .operating-setting-unit {
          position: absolute;
          inset-inline-end: var(--space-6);
          pointer-events: none;
          color: var(--text-muted);
          font-size: var(--text-xs);
        }
        .operating-setting-footer {
          padding-top: calc(var(--text-sm) * 1.5 + var(--space-2));
        }
        .operating-setting-updated {
          display: block;
          color: var(--text-muted);
          font-size: var(--text-xs);
          line-height: 1.6;
          font-variant-numeric: tabular-nums;
        }
        .operating-setting-updated time {
          display: block;
        }
        .operating-setting-actions {
          display: flex;
          flex-direction: column-reverse;
          align-items: flex-end;
          gap: var(--space-2);
        }
        .operating-setting-status {
          max-width: 12rem;
          color: var(--text-muted);
          font-size: var(--text-xs);
          text-align: end;
        }
        .operating-setting-actions .btn {
          min-width: 5rem;
          min-height: 2.75rem;
          padding: var(--space-2) var(--space-4);
          font-size: var(--text-sm);
        }
        .operating-setting-section .field__error {
          grid-column: 1 / -1;
          margin: 0;
        }
        .operating-settings-sr-only {
          position: absolute;
          width: 1px;
          height: 1px;
          padding: 0;
          margin: -1px;
          overflow: hidden;
          clip-path: inset(50%);
          white-space: nowrap;
          border: 0;
        }
        @media (max-width: 1100px) {
          .operating-setting-section {
            grid-template-columns: 10rem minmax(0, 1fr);
            gap: var(--space-5);
          }
          .operating-settings-page .operating-setting-section form {
            grid-template-columns: minmax(0, 1fr);
          }
          .operating-setting-footer {
            padding-top: var(--space-1);
          }
          .operating-setting-actions {
            flex-direction: row;
            align-items: center;
            justify-content: flex-end;
          }
        }
        @media (max-width: 640px) {
          .operating-setting-section {
            grid-template-columns: minmax(0, 1fr);
            padding: var(--space-5) var(--space-4);
            gap: var(--space-4);
          }
          .operating-setting-heading {
            padding-top: 0;
          }
          .operating-setting-heading h2 {
            margin-bottom: var(--space-1);
          }
          .operating-setting-updated time {
            display: inline;
          }
          .operating-setting-grid {
            grid-template-columns: minmax(0, 1fr);
          }
          .operating-setting-input {
            max-width: none;
          }
        }
      `}</style>
    </>
  );
}
