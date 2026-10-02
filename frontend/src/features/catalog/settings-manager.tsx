"use client";
import { useState } from "react";
import { api } from "@/lib/apiClient";
import { useApi } from "@/lib/useApi";
import { useLanguage } from "@/lib/language";
import { formatDateTime } from "@/lib/format";
import { AsyncSection, Card, Table } from "@/components/ui";
import { MutationFeedback, useMutation } from "@/features/operations";
import type { SystemSettingDto } from "@/lib/types";
import type { Translations } from "@/locales/en";
import styles from "./settings-manager.module.css";
const settingLabels: Record<string, keyof Translations["settingFields"]> = {
  "class.threshold_days_before_start": "thresholdDays",
  "class.threshold_response_hours": "responseHours",
  "hold.minutes": "holdMinutes",
  "membership.expiry_notice_days": "expiryDays",
  "points.confirm_otp_minutes": "otpMinutes",
  "rental.advance_days": "advanceDays",
  "rental.cancel_free_hours": "cancelHours",
  "rental.max_hours": "maxHours",
  "rental.slot_minutes": "slotMinutes",
};
const ranges: Record<string, [number, number]> = {
  "membership.expiry_notice_days": [1, 90],
  "class.threshold_days_before_start": [1, 30],
  "class.threshold_response_hours": [1, 336],
  "hold.minutes": [1, 1440],
  "points.confirm_otp_minutes": [1, 15],
  "rental.max_hours": [1, 4],
  "rental.advance_days": [1, 30],
  "rental.cancel_free_hours": [0, 168],
};
export function SettingsManager() {
  const { t } = useLanguage();
  const l = t.operations;
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const mutation = useMutation();
  const state = useApi(
    (s) => api.get<SystemSettingDto[]>("/api/system-settings", { signal: s }),
    [],
  );
  return (
    <Card>
      <p>{l.snapshotHint}</p>
      <AsyncSection state={state}>
        {(rows) => (
          <div className={styles.settings}>
            <Table headers={[l.name, l.value, l.description, l.date, ""]}>
              {rows
                .filter((s) => ranges[s.key] || s.key === "rental.slot_minutes")
                .map((s) => {
                  const value = drafts[s.key] ?? s.value;
                  const bound = ranges[s.key];
                  const copy = t.settingFields[settingLabels[s.key]];
                  const fixed = s.key === "rental.slot_minutes";
                  const valid =
                    s.key === "rental.slot_minutes"
                      ? value === "60"
                      : !!bound &&
                        Number.isInteger(Number(value)) &&
                        Number(value) >= bound[0] &&
                        Number(value) <= bound[1];
                  return (
                    <tr key={s.key}>
                      <td>{copy.label}</td>
                      <td>
                        <input
                          aria-label={copy.label}
                          readOnly={fixed}
                          type="number"
                          min={bound?.[0] ?? 60}
                          max={bound?.[1] ?? 60}
                          step={1}
                          value={value}
                          onChange={(e) =>
                            setDrafts({ ...drafts, [s.key]: e.target.value })
                          }
                        />
                      </td>
                      <td>{copy.hint}</td>
                      <td>{formatDateTime(s.updatedAt)}</td>
                      <td>
                        <button
                          className="btn btn--secondary"
                          disabled={
                            fixed ||
                            mutation.busy ||
                            value === s.value ||
                            !valid
                          }
                          onClick={async () => {
                            if (
                              await mutation.run(() =>
                                api.put(`/api/system-settings/${s.key}`, {
                                  value,
                                }),
                              )
                            ) {
                              state.reload();
                              const next = { ...drafts };
                              delete next[s.key];
                              setDrafts(next);
                            }
                          }}
                        >
                          {l.save}
                        </button>
                      </td>
                    </tr>
                  );
                })}
            </Table>
          </div>
        )}
      </AsyncSection>
      <MutationFeedback mutation={mutation} />
    </Card>
  );
}
