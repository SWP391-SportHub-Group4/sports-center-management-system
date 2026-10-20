"use client";

import { useState } from "react";
import { Check, Clock3, CalendarDays } from "lucide-react";
import { api } from "@/lib/apiClient";
import { useApi } from "@/lib/useApi";
import { formatMoney } from "@/lib/format";
import { useLanguage } from "@/lib/language";
import { AsyncSection, Field } from "@/components/ui";
import { useMutation } from "@/features/operations";
import type { RoomDto } from "@/lib/types";
import { CatalogFeedback } from "./manager-shared";
import { catalogApi } from "./api";
import styles from "./rental-court-setup.module.css";

const days = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
const order = [1, 2, 3, 4, 5, 6, 0];
type PriceWindow = { start: string; end: string; price: number };

export function CreateRentalCourt({
  onCancel,
  onCreated,
}: {
  onCancel: () => void;
  onCreated: (room: RoomDto) => void;
}) {
  const { t } = useLanguage();
  const copy = t.rentalCourtSetup;
  const sports = useApi((s) => catalogApi.sports(s, true), []);
  const types = useApi((s) => catalogApi.roomTypes(s), []);
  const mutation = useMutation();
  const [name, setName] = useState("");
  const [capacity, setCapacity] = useState(12);
  const [sportId, setSportId] = useState("");
  const [typeId, setTypeId] = useState("");
  const [hours, setHours] = useState(
    order.map((dayOfWeek) => ({
      dayOfWeek,
      openTimeLocal: "06:00",
      closeTimeLocal: "22:00",
      enabled: true,
    })),
  );
  const [open, setOpen] = useState("06:00");
  const [close, setClose] = useState("22:00");
  const [custom, setCustom] = useState(false);
  const [price, setPrice] = useState(100000);
  const [windows, setWindows] = useState<PriceWindow[]>([
    { start: "06:00", end: "17:00", price: 100000 },
    { start: "17:00", end: "22:00", price: 120000 },
  ]);
  const [validation, setValidation] = useState("");
  const compatible = (types.data ?? []).filter(
    (r) => r.isActive && r.sportIds.includes(Number(sportId)),
  );
  const enabled = hours.filter((h) => h.enabled);
  const ready = !!sports.data && !!types.data && !sports.error && !types.error;
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
    <section className={styles.setup} aria-labelledby="rental-court-title">
      <header className={styles.header}>
        <div>
          <h2 id="rental-court-title">{copy.title}</h2>
          <p>{copy.intro}</p>
        </div>
        <button
          className="btn btn--ghost"
          disabled={mutation.busy}
          onClick={onCancel}
        >
          {t.operations.cancel}
        </button>
      </header>
      <AsyncSection state={sports}>{() => null}</AsyncSection>
      <AsyncSection state={types}>{() => null}</AsyncSection>
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
          const rates = enabled.flatMap((h) =>
            custom
              ? windows
                  .filter(
                    (w) =>
                      w.start < h.closeTimeLocal && w.end > h.openTimeLocal,
                  )
                  .map((w) => ({
                    daysOfWeek: [days[h.dayOfWeek]],
                    startTimeLocal:
                      w.start < h.openTimeLocal ? h.openTimeLocal : w.start,
                    endTimeLocal:
                      w.end > h.closeTimeLocal ? h.closeTimeLocal : w.end,
                    pricePerHour: w.price,
                  }))
              : [
                  {
                    daysOfWeek: [days[h.dayOfWeek]],
                    startTimeLocal: h.openTimeLocal,
                    endTimeLocal: h.closeTimeLocal,
                    pricePerHour: price,
                  },
                ],
          );
          // Validate coverage before sending; the API repeats this check in the transaction.
          if (
            custom &&
            (windows.some((w) => w.end <= w.start) ||
              enabled.some((h) => {
                let cursor = h.openTimeLocal;
                const rows = rates
                  .filter((r) => r.daysOfWeek[0] === days[h.dayOfWeek])
                  .sort((a, b) =>
                    a.startTimeLocal.localeCompare(b.startTimeLocal),
                  );
                for (const row of rows) {
                  if (row.startTimeLocal !== cursor) return true;
                  cursor = row.endTimeLocal;
                }
                return cursor !== h.closeTimeLocal;
              }))
          ) {
            setValidation(copy.priceCoverage);
            return;
          }
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
                roomTypeId: Number(typeId),
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
                  <Field label={t.operations.sport} required>
                    <select
                      required
                      value={sportId}
                      onChange={(e) => {
                        setSportId(e.target.value);
                        setTypeId("");
                      }}
                    >
                      <option value="">{copy.chooseSport}</option>
                      {(sports.data ?? [])
                        .filter(
                          (s) =>
                            s.isActive &&
                            (types.data ?? []).some(
                              (r) =>
                                r.isActive && r.sportIds.includes(s.sportId),
                            ),
                        )
                        .map((s) => (
                          <option key={s.sportId} value={s.sportId}>
                            {s.name}
                          </option>
                        ))}
                    </select>
                  </Field>
                  <Field label={t.operations.roomType} required>
                    <select
                      required
                      disabled={!sportId}
                      value={typeId}
                      onChange={(e) => setTypeId(e.target.value)}
                    >
                      <option value="">{copy.chooseType}</option>
                      {compatible.map((r) => (
                        <option key={r.roomTypeId} value={r.roomTypeId}>
                          {r.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                </div>
                {ready &&
                  !types.data?.some(
                    (r) =>
                      r.isActive &&
                      r.sportIds.some((id) =>
                        sports.data?.some(
                          (s) => s.sportId === id && s.isActive,
                        ),
                      ),
                  ) && <p role="alert">{copy.noTypes}</p>}
              </section>
              <section
                className={styles.section}
                aria-labelledby="court-hours-title"
              >
                <h3 id="court-hours-title">{copy.hours}</h3>
                <p className={styles.hint}>{copy.hoursHint}</p>
                <div className={styles.applyHours}>
                  <Field label={copy.opens}>
                    <input
                      type="time"
                      required
                      step={3600}
                      value={open}
                      onChange={(e) => setOpen(e.target.value)}
                    />
                  </Field>
                  <Field label={copy.closes}>
                    <input
                      type="time"
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
                <label className={styles.dayToggle}>
                  <input
                    type="checkbox"
                    checked={custom}
                    onChange={(e) => setCustom(e.target.checked)}
                  />
                  {copy.customPrices}
                </label>
                {!custom ? (
                  <Field label={t.operations.priceHour} required>
                    {hourlyInput(price, setPrice)}
                  </Field>
                ) : (
                  <>
                    {windows.map((w, i) => (
                      <div key={i} className={styles.priceRow}>
                        <Field label={copy.from}>
                          <input
                            required
                            type="time"
                            step={3600}
                            value={w.start}
                            onChange={(e) =>
                              setWindows(
                                windows.map((r, j) =>
                                  i === j ? { ...r, start: e.target.value } : r,
                                ),
                              )
                            }
                          />
                        </Field>
                        <Field label={copy.to}>
                          <input
                            required
                            type="time"
                            step={3600}
                            value={w.end}
                            onChange={(e) =>
                              setWindows(
                                windows.map((r, j) =>
                                  i === j ? { ...r, end: e.target.value } : r,
                                ),
                              )
                            }
                          />
                        </Field>
                        <Field label={t.operations.priceHour} required>
                          {hourlyInput(w.price, (value) =>
                            setWindows(
                              windows.map((r, j) =>
                                i === j ? { ...r, price: value } : r,
                              ),
                            ),
                          )}
                        </Field>
                        <button
                          type="button"
                          className="btn btn--ghost"
                          disabled={windows.length === 1}
                          aria-label={`${copy.removeWindow} ${i + 1}`}
                          onClick={() =>
                            setWindows(windows.filter((_, j) => j !== i))
                          }
                        >
                          {t.operations.remove}
                        </button>
                      </div>
                    ))}
                    <button
                      type="button"
                      className="btn btn--secondary"
                      disabled={windows.length >= 7}
                      onClick={() =>
                        setWindows([
                          ...windows,
                          {
                            start: windows.at(-1)?.end ?? "06:00",
                            end: "22:00",
                            price,
                          },
                        ])
                      }
                    >
                      {copy.addWindow}
                    </button>
                  </>
                )}
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
                {custom ? copy.fromPrice + " " : ""}
                {formatMoney(
                  custom ? Math.min(...windows.map((w) => w.price)) : price,
                )}
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
            <button
              type="submit"
              className="btn"
              disabled={mutation.busy || !ready || !enabled.length}
            >
              {mutation.busy ? t.common.loading : copy.submit}
            </button>
          </footer>
        </fieldset>
      </form>
    </section>
  );
}
