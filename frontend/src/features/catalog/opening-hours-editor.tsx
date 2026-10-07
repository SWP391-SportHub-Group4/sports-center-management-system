"use client";
import { useState } from "react";
import { api } from "@/lib/apiClient";
import { useApi } from "@/lib/useApi";
import { useLanguage } from "@/lib/language";
import { AsyncSection, Field } from "@/components/ui";
import { MutationFeedback, useMutation } from "@/features/operations";
import type { OpeningHourDto } from "@/lib/types";
import { catalogApi } from "./api";
import styles from "./manager-catalog.module.css";
export function OpeningHoursEditor({ roomId }: { roomId: number }) {
  const { t } = useLanguage();
  const l = t.operations;
  const state = useApi((s) => catalogApi.hours(roomId, s), [roomId]);
  const mutation = useMutation();
  const [draft, setDraft] = useState<OpeningHourDto[] | null>(null);
  return (
    <AsyncSection state={state}>
      {(data) => {
        const hours = draft ?? data;
        return (
          <form
            className="stack"
            onSubmit={async (e) => {
              e.preventDefault();
              if (
                await mutation.run(() =>
                  api.put(`/api/manager/rooms/${roomId}/opening-hours`, {
                    hours,
                  }),
                )
              ) {
                setDraft(null);
                state.reload();
              }
            }}
          >
            <h3>{l.openingHours}</h3>
            <p className={styles.hoursHint}>{t.facilityHours.hint}</p>
            <fieldset disabled={mutation.busy} className={styles.formFields}>
              <div className={styles.hoursList}>
                {l.weekdays.map((name, dayOfWeek) => {
                  const row = hours.find((h) => h.dayOfWeek === dayOfWeek);
                  return (
                    <div
                      key={dayOfWeek}
                      className={styles.hoursRow}
                      role="group"
                      aria-label={name}
                    >
                      <span className={styles.hoursDay}>{name}</span>
                      <label className={styles.check}>
                        <input
                          type="checkbox"
                          checked={!!row}
                          onChange={(e) =>
                            setDraft(
                              e.target.checked
                                ? [
                                    ...hours,
                                    {
                                      dayOfWeek,
                                      openTimeLocal: "06:00",
                                      closeTimeLocal: "22:00",
                                    },
                                  ]
                                : hours.filter(
                                    (h) => h.dayOfWeek !== dayOfWeek,
                                  ),
                            )
                          }
                        />
                        {t.facilityHours.open}
                      </label>
                      {row ? (
                        <div className={styles.facilityGrid}>
                          <Field label={t.facilityHours.openTime}>
                            <input
                              type="time"
                              required
                              value={row.openTimeLocal}
                              onChange={(e) =>
                                setDraft(
                                  hours.map((h) =>
                                    h.dayOfWeek === dayOfWeek
                                      ? { ...h, openTimeLocal: e.target.value }
                                      : h,
                                  ),
                                )
                              }
                            />
                          </Field>
                          <Field label={t.facilityHours.closeTime}>
                            <input
                              type="time"
                              required
                              value={row.closeTimeLocal}
                              onChange={(e) =>
                                setDraft(
                                  hours.map((h) =>
                                    h.dayOfWeek === dayOfWeek
                                      ? { ...h, closeTimeLocal: e.target.value }
                                      : h,
                                  ),
                                )
                              }
                            />
                          </Field>
                        </div>
                      ) : (
                        <span className={styles.hoursClosed}>{l.closed}</span>
                      )}
                      {row && row.closeTimeLocal <= row.openTimeLocal && (
                        <p role="alert" className={styles.hoursError}>
                          {t.facilityHours.invalidRange}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            </fieldset>
            <div className="btn-row">
              <button
                className="btn"
                disabled={
                  mutation.busy ||
                  hours.some((h) => h.closeTimeLocal <= h.openTimeLocal)
                }
              >
                {l.save}
              </button>
            </div>
            <MutationFeedback mutation={mutation} />
          </form>
        );
      }}
    </AsyncSection>
  );
}
