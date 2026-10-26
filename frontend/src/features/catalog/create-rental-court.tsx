"use client";

import { useEffect, useState } from "react";
import { Check, Clock3, CalendarDays } from "lucide-react";
import { api } from "@/lib/apiClient";
import { useApi } from "@/lib/useApi";
import { formatMoney } from "@/lib/format";
import { useLanguage } from "@/lib/language";
import { AsyncSection, Field } from "@/components/ui";
import { useOperatingHoursPopup } from "@/components/OperatingHoursPopup";
import { useMutation } from "@/features/operations";
import type { RoomDto } from "@/lib/types";
import { CatalogFeedback } from "./manager-shared";
import { catalogApi } from "./api";
import { InlineCreate } from "./inline-create";
import styles from "./rental-court-setup.module.css";
import {
  loadCenterHours,
  centerHoursHint,
  centerHoursError,
  minutesToTime,
  type CenterHours,
} from "@/lib/center-hours";

const days = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
const order = [1, 2, 3, 4, 5, 6, 0];

type CreateRentalCourtProps = {
  embedded?: boolean;
  initialSportId?: number;
  onBusyChange?: (busy: boolean) => void;
  onCancel: () => void;
  onCreated: (room: RoomDto) => void;
};

export function CreateRentalCourt(props: CreateRentalCourtProps) {
  const center = useApi(loadCenterHours, []);
  return (
    <AsyncSection state={center}>
      {(hours) => <CreateRentalCourtForm {...props} center={hours} />}
    </AsyncSection>
  );
}

function CreateRentalCourtForm({
  onCancel,
  onCreated,
  initialSportId,
  onBusyChange,
  embedded = false,
  center,
}: CreateRentalCourtProps & { center: CenterHours }) {
  const { t } = useLanguage();
  const copy = t.rentalCourtSetup;
  const notice = useOperatingHoursPopup();
  const sports = useApi((s) => catalogApi.sports(s, true), []);

  const mutation = useMutation();
  useEffect(() => {
    onBusyChange?.(mutation.busy);
  }, [mutation.busy, onBusyChange]);
  const [name, setName] = useState("");
  const [capacity, setCapacity] = useState(12);
  const [sportId, setSportId] = useState(
    initialSportId ? String(initialSportId) : "",
  );
  const courtOpens = minutesToTime(Math.ceil(center.openingMinute / 60) * 60);
  const courtCloses = minutesToTime(Math.floor(center.closingMinute / 60) * 60);

  const [hours, setHours] = useState(
    order.map((dayOfWeek) => ({
      dayOfWeek,
      openTimeLocal: courtOpens,
      closeTimeLocal: courtCloses,
      enabled: true,
    })),
  );
  const [open, setOpen] = useState(courtOpens);
  const [close, setClose] = useState(courtCloses);
  const [price, setPrice] = useState(100000);
  const [validation, setValidation] = useState("");
  const enabled = hours.filter((h) => h.enabled);
  const ready = !!sports.data && !sports.error;
  const sport = sports.data?.find((s) => s.sportId === Number(sportId));
  const hourlyInput = (value: number, change: (value: number) => void) => (
    <input
      required
      type="number"
      min={2000}
      step={2000}
      value={value || ""}
      onChange={(e) => change(Number(e.target.value))}
    />
  );
  return (
    <section
      className={`${styles.setup} ${embedded ? styles.embedded : ""}`}
      aria-label={copy.title}
      onChangeCapture={(event) =>
        notice.checkTime(event, centerHoursError(center))
      }
      onInvalidCapture={(event) =>
        notice.checkTime(event, centerHoursError(center))
      }
    >
      {notice.popup}
      <header className={styles.header}>
        <div>
          {!embedded && <h2>{copy.title}</h2>}
          <p>{copy.intro}</p>
        </div>
      </header>
      <AsyncSection state={sports}>{() => null}</AsyncSection>

      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setValidation("");
          if (!enabled.length) {
            setValidation(copy.daysRequired);
            return;
          }
          if (enabled.some((h) => h.closeTimeLocal <= h.openTimeLocal)) {
            setValidation(copy.invalidHours);
            return;
          }
          if (
            enabled.some(
              (h) =>
                h.openTimeLocal < center.opens ||
                h.closeTimeLocal > center.closes,
            )
          ) {
            setValidation(centerHoursError(center));
            return;
          }
          const rates = enabled.map((h) => ({
            daysOfWeek: [days[h.dayOfWeek]],
            startTimeLocal: h.openTimeLocal,
            endTimeLocal: h.closeTimeLocal,
            pricePerHour: price,
          }));
          let result: RoomDto | undefined;
          const groupedRates = new Map<string, (typeof rates)[number]>();
          for (const rate of rates) {
            const key = `${rate.startTimeLocal}|${rate.endTimeLocal}|${rate.pricePerHour}`;
            const existing = groupedRates.get(key);
            if (existing) existing.daysOfWeek.push(...rate.daysOfWeek);
            else
              groupedRates.set(key, {
                ...rate,
                daysOfWeek: [...rate.daysOfWeek],
              });
          }
          if (
            await mutation.run(async () => {
              result = await api.post<RoomDto>("/api/rooms/rental", {
                name: name.trim(),
                capacity,
                sportId: Number(sportId),

                hours: enabled.map(
                  ({ dayOfWeek, openTimeLocal, closeTimeLocal }) => ({
                    dayOfWeek,
                    openTimeLocal,
                    closeTimeLocal,
                  }),
                ),
                rates: [...groupedRates.values()],
              });
            })
          ) {
            if (result) onCreated(result);
          }
        }}
      >
        <fieldset disabled={mutation.busy} className={styles.fields}>
          <div className={styles.layout}>
            <div className={styles.sections}>
              <section
                className={styles.section}
                aria-labelledby="court-info-title"
              >
                <h3 id="court-info-title">{copy.details}</h3>
                <div className={styles.detailsGrid}>
                  <Field label={t.operations.name} required>
                    <input
                      autoFocus
                      required
                      maxLength={100}
                      pattern=".*\S.*"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                    />
                  </Field>
                  <Field label={t.operations.capacity} required>
                    <input
                      required
                      type="number"
                      min={1}
                      max={500}
                      value={capacity || ""}
                      onChange={(e) => setCapacity(Number(e.target.value))}
                    />
                  </Field>
                  <InlineCreate
                    kind="sport"
                    onCreated={(sport) => {
                      sports.reload();
                      setSportId(String(sport.sportId));
                    }}
                  >
                    <Field label={t.operations.sport} required>
                      <select
                        required
                        value={sportId}
                        onChange={(e) => {
                          setSportId(e.target.value);
                        }}
                      >
                        <option value="">{copy.chooseSport}</option>
                        {(sports.data ?? []).map((s) => (
                          <option key={s.sportId} value={s.sportId}>
                            {s.name}
                          </option>
                        ))}
                      </select>
                    </Field>
                  </InlineCreate>
                </div>
              </section>
              <section
                className={styles.section}
                aria-labelledby="court-hours-title"
              >
                <h3 id="court-hours-title">{copy.hours}</h3>
                <p className={styles.hint}>{centerHoursHint(center)}</p>
                <p className={styles.hint}>{copy.hoursHint}</p>
                <div className={styles.applyHours}>
                  <Field label={copy.opens}>
                    <input
                      type="time"
                      min={courtOpens}
                      max={courtCloses}
                      required
                      step={3600}
                      value={open}
                      onChange={(e) => setOpen(e.target.value)}
                    />
                  </Field>
                  <Field label={copy.closes}>
                    <input
                      type="time"
                      min={courtOpens}
                      max={courtCloses}
                      required
                      step={3600}
                      value={close}
                      onChange={(e) => setClose(e.target.value)}
                    />
                  </Field>
                  <button
                    type="button"
                    className="btn btn--secondary"
                    disabled={!open || close <= open}
                    onClick={() =>
                      setHours(
                        hours.map((h) => ({
                          ...h,
                          openTimeLocal: open,
                          closeTimeLocal: close,
                        })),
                      )
                    }
                  >
                    {copy.applyAll}
                  </button>
                </div>
                <div className={styles.hoursList}>
                  {hours.map((h, index) => (
                    <div key={h.dayOfWeek} className={styles.day}>
                      <label className={styles.dayToggle}>
                        <input
                          type="checkbox"
                          checked={h.enabled}
                          onChange={(e) =>
                            setHours(
                              hours.map((r, i) =>
                                i === index
                                  ? { ...r, enabled: e.target.checked }
                                  : r,
                              ),
                            )
                          }
                        />
                        {t.operations.weekdays[h.dayOfWeek]}
                      </label>
                      {h.enabled ? (
                        <div className={styles.dayTimes}>
                          <input
                            aria-label={`${t.operations.weekdays[h.dayOfWeek]} ${copy.opens}`}
                            type="time"
                            min={courtOpens}
                            max={courtCloses}
                            required
                            step={3600}
                            value={h.openTimeLocal}
                            onChange={(e) =>
                              setHours(
                                hours.map((r, i) =>
                                  i === index
                                    ? { ...r, openTimeLocal: e.target.value }
                                    : r,
                                ),
                              )
                            }
                          />
                          <span aria-hidden="true">–</span>
                          <input
                            aria-label={`${t.operations.weekdays[h.dayOfWeek]} ${copy.closes}`}
                            type="time"
                            min={courtOpens}
                            max={courtCloses}
                            required
                            step={3600}
                            value={h.closeTimeLocal}
                            onChange={(e) =>
                              setHours(
                                hours.map((r, i) =>
                                  i === index
                                    ? { ...r, closeTimeLocal: e.target.value }
                                    : r,
                                ),
                              )
                            }
                          />
                        </div>
                      ) : (
                        <span className={styles.hint}>{copy.closed}</span>
                      )}
                    </div>
                  ))}
                </div>
              </section>
              <section
                className={styles.section}
                aria-labelledby="court-price-title"
              >
                <h3 id="court-price-title">{copy.pricing}</h3>
                <p className={styles.hint}>{copy.priceHint}</p>
                <Field label={t.operations.priceHour} required>
                  {hourlyInput(price, setPrice)}
                </Field>
              </section>
            </div>
            <aside
              className={styles.review}
              aria-labelledby="court-review-title"
            >
              <h3 id="court-review-title">{copy.review}</h3>
              <strong className={styles.courtName}>
                {name.trim() || copy.unnamed}
              </strong>
              <p>{sport?.name || copy.chooseSport}</p>
              <ul className={styles.summary}>
                <li>
                  <CalendarDays size={18} aria-hidden="true" />
                  {enabled.length} {copy.daysWeek}
                </li>
                <li>
                  <Clock3 size={18} aria-hidden="true" />
                  {copy.localTime}
                </li>
              </ul>
              <p className={styles.price}>
                {formatMoney(price)}
                <span> / {copy.hour}</span>
              </p>
              <p className={styles.promise}>
                <Check size={18} aria-hidden="true" />
                {copy.priceSync}
              </p>
              <p className={styles.hint}>{copy.bookingHint}</p>
            </aside>
          </div>
          {validation && (
            <p role="alert" className="alert alert--error">
              {validation}
            </p>
          )}
          <CatalogFeedback mutation={mutation} />
          <footer className={styles.footer}>
            <span className={styles.hint}>{copy.saveHint}</span>
            <div className={styles.actions}>
              <button
                type="button"
                className="btn btn--secondary"
                disabled={mutation.busy}
                onClick={onCancel}
              >
                {t.operations.cancel}
              </button>
              <button
                type="submit"
                className="btn"
                disabled={mutation.busy || !ready || !enabled.length}
              >
                {mutation.busy ? t.common.loading : copy.submit}
              </button>
            </div>
          </footer>
        </fieldset>
      </form>
    </section>
  );
}
