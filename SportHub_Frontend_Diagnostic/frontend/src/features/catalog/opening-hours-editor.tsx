"use client";
import { useState } from "react";
import { api } from "@/lib/apiClient";
import { useApi } from "@/lib/useApi";
import { useLanguage } from "@/lib/language";
import { AsyncSection, Field } from "@/components/ui";
import { useOperatingHoursPopup } from "@/components/OperatingHoursPopup";
import { MutationFeedback, useMutation } from "@/features/operations";
import type { OpeningHourDto } from "@/lib/types";
import { catalogApi } from "./api";
import styles from "./manager-catalog.module.css";
import {
  loadCenterHours,
  centerHoursHint,
  centerHoursError,
} from "@/lib/center-hours";
export function OpeningHoursEditor({
  roomId,
  showHeading = true,
  showInstructions = true,
  showTimezone = true,
}: {
  roomId: number;
  showHeading?: boolean;
  showInstructions?: boolean;
  showTimezone?: boolean;
}) {
  const { t } = useLanguage();
  const l = t.operations;
  const notice = useOperatingHoursPopup();
  const state = useApi(
    async (signal) => {
      const [hours, center] = await Promise.all([
        catalogApi.hours(roomId, signal),
        loadCenterHours(signal),
      ]);
      return { hours, center };
    },
    [roomId],
  );
  const mutation = useMutation();
  const [draft, setDraft] = useState<OpeningHourDto[] | null>(null);
  return (
    <AsyncSection state={state}>
      {(data) => {
        const hours = draft ?? data.hours;
        const center = data.center;
        const invalid = hours.some(
          (h) =>
            h.closeTimeLocal <= h.openTimeLocal ||
            h.openTimeLocal < center.opens ||
            h.closeTimeLocal > center.closes,
        );
        return (
          <form
            className="stack"
            onChangeCapture={(event) =>
              notice.checkTime(event, centerHoursError(center))
            }
            onInvalidCapture={(event) =>
              notice.checkTime(event, centerHoursError(center))
            }
            onSubmit={async (e) => {
              e.preventDefault();
              if (invalid) return;
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
            {notice.popup}
            {showHeading && <h3>{l.openingHours}</h3>}
            {showInstructions && <p className={styles.hoursHint}>{t.facilityHours.hint}</p>}
            <p className={styles.hoursHint}>{showTimezone ? centerHoursHint(center) : centerHoursHint(center).replace(" (Vietnam time)", "")}</p>
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
                                      openTimeLocal: center.opens,
                                      closeTimeLocal: center.closes,
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
                              min={center.opens}
                              max={center.closes}
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
                              min={center.opens}
                              max={center.closes}
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
              <button className="btn" disabled={mutation.busy || invalid}>
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
