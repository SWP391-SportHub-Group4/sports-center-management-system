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
  helper: string;
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
  description: string;
  fields: SettingField[];
};
type SectionData = Partial<SystemSettings>;

const sections: SectionDefinition[] = [
  {
    name: "centerHours",
    title: "Center hours",
    description:
      "Opening and closing times in Vietnam (UTC+7). Applies to classes, courts and incidents.",
    fields: [
      {
        name: "centerOpeningTime",
        label: "Center opening time",
        type: "time",
        helper:
          "Vietnam time (UTC+7). Classes and court opening hours must start at or after this time.",
      },
      {
        name: "centerClosingTime",
        label: "Center closing time",
        type: "time",
        helper:
          "Vietnam time (UTC+7). Classes and court opening hours must end at or before this time.",
      },
    ],
  },
  {
    name: "classes",
    title: "Classes",
    description:
      "Choose when to review enrollment against the class opening threshold.",
    fields: [
      {
        name: "thresholdCheckDays",
        label: "Threshold check",
        type: "number",
        unit: "days",
        min: 3,
        max: 30,
        helper:
          "Evaluate paid enrollments against the break-even threshold before the first session. Used when publishing a class; existing review deadlines are preserved.",
      },
    ],
  },
  {
    name: "checkoutAndPoints",
    title: "Checkout & points",
    description:
      "Set checkout hold times and point confirmation security at the counter.",
    fields: [
      {
        name: "checkoutHoldMinutes",
        label: "Checkout hold",
        type: "number",
        unit: "minutes",
        min: 10,
        max: 30,
        helper:
          "Set 10-30 minutes (default 15). New checkouts only; the exact expiry may be earlier near a class or court start.",
      },
      {
        name: "counterPointOtpValidityMinutes",
        label: "Counter point OTP validity",
        type: "number",
        unit: "minutes",
        min: 1,
        max: 15,
        helper:
          "Time allowed to verify the member's email OTP when using points at the counter.",
      },
    ],
  },
  {
    name: "courtRentals",
    title: "Court rentals",
    description: "Limit how long a court can be rented in one booking.",
    fields: [
      {
        name: "maximumRentalDurationHours",
        label: "Maximum rental duration",
        type: "number",
        unit: "hours",
        min: 1,
        max: 4,
        helper:
          "Maximum duration of a single court rental. Court rentals use 60-minute blocks.",
      },
    ],
  },
  {
    name: "membership",
    title: "Membership",
    description: "Let members know before their membership expires.",
    fields: [
      {
        name: "membershipExpiryNoticeDays",
        label: "Membership expiry notice",
        type: "number",
        unit: "days",
        min: 1,
        max: 90,
        helper:
          "Notify members this many days before their membership expires.",
      },
    ],
  },
  {
    name: "supportRequests",
    title: "Support requests",
    description:
      "Set response deadlines, reminder intervals and payout confirmation periods.",
    fields: [
      {
        name: "supportResponseDeadlineHours",
        label: "Support response deadline",
        type: "number",
        unit: "hours",
        min: 1,
        max: 168,
        helper:
          "Time allowed before a support request is overdue. Existing deadlines are preserved. Choose 1-168 hours.",
      },
      {
        name: "supportReminderIntervalHours",
        label: "Support reminder interval",
        type: "number",
        unit: "hours",
        min: 1,
        max: 168,
        helper:
          "Minimum interval between reminders for a support request. Choose 1-168 hours.",
      },
      {
        name: "payoutConfirmationPeriodDays",
        label: "Payout confirmation period",
        type: "number",
        unit: "days",
        min: 1,
        max: 30,
        helper:
          "Automatically confirm receipt after this period if the member has not responded. Choose 1-30 days.",
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
          aria-describedby={`${id}-hint${field.unit ? ` ${id}-unit` : ""}`}
          onChange={(event) => onChange(event.target.value)}
        />
        {field.unit && (
          <span id={`${id}-unit`} className="operating-setting-unit">
            {field.unit}
          </span>
        )}
      </div>
      <p id={`${id}-hint`} className="operating-setting-hint">
        {field.helper}
      </p>
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
        <p>{section.description}</p>
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
          <span className="operating-setting-updated">
            Last updated{" "}
            <time dateTime={updatedAt}>{formatUpdatedAt(updatedAt)}</time>
          </span>
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
        <p className="operating-settings-intro">
          Manage daily operations. Save changes separately for each section.
        </p>
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
        }
        .operating-settings-intro {
          margin: 0 0 var(--space-5);
          max-width: 70ch;
          color: var(--text-muted);
          line-height: 1.6;
        }
        .operating-settings-list {
          min-width: 0;
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-lg);
          background: var(--bg-surface);
        }
        .operating-setting-section {
          padding: var(--space-6);
        }
        .operating-setting-section + .operating-setting-section {
          border-top: 1px solid var(--border-subtle);
        }
        .operating-setting-heading {
          margin-bottom: var(--space-5);
        }
        .operating-setting-heading h2 {
          margin: 0 0 var(--space-1);
          font: var(--weight-semibold) var(--text-lg)/1.4 var(--font-body);
          text-wrap: balance;
        }
        .operating-setting-heading p {
          max-width: 70ch;
          margin: 0;
          color: var(--text-muted);
          font-size: var(--text-sm);
          line-height: 1.6;
        }
        .operating-settings-page .operating-setting-section form {
          gap: 0;
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
          gap: var(--space-5) var(--space-6);
          align-items: start;
        }
        .operating-setting-input {
          min-width: 0;
        }
        .operating-settings-page .operating-setting-input label {
          display: block;
          margin-bottom: var(--space-2);
          font-size: var(--text-sm);
          font-weight: var(--weight-medium);
        }
        .operating-setting-control {
          display: flex;
          align-items: center;
          gap: var(--space-3);
        }
        .operating-setting-control input {
          width: 100%;
          max-width: 18rem;
          min-width: 0;
          font-variant-numeric: tabular-nums;
        }
        .operating-setting-unit {
          flex-shrink: 0;
          color: var(--text-muted);
          font-size: var(--text-sm);
        }
        .operating-setting-hint {
          max-width: 65ch;
          margin: var(--space-2) 0 0;
          color: var(--text-muted);
          font-size: var(--text-sm);
          line-height: 1.6;
        }
        .operating-setting-footer {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          justify-content: space-between;
          gap: var(--space-3);
          margin-top: var(--space-5);
        }
        .operating-setting-updated {
          color: var(--text-muted);
          font-size: var(--text-xs);
          font-variant-numeric: tabular-nums;
        }
        .operating-setting-actions {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          justify-content: flex-end;
          gap: var(--space-3);
          margin-left: auto;
        }
        .operating-setting-status {
          color: var(--text-muted);
          font-size: var(--text-sm);
        }
        .operating-setting-actions .btn {
          min-width: 5rem;
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
        @media (max-width: 640px) {
          .operating-setting-section {
            padding: var(--space-5) var(--space-4);
          }
          .operating-setting-grid {
            grid-template-columns: minmax(0, 1fr);
          }
          .operating-setting-control input {
            max-width: none;
          }
        }
      `}</style>
    </>
  );
}
