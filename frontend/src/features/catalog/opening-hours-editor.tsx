"use client";

import { useId, useState } from "react";
import { Clock3, Pencil } from "lucide-react";
import { api } from "@/lib/apiClient";
import { useApi } from "@/lib/useApi";
import { useLanguage } from "@/lib/language";
import { AsyncSection, Dialog, Field } from "@/components/ui";
import { useOperatingHoursPopup } from "@/components/OperatingHoursPopup";
import { MutationFeedback, useMutation } from "@/features/operations";
import type { OpeningHourDto } from "@/lib/types";
import { catalogApi } from "./api";
import layout from "./opening-hours.module.css";
import {
  loadCenterHours,
  centerHoursHint,
  centerHoursError,
} from "@/lib/center-hours";

const weekOrder = [1, 2, 3, 4, 5, 6, 0];

export function OpeningHoursEditor({ roomId }: { roomId: number }) {
  const { t } = useLanguage();
  const l = t.operations;
  const formId = useId();
  const notice = useOperatingHoursPopup();
  const mutation = useMutation();
  const [draft, setDraft] = useState<OpeningHourDto[] | null>(null);
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
  const close = () => {
    if (mutation.busy) return;
    setDraft(null);
    mutation.reset();
  };

  return (
    <>
      <header className={layout.heading}>
        <div className={layout.title}>
          <h2 id="room-hours-title">{l.openingHours}</h2>
          <p>
            <Clock3 size={14} aria-hidden="true" />
            {t.rentalCourtSetup.localTime}
          </p>
        </div>
        <button
          type="button"
          className={`btn btn--secondary ${layout.editButton}`}
          disabled={state.loading || !!state.error || !state.data}
          onClick={() => {
            mutation.reset();
            setDraft(state.data!.hours.map((hour) => ({ ...hour })));
          }}
        >
          <Pencil size={15} aria-hidden="true" />
          {l.edit}
        </button>
      </header>
      <AsyncSection state={state}>
        {({ hours: saved, center }) => {
          const hours = draft ?? [];
          const invalid = hours.some(
            (hour) =>
              hour.closeTimeLocal <= hour.openTimeLocal ||
              hour.openTimeLocal < center.opens ||
              hour.closeTimeLocal > center.closes,
          );
          return (
            <>
              <dl className={layout.schedule}>
                {weekOrder.map((dayOfWeek) => {
                  const hour = saved.find((row) => row.dayOfWeek === dayOfWeek);
                  return (
                    <div
                      key={dayOfWeek}
                      className={layout.day}
                      data-closed={!hour}
                    >
                      <dt>{l.weekdays[dayOfWeek]}</dt>
                      <dd className={hour ? undefined : layout.closed}>
                        {hour
                          ? `${hour.openTimeLocal.slice(0, 5)}–${hour.closeTimeLocal.slice(0, 5)}`
                          : l.closed}
                      </dd>
                    </div>
                  );
                })}
              </dl>
              {draft === null ? (
                <MutationFeedback mutation={mutation} />
              ) : (
                <Dialog
                  title={t.managerCatalog.editOpeningHours}
                  size="lg"
                  className={layout.dialog}
                  onClose={close}
                  closeIconOnly
                  footer={
                    <>
                      <button
                        type="button"
                        className="btn btn--secondary"
                        disabled={mutation.busy}
                        onClick={close}
                      >
                        {l.cancel}
                      </button>
                      <button
                        type="submit"
                        form={formId}
                        className="btn"
                        disabled={mutation.busy || invalid}
                      >
                        {mutation.busy ? t.common.loading : l.save}
                      </button>
                    </>
                  }
                >
                  <form
                    id={formId}
                    className="stack"
                    onChangeCapture={(event) =>
                      notice.checkTime(event, centerHoursError(center))
                    }
                    onInvalidCapture={(event) =>
                      notice.checkTime(event, centerHoursError(center))
                    }
                    onSubmit={async (event) => {
                      event.preventDefault();
                      if (mutation.busy || invalid) return;
                      const ordered = weekOrder.flatMap((day) =>
                        hours.filter((hour) => hour.dayOfWeek === day),
                      );
                      if (
                        await mutation.run(() =>
                          api.put(
                            `/api/manager/rooms/${roomId}/opening-hours`,
                            { hours: ordered },
                          ),
                        )
                      ) {
                        setDraft(null);
                        state.reload();
                      }
                    }}
                  >
                    {notice.popup}
                    <p className={layout.centerHint}>
                      <Clock3 size={16} aria-hidden="true" />
                      {centerHoursHint(center)}
                    </p>
                    <fieldset
                      disabled={mutation.busy}
                      className={layout.editorFields}
                    >
                      <div className={layout.columnHead} aria-hidden="true">
                        <span>{t.managerCatalog.rentalDay}</span>
                        <span>{t.facilityHours.open}</span>
                        <span>{t.facilityHours.openTime}</span>
                        <span>{t.facilityHours.closeTime}</span>
                      </div>
                      <div className={layout.editorList}>
                        {weekOrder.map((dayOfWeek) => {
                          const name = l.weekdays[dayOfWeek];
                          const row = hours.find(
                            (hour) => hour.dayOfWeek === dayOfWeek,
                          );
                          return (
                            <div
                              key={dayOfWeek}
                              className={layout.editorRow}
                              data-closed={!row}
                              role="group"
                              aria-label={name}
                            >
                              <span className={layout.weekday}>{name}</span>
                              <label className={layout.openControl}>
                                <input
                                  type="checkbox"
                                  checked={!!row}
                                  onChange={(event) =>
                                    setDraft(
                                      event.target.checked
                                        ? [
                                            ...hours,
                                            {
                                              dayOfWeek,
                                              openTimeLocal: center.opens,
                                              closeTimeLocal: center.closes,
                                            },
                                          ]
                                        : hours.filter(
                                            (hour) =>
                                              hour.dayOfWeek !== dayOfWeek,
                                          ),
                                    )
                                  }
                                />
                                {t.facilityHours.open}
                              </label>
                              {row ? (
                                <div className={layout.timeFields}>
                                  <Field label={t.facilityHours.openTime}>
                                    <input
                                      type="time"
                                      min={center.opens}
                                      max={center.closes}
                                      required
                                      value={row.openTimeLocal}
                                      onChange={(event) =>
                                        setDraft(
                                          hours.map((hour) =>
                                            hour.dayOfWeek === dayOfWeek
                                              ? {
                                                  ...hour,
                                                  openTimeLocal:
                                                    event.target.value,
                                                }
                                              : hour,
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
                                      onChange={(event) =>
                                        setDraft(
                                          hours.map((hour) =>
                                            hour.dayOfWeek === dayOfWeek
                                              ? {
                                                  ...hour,
                                                  closeTimeLocal:
                                                    event.target.value,
                                                }
                                              : hour,
                                          ),
                                        )
                                      }
                                    />
                                  </Field>
                                </div>
                              ) : (
                                <span className={layout.closedRow}>
                                  {l.closed}
                                </span>
                              )}
                              {row &&
                                row.closeTimeLocal <= row.openTimeLocal && (
                                  <p role="alert" className={layout.error}>
                                    {t.facilityHours.invalidRange}
                                  </p>
                                )}
                            </div>
                          );
                        })}
                      </div>
                    </fieldset>
                    <MutationFeedback mutation={mutation} />
                  </form>
                </Dialog>
              )}
            </>
          );
        }}
      </AsyncSection>
    </>
  );
}
