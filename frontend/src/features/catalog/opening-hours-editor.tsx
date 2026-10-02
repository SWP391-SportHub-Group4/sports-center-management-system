"use client";
import { useState } from "react";
import { api } from "@/lib/apiClient";
import { useApi } from "@/lib/useApi";
import { useLanguage } from "@/lib/language";
import { AsyncSection, Field } from "@/components/ui";
import { MutationFeedback, useMutation } from "@/features/operations";
import type { OpeningHourDto } from "@/lib/types";
import { catalogApi } from "./api";
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
            {l.weekdays.map((name, dayOfWeek) => {
              const row = hours.find((h) => h.dayOfWeek === dayOfWeek);
              return (
                <fieldset key={dayOfWeek}>
                  <legend>{name}</legend>
                  <label>
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
                            : hours.filter((h) => h.dayOfWeek !== dayOfWeek),
                        )
                      }
                    />
                    {row ? l.active : l.closed}
                  </label>
                  {row && (
                    <div className="form-grid">
                      <Field label={l.start}>
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
                      <Field label={l.end}>
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
                  )}
                </fieldset>
              );
            })}
            <button
              className="btn"
              disabled={
                mutation.busy ||
                hours.some((h) => h.closeTimeLocal <= h.openTimeLocal)
              }
            >
              {l.save}
            </button>
            <MutationFeedback mutation={mutation} />
          </form>
        );
      }}
    </AsyncSection>
  );
}
