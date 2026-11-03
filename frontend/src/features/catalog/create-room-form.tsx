"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/apiClient";
import { useLanguage } from "@/lib/language";
import { useApi } from "@/lib/useApi";
import {
  centerHoursHint,
  loadCenterHours,
  minutesToTime,
} from "@/lib/center-hours";
import { AsyncSection, Field } from "@/components/ui";
import { ActivitySwitch } from "@/components/ActivitySwitch";
import { MutationFeedback, useMutation } from "@/features/operations";
import type { RoomDto } from "@/lib/types";
import styles from "./create-room-form.module.css";

const weekOrder = [1, 2, 3, 4, 5, 6, 0];

export function CreateRoomForm({
  onCreated,
  onCancel,
  onBusyChange,
}: {
  onCreated: (room: RoomDto) => void;
  onCancel: () => void;
  onBusyChange?: (busy: boolean) => void;
}) {
  const { t } = useLanguage();
  const copy = t.managerCatalog;
  const [name, setName] = useState("");
  const [capacity, setCapacity] = useState(12);
  const [allowRental, setAllowRental] = useState(false);
  const [price, setPrice] = useState("");
  const [days, setDays] = useState(
    weekOrder.map((dayOfWeek) => ({
      dayOfWeek,
      enabled: true,
      opens: "",
      closes: "",
    })),
  );
  const [validation, setValidation] = useState("");
  const center = useApi(
    (signal) => (allowRental ? loadCenterHours(signal) : Promise.resolve(null)),
    [allowRental],
  );
  const mutation = useMutation();
  useEffect(() => {
    onBusyChange?.(mutation.busy);
  }, [mutation.busy, onBusyChange]);
  const opens = center.data
    ? minutesToTime(
        Math.ceil(Math.max(6 * 60, center.data.openingMinute) / 60) * 60,
      )
    : "";
  const closes = center.data
    ? minutesToTime(
        Math.floor(Math.min(22 * 60, center.data.closingMinute) / 60) * 60,
      )
    : "";
  const hours = days
    .filter((day) => day.enabled)
    .map((day) => ({
      dayOfWeek: day.dayOfWeek,
      openTimeLocal: day.opens || opens,
      closeTimeLocal: day.closes || closes,
    }));
  const invalidHours = hours.some(
    (hour) =>
      !hour.openTimeLocal ||
      !hour.closeTimeLocal ||
      !/^\d{2}:00$/.test(hour.openTimeLocal) ||
      !/^\d{2}:00$/.test(hour.closeTimeLocal) ||
      hour.openTimeLocal < opens ||
      hour.closeTimeLocal > closes ||
      hour.closeTimeLocal <= hour.openTimeLocal,
  );
  const priceInvalid =
    price === "" ||
    !Number.isFinite(Number(price)) ||
    Number(price) < 2000 ||
    Number(price) % 2000 !== 0;
  const scheduleError = !hours.length
    ? copy.rentalDaysRequired
    : invalidHours && center.data
      ? copy.rentalHoursInvalid
      : undefined;
  const updateDay = (
    dayOfWeek: number,
    patch: Partial<(typeof days)[number]>,
  ) => {
    setDays((previous) =>
      previous.map((day) =>
        day.dayOfWeek === dayOfWeek ? { ...day, ...patch } : day,
      ),
    );
    setValidation("");
  };

  return (
    <form
      className={styles.form}
      onSubmit={async (event) => {
        event.preventDefault();
        setValidation("");
        if (
          allowRental &&
          (center.loading || !center.data || priceInvalid || scheduleError)
        ) {
          setValidation(
            scheduleError ??
              (priceInvalid ? copy.rentalPriceHint : copy.rentalHoursLoading),
          );
          return;
        }
        let room: RoomDto | undefined;
        if (
          await mutation.run(async () => {
            room = await api.post<RoomDto>("/api/rooms", {
              name: name.trim(),
              capacity,
              isActive: true,
              allowRental,
              ...(allowRental
                ? { rentalSetup: { pricePerHour: Number(price), hours } }
                : {}),
            });
          })
        ) {
          if (room) onCreated(room);
        }
      }}
    >
      <fieldset disabled={mutation.busy} className={styles.fields}>
        <legend className="sr-only">{copy.createRoom}</legend>
        <div className={styles.details}>
          <Field label={t.operations.name} required>
            <input
              autoFocus
              required
              maxLength={100}
              pattern=".*\S.*"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </Field>
          <Field label={t.operations.capacity} required>
            <input
              type="number"
              required
              min={1}
              max={500}
              step={1}
              value={capacity || ""}
              onChange={(event) => setCapacity(Number(event.target.value))}
            />
          </Field>
        </div>
        <ActivitySwitch
          label={copy.allowRental}
          hint={copy.createRoomRentalHint}
          checked={allowRental}
          onChange={(value) => {
            setAllowRental(value);
            setValidation("");
          }}
        />
        {allowRental && (
          <AsyncSection state={center}>
            {(value) =>
              value && (
                <section
                  className={styles.rental}
                  aria-label={copy.rentalSchedule}
                >
                  <Field
                    label={copy.pricePerHour}
                    required
                    hint={copy.rentalPriceHint}
                    error={priceInvalid ? copy.rentalPriceHint : undefined}
                  >
                    <input
                      type="number"
                      required
                      min={2000}
                      step={2000}
                      value={price}
                      onChange={(event) => {
                        setPrice(event.target.value);
                        setValidation("");
                      }}
                    />
                  </Field>
                  <div className={styles.scheduleHeading}>
                    <h3>{copy.rentalSchedule}</h3>
                    <p>{centerHoursHint(value)}</p>
                  </div>
                  <div className={styles.weekHeader} aria-hidden="true">
                    <span>{copy.rentalDay}</span>
                    <span>{copy.rentalOpens}</span>
                    <span>{copy.rentalCloses}</span>
                  </div>
                  <div className={styles.week}>
                    {days.map((day) => {
                      const dayLabel = t.operations.weekdays[day.dayOfWeek];
                      return (
                        <div
                          key={day.dayOfWeek}
                          className={styles.day}
                          role="group"
                          aria-label={dayLabel}
                        >
                          <label className={styles.dayLabel}>
                            <input
                              type="checkbox"
                              checked={day.enabled}
                              onChange={(event) =>
                                updateDay(day.dayOfWeek, {
                                  enabled: event.target.checked,
                                })
                              }
                            />
                            <span>{dayLabel}</span>
                          </label>
                          <input
                            type="time"
                            aria-label={`${dayLabel} ${copy.rentalOpens}`}
                            required
                            disabled={!day.enabled}
                            min={opens}
                            max={closes}
                            step={3600}
                            value={day.opens || opens}
                            onChange={(event) =>
                              updateDay(day.dayOfWeek, {
                                opens: event.target.value,
                              })
                            }
                          />
                          <input
                            type="time"
                            aria-label={`${dayLabel} ${copy.rentalCloses}`}
                            required
                            disabled={!day.enabled}
                            min={opens}
                            max={closes}
                            step={3600}
                            value={day.closes || closes}
                            onChange={(event) =>
                              updateDay(day.dayOfWeek, {
                                closes: event.target.value,
                              })
                            }
                          />
                        </div>
                      );
                    })}
                  </div>
                  {scheduleError && (
                    <p className="field__error" role="alert">
                      {scheduleError}
                    </p>
                  )}
                </section>
              )
            }
          </AsyncSection>
        )}
      </fieldset>
      {validation && (
        <p className="field__error" role="alert">
          {validation}
        </p>
      )}
      <MutationFeedback mutation={mutation} />
      <div className={styles.actions}>
        <button
          type="submit"
          className="btn"
          disabled={
            mutation.busy ||
            (allowRental &&
              (center.loading || !center.data || Boolean(scheduleError)))
          }
        >
          {mutation.busy ? t.common.loading : t.operations.save}
        </button>
        <button
          type="button"
          className="btn btn--secondary"
          disabled={mutation.busy}
          onClick={onCancel}
        >
          {t.operations.cancel}
        </button>
      </div>
    </form>
  );
}
